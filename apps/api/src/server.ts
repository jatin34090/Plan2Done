import cookieParser from "cookie-parser";
import cors from "cors";
import "dotenv/config";
import express from "express";
import { ZodError } from "zod";
import { aiEnabled } from "./lib/ai.js";
import { warmDatabase } from "./prisma.js";
import { analyticsRouter } from "./routes/analytics.js";
import { authRouter } from "./routes/auth.js";
import { dailyPlansRouter } from "./routes/dailyPlans.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

// WEB_ORIGIN may list several allowed origins, comma-separated
// (e.g. the custom domain + the Vercel URL + localhost).
const allowedOrigins = (process.env.WEB_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (no Origin header) and any listed origin.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true
  })
);
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ ok: true, name: "plan2done-api", aiEnabled });
});

app.use("/api/auth", authRouter);
app.use("/api/daily-plans", dailyPlansRouter);
app.use("/api/analytics", analyticsRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof ZodError) {
    res.status(400).json({ message: "Invalid request", issues: error.issues });
    return;
  }

  console.error(error);
  res.status(500).json({ message: "Something went wrong" });
});

app.listen(port, () => {
  console.log(`Plan2Done API running on http://localhost:${port} (AI ${aiEnabled ? "enabled" : "heuristic"})`);
  warmDatabase();
});
