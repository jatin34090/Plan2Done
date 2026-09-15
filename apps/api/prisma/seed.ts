import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_EMAIL = "demo@plan2done.local";
const DEMO_PASSWORD = "demopass123";

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { id: "demo-user" },
    create: { id: "demo-user", email: DEMO_EMAIL, name: "Demo User", passwordHash },
    update: { passwordHash }
  });
  console.log(`Demo login → ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);

  const today = new Date();
  const date = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

  const plan = await prisma.dailyPlan.upsert({
    where: { userId_date: { userId: user.id, date } },
    create: {
      userId: user.id,
      date,
      whyTodayMatters: "Protect the highest-leverage development work from getting buried by reactive tasks."
    },
    update: {}
  });

  // Idempotent: clear any previously seeded rows so re-running doesn't duplicate.
  await prisma.goal.deleteMany({ where: { dailyPlanId: plan.id } });
  await prisma.unplannedWork.deleteMany({ where: { dailyPlanId: plan.id } });

  await prisma.goal.createMany({
    data: [
      {
        dailyPlanId: plan.id,
        title: "Complete Store Builder testing",
        plannedOutcome: "Finish checkout and product flow tests",
        actualOutcome: "Checkout covered; product flow needs one more pass",
        priority: "CRITICAL",
        status: "PARTIAL",
        expectedMinutes: 120,
        actualMinutes: 150,
        importance: "Keeps the release on track"
      },
      {
        dailyPlanId: plan.id,
        title: "Fix authentication issue",
        plannedOutcome: "Resolve login and token refresh bug",
        actualOutcome: "Fixed login, refresh, and session timeout",
        priority: "CRITICAL",
        status: "COMPLETED",
        expectedMinutes: 120,
        actualMinutes: 210,
        importance: "Unblocks testers"
      },
      {
        dailyPlanId: plan.id,
        title: "Write documentation",
        plannedOutcome: "Draft setup and API notes",
        priority: "MEDIUM",
        status: "PLANNED",
        expectedMinutes: 60,
        actualMinutes: 0,
        importance: "Reduces handoff friction"
      }
    ],
    skipDuplicates: true
  });

  await prisma.unplannedWork.create({
    data: {
      dailyPlanId: plan.id,
      title: "Production deployment issue",
      minutes: 45,
      notes: "Hotfixed environment configuration."
    }
  });

  const goals = await prisma.goal.findMany({ where: { dailyPlanId: plan.id } });
  await prisma.dailyPlan.update({
    where: { id: plan.id },
    data: {
      plannedMinutes: goals.reduce((sum, goal) => sum + goal.expectedMinutes, 0),
      actualMinutes: goals.reduce((sum, goal) => sum + goal.actualMinutes, 0),
      unplannedMinutes: 45
    }
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  });
