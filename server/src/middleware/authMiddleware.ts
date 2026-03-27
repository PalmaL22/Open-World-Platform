import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../types/env.js";


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
