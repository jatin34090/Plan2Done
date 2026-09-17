import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, type AuthedRequest } from "../lib/auth.js";
import {
  buildDailyNarrative,
  buildRealityCheck,
  buildTomorrowSuggestion,
  calculateDailyScore
} from "../lib/scores.js";
import { generateDailySummary, parseEveningEntry, planTomorrow } from "../lib/ai.js";

const router = Router();
router.use(requireAuth);

const priorityEnum = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
const statusEnum = z.enum([
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETED",
  "PARTIAL",
  "SKIPPED",
  "CARRIED_FORWARD"
]);
const carryReasonEnum = z.enum([
  "NOT_ENOUGH_TIME",
  "LOW_PRIORITY",
  "BLOCKED",
  "UNEXPECTED_WORK",
  "TOO_LARGE",
  "NO_LONGER_RELEVANT"
]);

const goalSchema = z.object({
  title: z.string().min(1),
  plannedOutcome: z.string().optional(),
  priority: priorityEnum.default("MEDIUM"),
  expectedMinutes: z.number().int().min(0).default(0),
  importance: z.string().optional()
});

const planInclude = {
  goals: {
    include: {
      tasks: { orderBy: { order: "asc" as const } },
      timeEntries: { orderBy: { createdAt: "asc" as const } },
      reflection: true
    },
    orderBy: [{ priority: "asc" as const }, { createdAt: "asc" as const }]
  },
  unplannedWork: { orderBy: { createdAt: "asc" as const } },
  timelineEvents: { orderBy: { time: "asc" as const } },
  dailyReflection: true,
  dailySummary: true
};

// Load the full plan in a SINGLE SQL query (LATERAL joins) instead of ~20
// sequential round-trips. Critical when the DB has high network latency.
const planQuery = { relationLoadStrategy: "join" as const, include: planInclude };

/* ----------------------------- helpers ----------------------------- */

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

async function getOrCreatePlan(userId: string, date: Date) {
  // Read-first: the plan almost always exists, so this is a single round-trip.
  const existing = await prisma.dailyPlan.findUnique({
    where: { userId_date: { userId, date } },
    ...planQuery
  });
  if (existing) return existing;

  await prisma.dailyPlan.create({ data: { userId, date } });
  // findUniqueOrThrow guarantees a non-null return type (the row was just created).
  return prisma.dailyPlan.findUniqueOrThrow({
    where: { userId_date: { userId, date } },
    ...planQuery
  });
}

async function syncPlanTotals(dailyPlanId: string) {
  const plan = await prisma.dailyPlan.findUnique({
    where: { id: dailyPlanId },
    include: { goals: true, unplannedWork: true }
  });
  if (!plan) return;
  await prisma.dailyPlan.update({
    where: { id: dailyPlanId },
    data: {
      plannedMinutes: plan.goals.reduce((sum, g) => sum + g.expectedMinutes, 0),
      actualMinutes: plan.goals.reduce((sum, g) => sum + g.actualMinutes, 0),
      unplannedMinutes: plan.unplannedWork.reduce((sum, u) => sum + u.minutes, 0)
    }
  });
}

/** Confirms the plan belongs to the user; returns it or null. */
async function ownedPlan(userId: string, dailyPlanId: string) {
  const plan = await prisma.dailyPlan.findUnique({ where: { id: dailyPlanId } });
  return plan && plan.userId === userId ? plan : null;
}

/** Confirms the goal belongs to the user; returns it (with plan) or null. */
async function ownedGoal(userId: string, goalId: string) {
  const goal = await prisma.goal.findUnique({ where: { id: goalId }, include: { dailyPlan: true } });
  return goal && goal.dailyPlan.userId === userId ? goal : null;
}

/* ----------------------------- plans ----------------------------- */

router.get("/today", async (req: AuthedRequest, res, next) => {
  try {
    const plan = await getOrCreatePlan(req.userId!, startOfDay(new Date()));
    res.json(plan);
  } catch (error) {
    next(error);
  }
});

