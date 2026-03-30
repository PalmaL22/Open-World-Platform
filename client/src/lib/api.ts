import axios from "axios";
import { getApiOrigin } from "./apiOrigin";
import { useAuthStore } from "../store/authStore";

const base = getApiOrigin();

/** HTTP API origin (same as axios `baseURL`) — used by `fetch` helpers in `src/api/auth.ts`. */
export const API_URL = base;

export const api = axios.create({
  baseURL: base || undefined,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export type RegisterPayload = {
  email: string;
  password: string;
  username: string;
  characterColor?: string;
};

export type AuthResult = {
  token: string;
  user: { id: string; username: string };
};

export async function registerAccount(payload: RegisterPayload): Promise<AuthResult> {
  const { data } = await api.post<AuthResult>("/api/auth/register", payload);
  return data;
}

export type LoginPayload = {
  email: string;
  password: string;
};

export async function loginAccount(payload: LoginPayload): Promise<AuthResult> {
  const { data } = await api.post<AuthResult>("/api/auth/login", payload);
  return data;
}

export type LobbyServer = {
  id: string;
  name: string;
  maxCapacity: number;
  playerCount: number;
};

export async function fetchServerList(): Promise<LobbyServer[]> {
  const { data } = await api.get<{ servers: LobbyServer[] }>("/api/servers/server-list");
  return data.servers;
}
