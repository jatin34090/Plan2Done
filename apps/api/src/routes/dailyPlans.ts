import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { buildDailyNarrative, buildRealityCheck, buildTomorrowSuggestion, calculateDailyScore } from "../lib/scores.js";

const router = Router();

const userId = "demo-user";

const goalSchema = z.object({
  title: z.string().min(1),
  plannedOutcome: z.string().optional(),
  priority: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  expectedMinutes: z.number().int().min(0).default(0),
  importance: z.string().optional()
});

router.get("/today", async (_req, res, next) => {
  try {
    const today = startOfDay(new Date());
    const plan = await getOrCreatePlan(today);
    res.json(plan);
  } catch (error) {
    next(error);
  }
});

router.get("/:date", async (req, res, next) => {
  try {
    const date = startOfDay(new Date(req.params.date));
    const plan = await getOrCreatePlan(date);
    res.json(plan);
  } catch (error) {
    next(error);
  }
});

router.post("/:dailyPlanId/goals", async (req, res, next) => {
  try {
    const data = goalSchema.parse(req.body);
    const goal = await prisma.goal.create({
      data: {
        ...data,
        dailyPlanId: req.params.dailyPlanId
      }
    });
    await syncPlanTotals(req.params.dailyPlanId);
    res.status(201).json(goal);
  } catch (error) {
    next(error);
  }
});

router.patch("/goals/:goalId", async (req, res, next) => {
  try {
    const data = z.object({
      title: z.string().min(1).optional(),
      actualOutcome: z.string().optional(),
      status: z.enum(["PLANNED", "IN_PROGRESS", "COMPLETED", "PARTIAL", "SKIPPED", "CARRIED_FORWARD"]).optional(),
      actualMinutes: z.number().int().min(0).optional(),
      blocker: z.string().optional()
    }).parse(req.body);

    const goal = await prisma.goal.update({
      where: { id: req.params.goalId },
      data
    });
    await syncPlanTotals(goal.dailyPlanId);
    res.json(goal);
  } catch (error) {
    next(error);
  }
});

router.post("/:dailyPlanId/unplanned-work", async (req, res, next) => {
  try {
    const data = z.object({
      title: z.string().min(1),
      minutes: z.number().int().min(0).default(0),
      notes: z.string().optional()
    }).parse(req.body);
    const work = await prisma.unplannedWork.create({
      data: { ...data, dailyPlanId: req.params.dailyPlanId }
    });
    await syncPlanTotals(req.params.dailyPlanId);
    res.status(201).json(work);
  } catch (error) {
    next(error);
  }
});

router.post("/:dailyPlanId/reflection", async (req, res, next) => {
  try {
    const data = z.object({
      accomplishments: z.string().optional(),
      incompleteWork: z.string().optional(),
      incompleteReason: z.string().optional(),
      unexpectedWork: z.string().optional(),
      lesson: z.string().optional(),
      biggestAchievement: z.string().optional(),
      biggestBlocker: z.string().optional(),
      moveToTomorrow: z.string().optional()
    }).parse(req.body);

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

router.post("/:dailyPlanId/close", async (req, res, next) => {
  try {
    const plan = await prisma.dailyPlan.update({
      where: { id: req.params.dailyPlanId },
      data: {
        closedAt: new Date(),
        overallRating: z.object({ overallRating: z.number().int().min(1).max(10).optional() }).parse(req.body).overallRating
      },
      include: planInclude
    });

    const scores = calculateDailyScore(plan);
    const summary = await prisma.dailySummary.upsert({
      where: { dailyPlanId: plan.id },
      create: {
        dailyPlanId: plan.id,
        completionRate: scores.completionScore,
        dailyScore: scores.dailyScore,
        priorityScore: scores.priorityScore,
        estimationScore: scores.estimationScore,
        reflectionScore: scores.reflectionScore,
        narrative: buildDailyNarrative(plan),
        tomorrowSuggestion: buildTomorrowSuggestion(plan),
        realityCheck: buildRealityCheck(plan)
      },
      update: {
        completionRate: scores.completionScore,
        dailyScore: scores.dailyScore,
        priorityScore: scores.priorityScore,
        estimationScore: scores.estimationScore,
        reflectionScore: scores.reflectionScore,
        narrative: buildDailyNarrative(plan),
        tomorrowSuggestion: buildTomorrowSuggestion(plan),
        realityCheck: buildRealityCheck(plan)
      }
    });

    res.json({ plan, summary });
  } catch (error) {
    next(error);
  }
});

const planInclude = {
  goals: {
    include: {
      tasks: true,
      timeEntries: true,
      reflection: true
    },
    orderBy: [{ priority: "asc" as const }, { createdAt: "asc" as const }]
  },
  unplannedWork: true,
  timelineEvents: { orderBy: { time: "asc" as const } },
  dailyReflection: true,
  dailySummary: true
};

async function getOrCreatePlan(date: Date) {
  await prisma.user.upsert({
    where: { id: userId },
    create: { id: userId, email: "demo@plan2done.local", name: "Demo User" },
    update: {}
  });

  return prisma.dailyPlan.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date },
    update: {},
    include: planInclude
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
      plannedMinutes: plan.goals.reduce((sum, goal) => sum + goal.expectedMinutes, 0),
      actualMinutes: plan.goals.reduce((sum, goal) => sum + goal.actualMinutes, 0),
      unplannedMinutes: plan.unplannedWork.reduce((sum, item) => sum + item.minutes, 0)
    }
  });
}

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

export { router as dailyPlansRouter };
