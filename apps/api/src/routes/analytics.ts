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
