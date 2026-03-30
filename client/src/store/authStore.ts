import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Character {
  id: string;
  color: string;
  hat?: string | null;
  facewear?: string | null;
}

export interface AuthUser {
  id: string;
  username: string;
  character?: Character | null;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      login: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: "openworld-auth" },
  ),
);
