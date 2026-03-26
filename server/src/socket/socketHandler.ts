import type { Server } from "socket.io";

export function registerSocketHandlers(io: Server) {
  io.on("connection", (socket) => { console.log("Socket connected/created:", socket.id);

    socket.on("join-server", (payload: { serverId: string }) => {
      const serverId = payload?.serverId;

      if (!payload || !payload.serverId)  {
         console.error("Server ID is required");
         return;
      }

      const room = roomForServer(serverId);
      // Debug Console log 
      console.log("Socket joining room:", room);

      void socket.join(room);
      socket.to(room).emit("player-joined", { socketId: socket.id });
    });

    socket.on("leave-server", (payload: { serverId: string }) => {
      const serverId = payload?.serverId;
      if (!serverId) return;
      void socket.leave(roomForServer(serverId));
    });

    socket.on("player-move", (payload: { serverId: string; x: number; y: number }) => {
      const serverId = payload?.serverId;
      if (serverId == null || payload.x == null || payload.y == null) return;
      socket.to(roomForServer(serverId)).emit("player-moved", {
        socketId: socket.id,
        x: payload.x,
        y: payload.y,
      });
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected:", socket.id);
    });
  });
}

// Helper function to get the room for a server
function roomForServer(serverId: string) {
  return `server:${serverId}`;
}


// Note finish movement and leaving sever logic