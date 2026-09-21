import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth, type AuthedRequest } from "../lib/auth.js";
import { calculateCompletionRate, formatMinutes } from "../lib/scores.js";

const router = Router();
router.use(requireAuth);

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function startOfDay(date: Date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

/* ----------------------------- weekly review ----------------------------- */

router.get("/weekly", async (req: AuthedRequest, res, next) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const plans = await prisma.dailyPlan.findMany({
      where: { userId: req.userId!, date: { gte: startOfDay(since) } },
      include: { goals: true, unplannedWork: true, dailySummary: true, dailyReflection: true },
      orderBy: { date: "asc" }
    });

    const goals = plans.flatMap((p) => p.goals);
    const completed = goals.filter((g) => g.status === "COMPLETED").length;
    const estimatedMinutes = plans.reduce((s, p) => s + p.plannedMinutes, 0);
    const actualMinutes = plans.reduce((s, p) => s + p.actualMinutes + p.unplannedMinutes, 0);
    const productiveDay = [...plans].sort(
      (a, b) => (b.dailySummary?.dailyScore ?? 0) - (a.dailySummary?.dailyScore ?? 0)
    )[0];

    // Most common carry-forward reason as "common blocker".
    const reasonCounts: Record<string, number> = {};
    for (const g of goals) if (g.carryForwardReason) reasonCounts[g.carryForwardReason] = (reasonCounts[g.carryForwardReason] ?? 0) + 1;
    const commonBlocker = Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    res.json({
      goalsPlanned: goals.length,
      goalsCompleted: completed,
      completionRate: calculateCompletionRate(goals),
      estimatedTime: formatMinutes(estimatedMinutes),
      actualTime: formatMinutes(actualMinutes),
      mostProductiveDay: productiveDay?.date ?? null,
      carriedOverGoals: goals.filter((g) => g.status === "CARRIED_FORWARD").length,
      topAchievement:
        plans.map((p) => p.dailyReflection?.biggestAchievement).find(Boolean) ??
        goals.find((g) => g.status === "COMPLETED")?.title ??
        null,
      unplannedWorkMinutes: plans.reduce((s, p) => s + p.unplannedMinutes, 0),
      commonBlocker
    });
  } catch (error) {
    next(error);
  }
});

/* ----------------------------- long-term overview ----------------------------- */

router.get("/overview", async (req: AuthedRequest, res, next) => {
  try {
    const days = Math.min(365, Math.max(7, Number((req.query.days as string) ?? 90)));
    const since = new Date();
    since.setDate(since.getDate() - days);

    const plans = await prisma.dailyPlan.findMany({
      where: { userId: req.userId!, date: { gte: startOfDay(since) } },
      include: { goals: true },
      orderBy: { date: "asc" }
    });

    const activePlans = plans.filter((p) => p.goals.length > 0);
    const allGoals = plans.flatMap((p) => p.goals);
    const dayCount = activePlans.length || 1;

    // Blocker breakdown from carry-forward reasons.
    const reasonCounts: Record<string, number> = {};
    for (const g of allGoals) if (g.carryForwardReason) reasonCounts[g.carryForwardReason] = (reasonCounts[g.carryForwardReason] ?? 0) + 1;
    const totalReasons = Object.values(reasonCounts).reduce((a, b) => a + b, 0) || 1;
    const blockers = Object.entries(reasonCounts)
      .map(([reason, count]) => ({ reason, count, percent: Math.round((count / totalReasons) * 100) }))
      .sort((a, b) => b.count - a.count);

    // Completion rate by weekday.
    const byWeekday: Record<number, { completedValue: number; total: number }> = {};
    for (const p of activePlans) {
      const wd = p.date.getUTCDay();
      byWeekday[wd] ??= { completedValue: 0, total: 0 };
      byWeekday[wd].completedValue += p.goals.filter((g) => g.status === "COMPLETED").length;
      byWeekday[wd].total += p.goals.length;
    }
    const productiveDays = Object.entries(byWeekday)
      .map(([wd, v]) => ({
        day: WEEKDAYS[Number(wd)],
        completion: v.total ? Math.round((v.completedValue / v.total) * 100) : 0
      }))
      .sort((a, b) => b.completion - a.completion);

    res.json({
      days,
      averageGoalsPerDay: Number((allGoals.length / dayCount).toFixed(1)),
      averageCompletion: calculateCompletionRate(allGoals),
      averageWorkMinutes: Math.round(
        activePlans.reduce((s, p) => s + p.actualMinutes + p.unplannedMinutes, 0) / dayCount
      ),
      averagePlannedMinutes: Math.round(activePlans.reduce((s, p) => s + p.plannedMinutes, 0) / dayCount),
      totalGoals: allGoals.length,
      totalCompleted: allGoals.filter((g) => g.status === "COMPLETED").length,
      blockers,
      productiveDays
    });
  } catch (error) {
    next(error);
  }
});

