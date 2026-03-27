import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = requireEnv("JWT_SECRET");

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") 
        ? authHeader.slice(7) 
        : null;

  // future question: should we thrown an error for missing and a separate error for invalid?
  if (!token) {
    return res.status(401).json({ error: "Missing or invalid token" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    req.userId = payload.userId;
    next();

  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}