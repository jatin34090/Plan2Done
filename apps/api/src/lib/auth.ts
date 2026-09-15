import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";

const JWT_SECRET = process.env.JWT_SECRET ?? "plan2done-dev-secret-change-me";
const TOKEN_TTL = "30d";
export const AUTH_COOKIE = "p2d_token";

export interface AuthedRequest extends Request {
  userId?: string;
  params: Record<string, string>;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: "/"
};

/** Reads the JWT from the cookie or Authorization header and attaches userId. */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.[AUTH_COOKIE];
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  const token = cookieToken ?? bearer;

  if (!token) {
    res.status(401).json({ message: "Not authenticated" });
    return;
  }

  const userId = verifyToken(token);
  if (!userId) {
    res.status(401).json({ message: "Session expired" });
    return;
  }

  req.userId = userId;
  next();
}
