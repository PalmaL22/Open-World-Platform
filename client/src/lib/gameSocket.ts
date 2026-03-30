import { io, type Socket } from "socket.io-client";
import { getApiOrigin } from "./apiOrigin";
import { useAuthStore } from "../store/authStore";

function socketBaseUrl(): string {
  const b = getApiOrigin();
  if (!b) {
    throw new Error("Set VITE_API_URL for production builds — cannot open realtime connection");
  }
  return b;
}

export function createAuthenticatedGameSocket(): Socket {
  const token = useAuthStore.getState().token;
  if (!token) {
    throw new Error("Not signed in");
  }
  return io(socketBaseUrl(), {
    auth: { token },
  });
}