/* ----------------------------- date range (for "all time") ----------------------------- */

// Earliest & latest days the user has any plan for — powers the "All time" report range.
router.get("/range", async (req: AuthedRequest, res, next) => {
  try {
    const [first, last] = await Promise.all([
      prisma.dailyPlan.findFirst({
        where: { userId: req.userId! },
        orderBy: { date: "asc" },
        select: { date: true }
      }),
      prisma.dailyPlan.findFirst({
        where: { userId: req.userId! },
        orderBy: { date: "desc" },
        select: { date: true }
      })
    ]);
    res.json({ firstDate: first?.date ?? null, lastDate: last?.date ?? null });
  } catch (error) {
    next(error);
  }
});

/* ----------------------------- flexible report (day / month / year / custom range) ----------------------------- */

type ReportGroup = "day" | "month" | "year";

function bucketKey(date: Date, group: ReportGroup) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  if (group === "year") return `${y}`;
  if (group === "month") return `${y}-${m}`;
  return `${y}-${m}-${d}`;
}

router.get("/report", async (req: AuthedRequest, res, next) => {
  try {
    const group: ReportGroup = ["day", "month", "year"].includes(String(req.query.group))
      ? (req.query.group as ReportGroup)
      : "day";

    const to = req.query.to ? startOfDay(new Date(String(req.query.to))) : startOfDay(new Date());
    let from: Date;
    if (req.query.from) {
      from = startOfDay(new Date(String(req.query.from)));
    } else {
      from = new Date(to);
      from.setUTCDate(from.getUTCDate() - 29); // default: last 30 days
    }
    // Include the whole `to` day (plans are stored at UTC start-of-day, so lte `to` is enough,
    // but guard against callers passing a mid-day timestamp).
    const toInclusive = new Date(to);
    toInclusive.setUTCHours(23, 59, 59, 999);

    const plans = await prisma.dailyPlan.findMany({
      where: { userId: req.userId!, date: { gte: from, lte: toInclusive } },
      include: { goals: true, dailySummary: true },
      orderBy: { date: "desc" }
    });

    interface Acc {
      key: string;
      goals: number;
      completed: number;
      partial: number;
      carried: number;
      plannedMinutes: number;
      workedMinutes: number;
      scoreSum: number;
      scoreDays: number;
      days: number;
    }
    const map = new Map<string, Acc>();
    for (const p of plans) {
      if (p.goals.length === 0) continue; // only days with real activity
      const key = bucketKey(p.date, group);
      const b: Acc =
        map.get(key) ??
        { key, goals: 0, completed: 0, partial: 0, carried: 0, plannedMinutes: 0, workedMinutes: 0, scoreSum: 0, scoreDays: 0, days: 0 };
      b.goals += p.goals.length;
      b.completed += p.goals.filter((g) => g.status === "COMPLETED").length;
      b.partial += p.goals.filter((g) => g.status === "PARTIAL").length;
      b.carried += p.goals.filter((g) => g.status === "CARRIED_FORWARD").length;
      b.plannedMinutes += p.plannedMinutes;
      b.workedMinutes += p.actualMinutes + p.unplannedMinutes;
      if (p.dailySummary) {
        b.scoreSum += p.dailySummary.dailyScore;
        b.scoreDays += 1;
      }
      b.days += 1;
      map.set(key, b);
    }

    const buckets = [...map.values()]
      .map((b) => ({
        key: b.key,
        goals: b.goals,
        completed: b.completed,
        partial: b.partial,
        carried: b.carried,
        completionRate: b.goals ? Math.round((b.completed / b.goals) * 100) : 0,
        plannedMinutes: b.plannedMinutes,
        workedMinutes: b.workedMinutes,
        avgScore: b.scoreDays ? Math.round(b.scoreSum / b.scoreDays) : null,
        days: b.days
      }))
      // Zero-padded keys sort chronologically as strings; newest first.
      .sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0));

    const totals = buckets.reduce(
      (t, b) => ({
        goals: t.goals + b.goals,
        completed: t.completed + b.completed,
        carried: t.carried + b.carried,
        plannedMinutes: t.plannedMinutes + b.plannedMinutes,
        workedMinutes: t.workedMinutes + b.workedMinutes,
        activeDays: t.activeDays + b.days
      }),
      { goals: 0, completed: 0, carried: 0, plannedMinutes: 0, workedMinutes: 0, activeDays: 0 }
    );

    res.json({
      group,
      from,
      to,
      buckets,
      totals: {
        ...totals,
        completionRate: totals.goals ? Math.round((totals.completed / totals.goals) * 100) : 0
      }
    });
  } catch (error) {
    next(error);
  }
});

