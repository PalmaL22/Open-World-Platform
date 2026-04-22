import jwt from "jsonwebtoken";
import type { Server } from "socket.io";
import { prisma } from "../lib/prisma.js";
import { JWT_SECRET } from "../types/env.js";

const DEFAULT_CHARACTER_COLOR = "#3498db";
const CHAT_HISTORY_LIMIT = 50;
const CHAT_MAX_LENGTH = 300;
const CHAT_MIN_INTERVAL_MS = 300;

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

    const emitSystemMessage = (serverId: string, content: string) => {
      io.to(roomForServer(serverId)).emit("chat:system", {
        content,
        createdAt: new Date().toISOString(),
      });
    };

    const emitChatHistory = async (serverId: string) => {
      const history = await prisma.chatMessage.findMany({
        where: { serverId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: CHAT_HISTORY_LIMIT,
      });

      socket.emit(
        "chat:history",
        history.reverse().map((message) => ({
          id: message.id,
          content: message.content,
          createdAt: message.createdAt.toISOString(),
          user: {
            id: message.user.id,
            username: message.user.username,
          },
        })),
      );
    };

    const roomMembers = (serverId: string) => {
      const room = roomForServer(serverId);
      const memberIds = io.sockets.adapter.rooms.get(room);
      if (!memberIds) return [];
      return [...memberIds]
        .map((id) => io.sockets.sockets.get(id))
        .filter((member): member is NonNullable<typeof member> => Boolean(member));
    };

    const voiceRoomMembers = (serverId: string) =>
      roomMembers(serverId).filter((member) => (member.data.voiceActive as boolean | undefined) === true);

    const mapPlayer = (member: ReturnType<typeof roomMembers>[number]) => ({
      socketId: member.id,
      color: (member.data.characterColor as string | undefined) ?? DEFAULT_CHARACTER_COLOR,
      x: typeof member.data.x === "number" ? member.data.x : undefined,
      y: typeof member.data.y === "number" ? member.data.y : undefined,
    });

    const emitPlayersSnapshot = async (serverId: string) => {
      const players = roomMembers(serverId).filter((member) => member.id !== socket.id).map(mapPlayer);
      socket.emit("players:snapshot", players);
    };

    const emitPlayersSnapshotToRoom = async (serverId: string) => {
      const members = roomMembers(serverId);
      for (const member of members) {
        member.emit(
          "players:snapshot",
          members
            .filter((other) => other.id !== member.id)
            .map(mapPlayer),
        );
      }
    };

    const leaveActiveServer = async (reason: "leave" | "disconnect") => {
      const activeServerId = socket.data.serverId as string | undefined;
      const username = socket.data.username as string | undefined;
      if (!activeServerId) return;

      await socket.leave(roomForServer(activeServerId));

      try {
        await prisma.user.updateMany({
          where: { id: userId, currentServerId: activeServerId },
          data: { currentServerId: null },
        });
      } catch (e) {
        console.error(e);
      }

      socket.to(roomForServer(activeServerId)).emit("player-left", {
        socketId: socket.id,
      });
      if (socket.data.voiceActive) {
        socket.data.voiceActive = undefined;
        socket.to(roomForServer(activeServerId)).emit("voice:peer-left", {
          socketId: socket.id,
        });
      }
      if (username) {
        emitSystemMessage(activeServerId, `${username} left the room`);
      }
      await emitPlayersSnapshotToRoom(activeServerId);
      socket.data.serverId = undefined;
      if (reason === "disconnect") {
        socket.data.username = undefined;
      }
    };

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
          include: { character: true },
        });

        if (!user) {
          socket.emit("join-error", { message: "User not found" });
          return;
        }

        const characterColor = user.character?.color ?? DEFAULT_CHARACTER_COLOR;
        socket.data.characterColor = characterColor;
        socket.data.username = user.username;

        if (user.currentServerId === serverId) {
          const room = roomForServer(serverId);
          await socket.join(room);
          socket.data.serverId = serverId;
          const server = await prisma.server.findUnique({ where: { id: serverId } });
          socket.emit("joined-server", {
            serverId,
            name: server?.name ?? "",
            username: user.username,
            characterColor,
          });
          await emitChatHistory(serverId);
          await emitPlayersSnapshot(serverId);
          emitSystemMessage(serverId, `${user.username} joined the room`);
          socket.to(room).emit("player-joined", {
            socketId: socket.id,
            color: characterColor,
            x: socket.data.x,
            y: socket.data.y,
          });
          await emitPlayersSnapshotToRoom(serverId);
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
          await leaveActiveServer("leave");
        }

        await prisma.user.update({
          where: { id: userId },
          data: { currentServerId: serverId },
        });

        const room = roomForServer(serverId);
        await socket.join(room);
        socket.data.serverId = serverId;

        socket.emit("joined-server", {
          serverId,
          name: server.name,
          username: user.username,
          characterColor,
        });
        await emitChatHistory(serverId);
        await emitPlayersSnapshot(serverId);
        emitSystemMessage(serverId, `${user.username} joined the room`);

        socket.to(room).emit("player-joined", {
          socketId: socket.id,
          color: characterColor,
          x: socket.data.x,
          y: socket.data.y,
        });
        await emitPlayersSnapshotToRoom(serverId);
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
      await leaveActiveServer("leave");
    });

    socket.on("player-move", (payload: { serverId: string; x: number; y: number }) => {
      const serverId = socket.data.serverId as string | undefined;

      if (!serverId) {
        console.warn("Active server ID is required");
        return;
      } else if (payload.x == null || payload.y == null) {
        console.warn("X and Y are required", payload.x, payload.y, "for server", serverId);
        return;
      }

      const color = socket.data.characterColor ?? DEFAULT_CHARACTER_COLOR;
      socket.data.x = payload.x;
      socket.data.y = payload.y;
      socket.to(roomForServer(serverId)).emit("player-moved", {
        socketId: socket.id,
        x: payload.x,
        y: payload.y,
        color,
      });
    });

    socket.on("chat:send", async (payload: { content?: string }) => {
      const serverId = socket.data.serverId as string | undefined;
      const username = socket.data.username as string | undefined;
      const rawContent = payload?.content ?? "";
      const content = rawContent.trim();
      const now = Date.now();
      const lastChatAt = (socket.data.lastChatAt as number | undefined) ?? 0;

      if (!serverId) {
        socket.emit("chat:error", { message: "Join a server before chatting." });
        return;
      }

      if (!content) {
        socket.emit("chat:error", { message: "Message cannot be empty." });
        return;
      }

      if (content.length > CHAT_MAX_LENGTH) {
        socket.emit("chat:error", { message: `Message too long (max ${CHAT_MAX_LENGTH} chars).` });
        return;
      }

      if (now - lastChatAt < CHAT_MIN_INTERVAL_MS) {
        socket.emit("chat:error", { message: "You're sending messages too fast." });
        return;
      }

      socket.data.lastChatAt = now;

      try {
        const message = await prisma.chatMessage.create({
          data: {
            serverId,
            userId,
            content,
          },
        });

        io.to(roomForServer(serverId)).emit("chat:message", {
          id: message.id,
          socketId: socket.id,
          content: message.content,
          createdAt: message.createdAt.toISOString(),
          user: {
            id: userId,
            username: username ?? "Unknown",
          },
        });
      } catch (e) {
        console.error(e);
        socket.emit("chat:error", { message: "Could not send message." });
      }
    });

    socket.on("players:sync", async () => {
      const serverId = socket.data.serverId as string | undefined;
      if (!serverId) return;
      await emitPlayersSnapshot(serverId);
    });

    socket.on("voice:join", () => {
      const serverId = socket.data.serverId as string | undefined;
      if (!serverId) {
        socket.emit("voice:error", { message: "Join a server before enabling voice." });
        return;
      }

      socket.data.voiceActive = true;
      const peers = voiceRoomMembers(serverId)
        .filter((member) => member.id !== socket.id)
        .map((member) => member.id);

      socket.emit("voice:peers", { peers });
      socket.to(roomForServer(serverId)).emit("voice:peer-joined", { socketId: socket.id });
    });

    socket.on("voice:leave", () => {
      const serverId = socket.data.serverId as string | undefined;
      if (!serverId || !socket.data.voiceActive) return;
      socket.data.voiceActive = undefined;
      socket.to(roomForServer(serverId)).emit("voice:peer-left", { socketId: socket.id });
    });

    socket.on("voice:offer", (payload: { to?: string; sdp?: unknown }) => {
      const serverId = socket.data.serverId as string | undefined;
      if (!serverId || !socket.data.voiceActive) return;
      const to = payload?.to;
      if (!to || !payload.sdp) return;
      const target = io.sockets.sockets.get(to);
      if (!target) return;
      if (target.data.serverId !== serverId || !target.data.voiceActive) return;
      target.emit("voice:offer", { from: socket.id, sdp: payload.sdp });
    });

    socket.on("voice:answer", (payload: { to?: string; sdp?: unknown }) => {
      const serverId = socket.data.serverId as string | undefined;
      if (!serverId || !socket.data.voiceActive) return;
      const to = payload?.to;
      if (!to || !payload.sdp) return;
      const target = io.sockets.sockets.get(to);
      if (!target) return;
      if (target.data.serverId !== serverId || !target.data.voiceActive) return;
      target.emit("voice:answer", { from: socket.id, sdp: payload.sdp });
    });

    socket.on("voice:ice-candidate", (payload: { to?: string; candidate?: unknown }) => {
      const serverId = socket.data.serverId as string | undefined;
      if (!serverId || !socket.data.voiceActive) return;
      const to = payload?.to;
      if (!to || !payload.candidate) return;
      const target = io.sockets.sockets.get(to);
      if (!target) return;
      if (target.data.serverId !== serverId || !target.data.voiceActive) return;
      target.emit("voice:ice-candidate", { from: socket.id, candidate: payload.candidate });
    });

    socket.on("voice:mute-state", (payload: { muted?: boolean }) => {
      const serverId = socket.data.serverId as string | undefined;
      if (!serverId || !socket.data.voiceActive) return;
      if (typeof payload?.muted !== "boolean") return;
      socket.to(roomForServer(serverId)).emit("voice:mute-state", {
        socketId: socket.id,
        muted: payload.muted,
      });
    });

    socket.on("disconnect", async () => {
      console.log("Socket disconnected:", socket.id);
      await leaveActiveServer("disconnect");
    });
  });
}

function roomForServer(serverId: string) {
  return `server:${serverId}`;
}
