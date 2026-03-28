import { NavLink, Outlet } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    "rounded-md px-3 py-2 text-sm font-medium transition-colors",
    isActive
      ? "bg-slate-800 text-white"
      : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200",
  ].join(" ");

export function MainLayout() {
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <span className="text-lg font-semibold tracking-tight text-white">
            Open World
          </span>
          <nav className="flex flex-1 items-center justify-center gap-1 sm:justify-end">
            <NavLink to="/" end className={navLinkClass}>
              Lobby
            </NavLink>
            <NavLink to="/game" className={navLinkClass}>
              Game
            </NavLink>
          </nav>
          <button
            type="button"
            onClick={() => logout()}
            className="rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:border-slate-500 hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
