import { FormEvent, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import type { Location } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

export function LoginPage() {
  const token = useAuthStore((s) => s.token);
  const login = useAuthStore((s) => s.login);
  const location = useLocation();
  const from =
    (location.state as { from?: Location } | null)?.from?.pathname ?? "/";

  const [username, setUsername] = useState("");

  if (token) {
    return <Navigate to={from} replace />;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const name = username.trim() || "demo by Gus";
    const id = crypto.randomUUID();
    const mockToken = `mock.${btoa(JSON.stringify({ sub: id }))}`;
    login(mockToken, { id, username: name });
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-8 px-4 py-16">
      <div>
        <h1 className="text-2xl font-semibold text-white">Sign in</h1>
        <p className="mt-2 text-sm text-slate-400">
          Gusito Loginsito
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="username" className="mb-1 block text-sm text-slate-300">
            Display name
          </label>
          <input
            id="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="optional"
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
        <button
          type="submit"
          className="rounded-md bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-500"
        >
          Continue Gusito
        </button>
      </form>
      <p className="text-center text-sm text-slate-500">
        No account?{" "}
        <Link to="/register" className="text-sky-400 hover:text-sky-300">
          Register
        </Link>
      </p>
    </div>
  );
}
