import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchServerList, type LobbyServer } from "../lib/api";
import { useAuthStore } from "../store/authStore";

function capacityPercent(playerCount: number, maxCapacity: number) {
  if (maxCapacity <= 0) return 0;
  return Math.min(100, Math.round((playerCount / maxCapacity) * 100));
}

export function LobbyPage() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [servers, setServers] = useState<LobbyServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const list = await fetchServerList();
      setServers(list);
    } catch (e) {
      setError("Could not load servers. Try again.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-8">
      <div className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-amber-200/70">
          Lobby
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Choose a live space
        </h1>
        <p className="mt-3 text-base leading-relaxed text-slate-400">
          Signed in as{" "}
          <span className="font-medium text-amber-100/90">{user?.username}</span>. Join a
          server to walk the floor—ideal for conferences, showcases, and social hangouts.
        </p>
      </div>

      {error && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-red-400/40 px-3 py-1.5 text-red-50 transition hover:bg-red-900/50"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <ul className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="h-28 animate-pulse rounded-xl border border-white/5 bg-slate-900/40"
            />
          ))}
        </ul>
      ) : servers.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 bg-slate-900/30 px-6 py-12 text-center">
          <p className="font-display text-lg font-medium text-slate-200">No servers yet</p>
          <p className="mt-2 text-sm text-slate-500">
            Check back soon—new event spaces will appear here.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {servers.map((s) => {
            const full = s.playerCount >= s.maxCapacity;
            const pct = capacityPercent(s.playerCount, s.maxCapacity);
            return (
              <li
                key={s.id}
                className="group relative overflow-hidden rounded-xl border border-white/10 bg-slate-900/50 shadow-lg shadow-black/20 backdrop-blur-sm transition hover:border-amber-400/20 hover:bg-slate-900/70"
              >
                <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-amber-400/80 to-cyan-500/60 opacity-90" />
                <div className="flex flex-col gap-4 p-5 pl-6 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <h2 className="font-display text-lg font-semibold text-white">
                        {s.name}
                      </h2>
                      {full ? (
                        <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-amber-200/90">
                          Full
                        </span>
                      ) : (
                        <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-emerald-300/90">
                          Open
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-slate-400">
                      {s.playerCount} / {s.maxCapacity} people in this space
                    </p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800/80">
                      <div
                        className={`h-full rounded-full transition-all ${
                          full ? "bg-amber-500/70" : "bg-gradient-to-r from-cyan-500/80 to-amber-400/70"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={full}
                    onClick={() => navigate(`/game?serverId=${encodeURIComponent(s.id)}`)}
                    className="btn-primary shrink-0 px-6 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {full ? "Full" : "Join space"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
