import { NavLink, Outlet } from "react-router-dom";
import { AmbientBackground } from "../components/AmbientBackground";
import { BrandLogo } from "../components/BrandLogo";
import { useAuthStore } from "../store/authStore";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
    isActive
      ? "bg-white/10 text-white shadow-inner shadow-black/20"
      : "text-slate-400 hover:bg-white/5 hover:text-slate-200",
  ].join(" ");

export function MainLayout() {
  const logout = useAuthStore((s) => s.logout);

  return (
    <div className="relative flex min-h-screen flex-col">
      <AmbientBackground />
      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="border-b border-white/10 bg-slate-950/55 backdrop-blur-md">
          <div className="mx-auto flex max-w-screen-2xl items-center justify-between gap-4 px-4 py-4">
            <BrandLogo to="/" size="sm" />
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
              className="shrink-0 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/5"
            >
              Sign out
            </button>
          </div>
        </header>
        <main className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
