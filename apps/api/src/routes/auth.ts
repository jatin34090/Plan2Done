import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import {
  AUTH_COOKIE,
  cookieOptions,
  hashPassword,
  requireAuth,
  signToken,
  verifyPassword,
  type AuthedRequest
} from "../lib/auth.js";

const router = Router();

const registerSchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  timezone: z.string().optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

function publicUser(user: { id: string; name: string; email: string; timezone: string }) {
  return { id: user.id, name: user.name, email: user.email, timezone: user.timezone };
}

router.post("/register", async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (existing) {
      res.status(409).json({ message: "An account with that email already exists" });
      return;
    }

    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        passwordHash: await hashPassword(data.password),
        timezone: data.timezone ?? "UTC"
      }
    });

    const token = signToken(user.id);
    res.cookie(AUTH_COOKIE, token, cookieOptions);
    res.status(201).json({ user: publicUser(user), token });
  } catch (error) {
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (!user || !user.passwordHash || !(await verifyPassword(data.password, user.passwordHash))) {
      res.status(401).json({ message: "Invalid email or password" });
      return;
    }

    const token = signToken(user.id);
    res.cookie(AUTH_COOKIE, token, cookieOptions);
    res.json({ user: publicUser(user), token });
  } catch (error) {
    next(error);
  }
});

router.post("/logout", (_req, res) => {
  res.clearCookie(AUTH_COOKIE, { ...cookieOptions, maxAge: undefined });
  res.json({ ok: true });
});

router.get("/me", requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      res.status(401).json({ message: "Not authenticated" });
      return;
    }
    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

export { router as authRouter };