// History list: /daily-plans?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/", async (req: AuthedRequest, res, next) => {
  try {
    const { from, to } = req.query as { from?: string; to?: string };
    const where: { userId: string; date?: { gte?: Date; lte?: Date } } = { userId: req.userId! };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = startOfDay(new Date(from));
      if (to) where.date.lte = startOfDay(new Date(to));
    }
    const plans = await prisma.dailyPlan.findMany({
      where,
      ...planQuery,
      orderBy: { date: "desc" },
      take: 120
    });
    res.json(plans);
  } catch (error) {
    next(error);
  }
});

router.get("/:date", async (req: AuthedRequest, res, next) => {
  try {
    const parsed = new Date(req.params.date);
    if (Number.isNaN(parsed.getTime())) {
      res.status(400).json({ message: "Invalid date" });
      return;
    }
    const plan = await getOrCreatePlan(req.userId!, startOfDay(parsed));
    res.json(plan);
  } catch (error) {
    next(error);
  }
});

router.patch("/:dailyPlanId", async (req: AuthedRequest, res, next) => {
  try {
    if (!(await ownedPlan(req.userId!, req.params.dailyPlanId))) {
      res.status(404).json({ message: "Plan not found" });
      return;
    }
    const data = z
      .object({
        whyTodayMatters: z.string().optional(),
        stage: z.enum(["MORNING_PLAN", "EXECUTION", "REFLECTION"]).optional()
      })
      .parse(req.body);
    const plan = await prisma.dailyPlan.update({
      where: { id: req.params.dailyPlanId },
      data,
      ...planQuery
    });
    res.json(plan);
  } catch (error) {
    next(error);
  }
});

/* ----------------------------- goals ----------------------------- */

router.post("/:dailyPlanId/goals", async (req: AuthedRequest, res, next) => {
  try {
    if (!(await ownedPlan(req.userId!, req.params.dailyPlanId))) {
      res.status(404).json({ message: "Plan not found" });
      return;
    }
    const data = goalSchema.parse(req.body);
    const goal = await prisma.goal.create({
      data: { ...data, dailyPlanId: req.params.dailyPlanId },
      include: { tasks: true, timeEntries: true, reflection: true }
    });
    await syncPlanTotals(req.params.dailyPlanId);
    res.status(201).json(goal);
  } catch (error) {
    next(error);
  }
});

router.patch("/goals/:goalId", async (req: AuthedRequest, res, next) => {
  try {
    const owned = await ownedGoal(req.userId!, req.params.goalId);
    if (!owned) {
      res.status(404).json({ message: "Goal not found" });
      return;
    }
    const data = z
      .object({
        title: z.string().min(1).optional(),
        plannedOutcome: z.string().optional(),
        actualOutcome: z.string().optional(),
        priority: priorityEnum.optional(),
        status: statusEnum.optional(),
        expectedMinutes: z.number().int().min(0).optional(),
        actualMinutes: z.number().int().min(0).optional(),
        importance: z.string().optional(),
        blocker: z.string().optional()
      })
      .parse(req.body);

    const goal = await prisma.goal.update({
      where: { id: req.params.goalId },
      data,
      include: { tasks: true, timeEntries: true, reflection: true }
    });
    await syncPlanTotals(goal.dailyPlanId);
    res.json(goal);
  } catch (error) {
    next(error);
  }
});

