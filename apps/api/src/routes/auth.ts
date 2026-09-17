import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
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

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// Sign in with a Google ID token from Google Identity Services on the client.
router.post("/google", async (req, res, next) => {
  try {
    if (!googleClient || !GOOGLE_CLIENT_ID) {
      res.status(501).json({ message: "Google sign-in is not configured on the server" });
      return;
    }
    const { credential } = z.object({ credential: z.string().min(1) }).parse(req.body);

    // Verify the token separately so an audience/client-id mismatch returns a
    // clear 401 (not a generic 500) and is easy to spot in the logs.
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
      payload = ticket.getPayload();
    } catch (verifyError) {
      console.error("Google token verification failed:", verifyError);
      res.status(401).json({
        message:
          "Google verification failed — check that GOOGLE_CLIENT_ID on the API exactly matches the web client ID."
      });
      return;
    }

    if (!payload?.email || payload.email_verified === false) {
      res.status(401).json({ message: "Could not verify your Google account" });
      return;
    }

    const email = payload.email.toLowerCase();
    const name = payload.name || payload.given_name || email.split("@")[0];

    // Link by email: existing accounts sign in, new ones are created (no password).
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      user = await prisma.user.create({ data: { email, name, passwordHash: "" } });
    }

    const token = signToken(user.id);
    res.cookie(AUTH_COOKIE, token, cookieOptions);
    res.json({ user: publicUser(user), token });
  } catch (error) {
    next(error);
  }
});

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
