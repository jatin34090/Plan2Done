import { Router } from "express";
import { prisma } from "../prisma.js";
import { calculateCompletionRate, formatMinutes } from "../lib/scores.js";

const router = Router();
const userId = "demo-user";

router.get("/weekly", async (_req, res, next) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const plans = await prisma.dailyPlan.findMany({
      where: { userId, date: { gte: since } },
      include: { goals: true, unplannedWork: true, dailySummary: true },
      orderBy: { date: "asc" }
    });

    const goals = plans.flatMap((plan) => plan.goals);
    const completed = goals.filter((goal) => goal.status === "COMPLETED").length;
    const estimatedMinutes = plans.reduce((sum, plan) => sum + plan.plannedMinutes, 0);
    const actualMinutes = plans.reduce((sum, plan) => sum + plan.actualMinutes + plan.unplannedMinutes, 0);
    const productiveDay = [...plans]
      .sort((a, b) => (b.dailySummary?.dailyScore ?? 0) - (a.dailySummary?.dailyScore ?? 0))[0];

    res.json({
      goalsPlanned: goals.length,
      goalsCompleted: completed,
      completionRate: calculateCompletionRate(goals),
      estimatedTime: formatMinutes(estimatedMinutes),
      actualTime: formatMinutes(actualMinutes),
      mostProductiveDay: productiveDay?.date ?? null,
      carriedOverGoals: goals.filter((goal) => goal.status === "CARRIED_FORWARD").length,
      topAchievement: goals.find((goal) => goal.status === "COMPLETED")?.title ?? null,
      unplannedWorkMinutes: plans.reduce((sum, plan) => sum + plan.unplannedMinutes, 0)
    });
  } catch (error) {
    next(error);
  }
});

export { router as analyticsRouter };
