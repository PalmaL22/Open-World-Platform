import { type ReactNode, useEffect, useState } from "react";
import { fetchMe } from "../api/auth";
import { useAuthStore } from "../store/authStore";

/**
 * After persisted state rehydrates, validates the JWT against GET /api/auth/me.
 * Blocks children until hydration (and optional validation) finishes.
 */
export function AuthBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const finish = () => {
      const { token, login, logout } = useAuthStore.getState();
      if (!token) {
        setReady(true);
        return;
      }
      fetchMe(token)
        .then((user) => login(token, user))
        .catch(() => logout())
        .finally(() => setReady(true));
    };

    const { persist } = useAuthStore;
    if (persist.hasHydrated()) {
      finish();
      return;
    }
    return persist.onFinishHydration(() => {
      finish();
    });
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
