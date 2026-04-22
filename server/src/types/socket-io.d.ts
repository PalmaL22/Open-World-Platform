import "socket.io";

declare module "socket.io" {
  interface SocketData {
    userId?: string;
    characterColor?: string;
    serverId?: string;
    username?: string;
    x?: number;
    y?: number;
    voiceActive?: boolean;
  }
}
