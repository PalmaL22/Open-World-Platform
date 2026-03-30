import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchServerList, type LobbyServer } from "../lib/api";
import { useAuthStore } from "../store/authStore";

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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Lobby</h1>
        <p className="mt-1 text-slate-400">
          Signed in as <span className="font-medium text-slate-200">{user?.username}</span>. Pick a
          server to join.
        </p>
      </div>

      {error && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded border border-red-700/80 px-2 py-1 text-red-100 hover:bg-red-900/50"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-slate-500">Loading servers…</p>
      ) : servers.length === 0 ? (
        <p className="text-slate-500">No servers available yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {servers.map((s) => {
            const full = s.playerCount >= s.maxCapacity;
            return (
              <li
                key={s.id}
                className="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-900/50 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <h2 className="font-medium text-slate-100">{s.name}</h2>
                  <p className="text-sm text-slate-400">
                    {s.playerCount} / {s.maxCapacity} players
                  </p>
                </div>
                <button
                  type="button"
                  disabled={full}
                  onClick={() => navigate(`/game?serverId=${encodeURIComponent(s.id)}`)}
                  className="rounded-md border border-sky-600 bg-sky-700/80 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {full ? "Full" : "Join server"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