router.delete("/goals/:goalId", async (req: AuthedRequest, res, next) => {
  try {
    const owned = await ownedGoal(req.userId!, req.params.goalId);
    if (!owned) {
      res.status(404).json({ message: "Goal not found" });
      return;
    }
    await prisma.goal.delete({ where: { id: req.params.goalId } });
    await syncPlanTotals(owned.dailyPlanId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// Carry an unfinished goal forward to another day, with a reason.
router.post("/goals/:goalId/carry-forward", async (req: AuthedRequest, res, next) => {
  try {
    const owned = await ownedGoal(req.userId!, req.params.goalId);
    if (!owned) {
      res.status(404).json({ message: "Goal not found" });
      return;
    }
    const { reason, targetDate } = z
      .object({ reason: carryReasonEnum, targetDate: z.string() })
      .parse(req.body);

    const target = startOfDay(new Date(targetDate));
    const targetPlan = await getOrCreatePlan(req.userId!, target);

    // Mark the original as carried forward and record the reason.
    await prisma.goal.update({
      where: { id: owned.id },
      data: {
        status: "CARRIED_FORWARD",
        carryForwardReason: reason,
        carryForwardTargetDate: target
      }
    });

    // Create a fresh copy on the target day.
    const copy = await prisma.goal.create({
      data: {
        dailyPlanId: targetPlan.id,
        title: owned.title,
        plannedOutcome: owned.plannedOutcome,
        priority: owned.priority,
        expectedMinutes: owned.expectedMinutes,
        importance: owned.importance
      },
      include: { tasks: true, timeEntries: true, reflection: true }
    });
    await syncPlanTotals(owned.dailyPlanId);
    await syncPlanTotals(targetPlan.id);
    res.status(201).json({ carried: copy, targetPlanId: targetPlan.id });
  } catch (error) {
    next(error);
  }
});

/* ----------------------------- subtasks ----------------------------- */

router.post("/goals/:goalId/tasks", async (req: AuthedRequest, res, next) => {
  try {
    const owned = await ownedGoal(req.userId!, req.params.goalId);
    if (!owned) {
      res.status(404).json({ message: "Goal not found" });
      return;
    }
    const data = z
      .object({ title: z.string().min(1), parentId: z.string().optional() })
      .parse(req.body);
    const count = await prisma.goalTask.count({ where: { goalId: owned.id } });
    const task = await prisma.goalTask.create({
      data: { goalId: owned.id, title: data.title, parentId: data.parentId, order: count }
    });
    res.status(201).json(task);
  } catch (error) {
    next(error);
  }
});

router.patch("/tasks/:taskId", async (req: AuthedRequest, res, next) => {
  try {
    const task = await prisma.goalTask.findUnique({
      where: { id: req.params.taskId },
      include: { goal: { include: { dailyPlan: true } } }
    });
    if (!task || task.goal.dailyPlan.userId !== req.userId) {
      res.status(404).json({ message: "Task not found" });
      return;
    }
    const data = z
      .object({ title: z.string().min(1).optional(), status: statusEnum.optional() })
      .parse(req.body);
    const updated = await prisma.goalTask.update({ where: { id: task.id }, data });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

router.delete("/tasks/:taskId", async (req: AuthedRequest, res, next) => {
  try {
    const task = await prisma.goalTask.findUnique({
      where: { id: req.params.taskId },
      include: { goal: { include: { dailyPlan: true } } }
    });
    if (!task || task.goal.dailyPlan.userId !== req.userId) {
      res.status(404).json({ message: "Task not found" });
      return;
    }
    await prisma.goalTask.delete({ where: { id: task.id } });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/* ----------------------------- unplanned work ----------------------------- */

router.post("/:dailyPlanId/unplanned-work", async (req: AuthedRequest, res, next) => {
  try {
    if (!(await ownedPlan(req.userId!, req.params.dailyPlanId))) {
      res.status(404).json({ message: "Plan not found" });
      return;
    }
    const data = z
      .object({
        title: z.string().min(1),
        minutes: z.number().int().min(0).default(0),
        notes: z.string().optional()
      })
      .parse(req.body);
    const work = await prisma.unplannedWork.create({
      data: { ...data, dailyPlanId: req.params.dailyPlanId }
    });
    await syncPlanTotals(req.params.dailyPlanId);
    res.status(201).json(work);
  } catch (error) {
    next(error);
  }
});

router.delete("/unplanned-work/:id", async (req: AuthedRequest, res, next) => {
  try {
    const work = await prisma.unplannedWork.findUnique({
      where: { id: req.params.id },
      include: { dailyPlan: true }
    });
    if (!work || work.dailyPlan.userId !== req.userId) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    await prisma.unplannedWork.delete({ where: { id: work.id } });
    await syncPlanTotals(work.dailyPlanId);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

/* ----------------------------- timeline ----------------------------- */

router.post("/:dailyPlanId/timeline", async (req: AuthedRequest, res, next) => {
  try {
    if (!(await ownedPlan(req.userId!, req.params.dailyPlanId))) {
      res.status(404).json({ message: "Plan not found" });
      return;
    }
    const data = z
      .object({
        label: z.string().min(1),
        time: z.string().optional(),
        kind: z.enum(["PLANNED", "ACTUAL", "UNPLANNED", "BREAK"]).default("ACTUAL"),
        minutes: z.number().int().min(0).optional()
      })
      .parse(req.body);
    const event = await prisma.timelineEvent.create({
      data: {
        dailyPlanId: req.params.dailyPlanId,
        label: data.label,
        kind: data.kind,
        minutes: data.minutes,
        time: data.time ? new Date(data.time) : new Date()
      }
    });
    res.status(201).json(event);
  } catch (error) {
    next(error);
  }
});

/* ----------------------------- reflection + closure ----------------------------- */

router.post("/:dailyPlanId/reflection", async (req: AuthedRequest, res, next) => {
  try {
    if (!(await ownedPlan(req.userId!, req.params.dailyPlanId))) {
      res.status(404).json({ message: "Plan not found" });
      return;
    }
    const data = z
      .object({
        accomplishments: z.string().optional(),
        incompleteWork: z.string().optional(),
        incompleteReason: z.string().optional(),
        unexpectedWork: z.string().optional(),
        lesson: z.string().optional(),
        biggestAchievement: z.string().optional(),
        biggestBlocker: z.string().optional(),
        moveToTomorrow: z.string().optional()
      })
      .parse(req.body);
    const reflection = await prisma.dailyReflection.upsert({
      where: { dailyPlanId: req.params.dailyPlanId },
      create: { ...data, dailyPlanId: req.params.dailyPlanId },
      update: data
    });
    res.json(reflection);
  } catch (error) {
    next(error);
  }
});

router.post("/:dailyPlanId/close", async (req: AuthedRequest, res, next) => {
  try {
    if (!(await ownedPlan(req.userId!, req.params.dailyPlanId))) {
      res.status(404).json({ message: "Plan not found" });
      return;
    }
    const overallRating = z
      .object({ overallRating: z.number().int().min(0).max(10).optional() })
      .parse(req.body).overallRating;

    const plan = await prisma.dailyPlan.update({
      where: { id: req.params.dailyPlanId },
      data: { closedAt: new Date(), stage: "REFLECTION", overallRating },
      ...planQuery
    });

    const scores = calculateDailyScore(plan);
    const ai = await generateDailySummary(plan);
    const summary = await prisma.dailySummary.upsert({
      where: { dailyPlanId: plan.id },
      create: {
        dailyPlanId: plan.id,
        completionRate: scores.completionScore,
        dailyScore: scores.dailyScore,
        priorityScore: scores.priorityScore,
        estimationScore: scores.estimationScore,
        reflectionScore: scores.reflectionScore,
        narrative: ai.narrative,
        tomorrowSuggestion: ai.tomorrowSuggestion,
        realityCheck: ai.realityCheck
      },
      update: {
        completionRate: scores.completionScore,
        dailyScore: scores.dailyScore,
        priorityScore: scores.priorityScore,
        estimationScore: scores.estimationScore,
        reflectionScore: scores.reflectionScore,
        narrative: ai.narrative,
        tomorrowSuggestion: ai.tomorrowSuggestion,
        realityCheck: ai.realityCheck
      }
    });

    res.json({ plan, summary, aiSource: ai.source });
  } catch (error) {
    next(error);
  }
});

// Regenerate the AI/heuristic summary without re-closing the day.
router.post("/:dailyPlanId/ai-summary", async (req: AuthedRequest, res, next) => {
  try {
    if (!(await ownedPlan(req.userId!, req.params.dailyPlanId))) {
      res.status(404).json({ message: "Plan not found" });
      return;
    }
    const plan = await prisma.dailyPlan.findUnique({
      where: { id: req.params.dailyPlanId },
      ...planQuery
    });
    if (!plan) {
      res.status(404).json({ message: "Plan not found" });
      return;
    }
    const scores = calculateDailyScore(plan);
    const ai = await generateDailySummary(plan);
    const summary = await prisma.dailySummary.upsert({
      where: { dailyPlanId: plan.id },
      create: {
        dailyPlanId: plan.id,
        completionRate: scores.completionScore,
        dailyScore: scores.dailyScore,
        priorityScore: scores.priorityScore,
        estimationScore: scores.estimationScore,
        reflectionScore: scores.reflectionScore,
        narrative: ai.narrative,
        tomorrowSuggestion: ai.tomorrowSuggestion,
        realityCheck: ai.realityCheck
      },
      update: {
        narrative: ai.narrative,
        tomorrowSuggestion: ai.tomorrowSuggestion,
        realityCheck: ai.realityCheck
      }
    });
    res.json({ summary, aiSource: ai.source });
  } catch (error) {
    next(error);
  }
});

// Natural-language evening note -> structured entries (applied to the plan).
router.post("/:dailyPlanId/parse-evening", async (req: AuthedRequest, res, next) => {
  try {
    if (!(await ownedPlan(req.userId!, req.params.dailyPlanId))) {
      res.status(404).json({ message: "Plan not found" });
      return;
    }
    const { text, apply } = z.object({ text: z.string().min(1), apply: z.boolean().default(false) }).parse(req.body);
    const plan = await prisma.dailyPlan.findUnique({
      where: { id: req.params.dailyPlanId },
      ...planQuery
    });
    if (!plan) {
      res.status(404).json({ message: "Plan not found" });
      return;
    }
    const parsed = await parseEveningEntry(text, plan);

    if (apply) {
      for (const title of parsed.completed) {
        const goal = plan.goals.find((g) => g.title.toLowerCase() === title.toLowerCase());
        if (goal) await prisma.goal.update({ where: { id: goal.id }, data: { status: "COMPLETED" } });
      }
      for (const title of parsed.partial) {
        const goal = plan.goals.find((g) => g.title.toLowerCase() === title.toLowerCase());
        if (goal) await prisma.goal.update({ where: { id: goal.id }, data: { status: "PARTIAL" } });
      }
      for (const item of parsed.unplanned) {
        await prisma.unplannedWork.create({
          data: { dailyPlanId: plan.id, title: item.title, minutes: item.minutes || 0 }
        });
      }
      await syncPlanTotals(plan.id);
    }

    res.json(parsed);
  } catch (error) {
    next(error);
  }
});

// Suggest tomorrow's plan from unfinished goals + capacity.
router.post("/:dailyPlanId/plan-tomorrow", async (req: AuthedRequest, res, next) => {
  try {
    const plan = await prisma.dailyPlan.findUnique({
      where: { id: req.params.dailyPlanId },
      include: { goals: true }
    });
    if (!plan || plan.userId !== req.userId) {
      res.status(404).json({ message: "Plan not found" });
      return;
    }
    const { availableMinutes } = z
      .object({ availableMinutes: z.number().int().min(0).default(360) })
      .parse(req.body);

    const unfinished = plan.goals.filter((g) => g.status !== "COMPLETED" && g.status !== "CARRIED_FORWARD");

    // Average completed goals/day over the last 30 days — only count days that
    // actually had goals, so a new user isn't given fabricated "history".
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const recent = await prisma.dailyPlan.findMany({
      where: { userId: req.userId!, date: { gte: startOfDay(since) } },
      include: { goals: true }
    });
    const activeDays = recent.filter((p) => p.goals.length > 0);
    const completedCounts = activeDays.map((p) => p.goals.filter((g) => g.status === "COMPLETED").length);
    const avg = completedCounts.length
      ? completedCounts.reduce((a, b) => a + b, 0) / completedCounts.length
      : 0;

    const suggestion = await planTomorrow(unfinished, availableMinutes, avg, activeDays.length);
    res.json(suggestion);
  } catch (error) {
    next(error);
  }
});

// Full-text search across goals + reflections.
router.get("/search/:query", async (req: AuthedRequest, res, next) => {
  try {
    const q = req.params.query;
    const goals = await prisma.goal.findMany({
      where: {
        dailyPlan: { userId: req.userId! },
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { actualOutcome: { contains: q, mode: "insensitive" } },
          { plannedOutcome: { contains: q, mode: "insensitive" } }
        ]
      },
      include: { dailyPlan: { select: { id: true, date: true } } },
      orderBy: { createdAt: "desc" },
      take: 50
    });
    res.json({ goals });
  } catch (error) {
    next(error);
  }
});

export { router as dailyPlansRouter };
