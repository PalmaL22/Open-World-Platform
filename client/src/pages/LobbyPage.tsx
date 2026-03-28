import { useAuthStore } from "../store/authStore";

export function LobbyPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-white">Lobby</h1>
      <p className="text-slate-400">
        Signed in as <span className="font-medium text-slate-200">{user?.username}</span>.
      </p>
      <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/50 p-8 text-center text-slate-500">
        Coming soon
      </div>
    </div>
  );
}
