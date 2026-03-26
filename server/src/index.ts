import { createServer } from "node:http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import { authRouter } from "./routes/auth.js";
import { registerSocketHandlers } from "./socket/socketHandler.js";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

const corsOrigin = process.env.CLIENT_ORIGIN === undefined ? true : process.env.CLIENT_ORIGIN;

app.use(cors({ origin: corsOrigin }));
app.use(express.json());

app.get("/api/health", (_, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);

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