/* ----------------------------- estimation accuracy ----------------------------- */

router.get("/estimation", async (req: AuthedRequest, res, next) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const goals = await prisma.goal.findMany({
      where: {
        dailyPlan: { userId: req.userId! },
        expectedMinutes: { gt: 0 },
        actualMinutes: { gt: 0 }
      }
    });

    if (goals.length === 0) {
      res.json({ sampleSize: 0, biasPercent: 0, tendency: "unknown", message: "Log estimated and actual time on a few goals to unlock estimation insights." });
      return;
    }

    const ratios = goals.map((g) => g.actualMinutes / g.expectedMinutes);
    const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const biasPercent = Math.round((avgRatio - 1) * 100);
    const tendency = biasPercent > 10 ? "underestimate" : biasPercent < -10 ? "overestimate" : "accurate";

    let message: string;
    if (tendency === "underestimate") message = `You usually underestimate tasks by about ${Math.abs(biasPercent)}%. Add a buffer when planning.`;
    else if (tendency === "overestimate") message = `You tend to overestimate tasks by about ${Math.abs(biasPercent)}%. You may be able to plan a bit more.`;
    else message = "Your time estimates are quite accurate. Keep it up.";

    res.json({ sampleSize: goals.length, biasPercent, tendency, message });
  } catch (error) {
    next(error);
  }
});

/* ----------------------------- streak + reality check ----------------------------- */

router.get("/streak", async (req: AuthedRequest, res, next) => {
  try {
    const plans = await prisma.dailyPlan.findMany({
      where: { userId: req.userId! },
      include: { goals: true },
      orderBy: { date: "desc" },
      take: 400
    });

    const planned = new Set(
      plans.filter((p) => p.goals.length > 0).map((p) => p.date.toISOString().slice(0, 10))
    );

    // Count consecutive days back from today (or yesterday) that have a plan.
    let streak = 0;
    const cursor = startOfDay(new Date());
    // Allow today to be empty without breaking the streak.
    if (!planned.has(cursor.toISOString().slice(0, 10))) cursor.setUTCDate(cursor.getUTCDate() - 1);
    while (planned.has(cursor.toISOString().slice(0, 10))) {
      streak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }

    // Reality check: today's planned goals vs typical completed.
    const recent = plans.slice(0, 30);
    const completedCounts = recent.map((p) => p.goals.filter((g) => g.status === "COMPLETED").length);
    const typicalCompleted = completedCounts.length
      ? Math.round(completedCounts.reduce((a, b) => a + b, 0) / completedCounts.length)
      : null;
    const todayKey = startOfDay(new Date()).toISOString().slice(0, 10);
    const todayPlanned = plans.find((p) => p.date.toISOString().slice(0, 10) === todayKey)?.goals.length ?? 0;

    let realityCheck: string | null = null;
    if (typicalCompleted !== null && todayPlanned > typicalCompleted + 2) {
      realityCheck = `You planned ${todayPlanned} goals today, but you historically complete about ${typicalCompleted}/day. Consider focusing on ${typicalCompleted + 1}.`;
    }

    res.json({ streak, typicalCompleted, todayPlanned, realityCheck });
  } catch (error) {
    next(error);
  }
});

export { router as analyticsRouter };
