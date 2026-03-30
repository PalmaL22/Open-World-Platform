import "socket.io";

declare module "socket.io" {
  interface SocketData {
    userId?: string;
    /** Set when the socket successfully joins a game server; hex like `#3498db`. */
    characterColor?: string;
  }
}
