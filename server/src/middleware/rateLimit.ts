import rateLimit from "express-rate-limit";

/** Limits repeated calls to GET /api/auth/me (per IP). */
export const authMeRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, try again later" },
});
