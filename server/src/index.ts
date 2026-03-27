import { createServer } from "node:http";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { Server } from "socket.io";
import { authRouter } from "./routes/auth.js";
import { registerSocketHandlers } from "./socket/socketHandler.js";
import { CLIENT_ORIGIN, PORT } from "./types/env.js";

const app = express();
const corsOrigin = CLIENT_ORIGIN;

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

app.get("/api/health", (_, res) => res.json({ ok: true }));

app.use("/api/auth", createAuthRateLimiter(), authRouter);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"],
  },
});

registerSocketHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`HTTP + Socket.io on http://localhost:${PORT}`);
});

function createAuthRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, try again later" },
  });
}
