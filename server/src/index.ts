import { createServer } from "node:http";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { Server } from "socket.io";
import { authRouter } from "./routes/auth.js";
import { serversRouter } from "./routes/servers.js";
import { registerSocketAuth, registerSocketHandlers } from "./socket/socketHandler.js";
import { CLIENT_ORIGIN, PORT } from "./types/env.js";
import { isProdRuntime } from "./types/runtime.js";

function browserOrigins(): string[] {
  if (isProd) return [CLIENT_ORIGIN];
  return [
    ...new Set([
      CLIENT_ORIGIN,
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:5174",
      "http://127.0.0.1:5174",
    ]),
  ];
}

const allowedOrigins = browserOrigins();

const app = express();

if (isProdRuntime) {
  app.set("trust proxy", 1);
}

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

app.get("/", (_, res) =>
  res.json(
    isProdRuntime
      ? { ok: true, service: "openworld-api" }
      : {
          ok: true,
          service: "openworld-api",
          hint: "This port is the API + Socket.IO only. Run the client (npm run dev in client/) and open the URL Vite prints, e.g. http://localhost:5173",
        },
  ),
);

app.get("/api/health", (_, res) => res.json({ ok: true }));

app.use("/api/auth", createAuthRateLimiter(), authRouter);
app.use("/api/servers", createServersRateLimiter(), serversRouter);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
});

registerSocketAuth(io);
registerSocketHandlers(io);

httpServer.listen(PORT, () => {
  if (isProdRuntime) {
    console.log(`Server listening (port ${PORT})`);
  } else {
    console.log(`HTTP + Socket.io on http://localhost:${PORT}`);
  }
});

// Rate Limiters
function createAuthRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, try again later" },
  });
}

function createServersRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, try again later" },
  });
}
