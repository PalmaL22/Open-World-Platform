import { API_URL } from "../lib/api";
import type { AuthUser } from "../store/authStore";

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    if (typeof data.error === "string") return data.error;
  } catch {
    /* ignore */
  }
  return "Request failed";
}

export async function register(body: {
  email: string;
  password: string;
  username: string;
  characterColor?: string;
}): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<AuthResponse>;
}

export async function login(body: { email: string; password: string }): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<AuthResponse>;
}

export async function fetchMe(token: string): Promise<AuthUser> {
  const res = await fetch(`${API_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<AuthUser>;
}
