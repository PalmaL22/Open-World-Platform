import jwt from "jsonwebtoken";
import type { Server } from "socket.io";
import { prisma } from "../lib/prisma.js";
import { JWT_SECRET } from "../types/env.js";

export function registerSocketAuth(io: Server) {
  io.use((socket, next) => {
    const raw = socket.handshake.auth;
    const token =
      typeof raw === "object" && raw !== null && "token" in raw && typeof (raw as { token: unknown }).token === "string"
        ? (raw as { token: string }).token
        : null;

    if (!token) {
      next(new Error("Missing auth token"));
      return;
    }

    try {
      const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
      socket.data.userId = payload.userId;
      next();
    } catch {
      next(new Error("Invalid auth token"));
    }
  });
}

export function registerSocketHandlers(io: Server) {
  io.on("connection", (socket) => {
    const userId = socket.data.userId as string | undefined;
    if (!userId) {
      socket.disconnect(true);
      return;
    }

    console.log("Socket connected:", socket.id, "user", userId);

    socket.on("join-server", async (payload: { serverId: string }) => {
      const serverId = payload?.serverId;

      if (!serverId) {
        console.warn("Server ID is required");
        socket.emit("join-error", { message: "Server ID is required" });
        return;
      }

      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
        });

        if (!user) {
          socket.emit("join-error", { message: "User not found" });
          return;
        }

        if (user.currentServerId === serverId) {
          const room = roomForServer(serverId);
          await socket.join(room);
          const server = await prisma.server.findUnique({ where: { id: serverId } });
          socket.emit("joined-server", {
            serverId,
            name: server?.name ?? "",
            username: user.username,
          });
          socket.to(room).emit("player-joined", { socketId: socket.id });
          return;
        }

        const server = await prisma.server.findUnique({
          where: { id: serverId },
        });

        if (!server) {
          socket.emit("join-error", { message: "Server not found" });
          return;
        }

        const count = await prisma.user.count({
          where: { currentServerId: serverId },
        });

        if (count >= server.maxCapacity) {
          socket.emit("join-error", { message: "Server is full" });
          return;
        }

        const oldId = user.currentServerId;
        if (oldId && oldId !== serverId) {
          await socket.leave(roomForServer(oldId));
        }

        await prisma.user.update({
          where: { id: userId },
          data: { currentServerId: serverId },
        });

        const room = roomForServer(serverId);
        await socket.join(room);

        socket.emit("joined-server", {
          serverId,
          name: server.name,
          username: user.username,
        });

        socket.to(room).emit("player-joined", { socketId: socket.id });
        console.log(`User ${userId} joined server room ${room}`);
      } catch (e) {
        console.error(e);
        socket.emit("join-error", { message: "Could not join server" });
      }
    });

    socket.on("leave-server", async (payload: { serverId: string }) => {
      const serverId = payload?.serverId;
      if (!serverId) {
        console.warn("Server ID is required");
        return;
      }

      await socket.leave(roomForServer(serverId));

      try {
        await prisma.user.updateMany({
          where: { id: userId, currentServerId: serverId },
          data: { currentServerId: null },
        });
      } catch (e) {
        console.error(e);
      }
    });

    socket.on("player-move", (payload: { serverId: string; x: number; y: number }) => {
      const serverId = payload?.serverId;

      if (!serverId) {
        console.warn("Server ID is required");
        return;
      } else if (payload.x == null || payload.y == null) {
        console.warn("X and Y are required", payload.x, payload.y, "for server", serverId);
        return;
      }

      socket.to(roomForServer(serverId)).emit("player-moved", {
        socketId: socket.id,
        x: payload.x,
        y: payload.y,
      });
    });

    socket.on("disconnect", async () => {
      console.log("Socket disconnected:", socket.id);

      try {
        await prisma.user.updateMany({
          where: { id: userId },
          data: { currentServerId: null },
        });
      } catch (e) {
        console.error(e);
      }
    });
  });
}

function roomForServer(serverId: string) {
  return `server:${serverId}`;
}
