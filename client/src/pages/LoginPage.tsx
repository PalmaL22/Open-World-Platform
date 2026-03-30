import { FormEvent, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import type { Location } from "react-router-dom";
import { loginAccount } from "../lib/api";
import { getApiConnectionErrorMessage } from "../lib/httpErrors";
import { useAuthStore } from "../store/authStore";

export function LoginPage() {
  const token = useAuthStore((s) => s.token);
  const login = useAuthStore((s) => s.login);
  const location = useLocation();
  const from =
    (location.state as { from?: Location } | null)?.from?.pathname ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (token) {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { token: jwt, user } = await loginAccount({
        email: email.trim(),
        password,
      });
      login(jwt, { id: user.id, username: user.username });
    } catch (err) {
      setError(getApiConnectionErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-8 px-4 py-16">
      <div>
        <h1 className="text-2xl font-semibold text-white">Sign in</h1>
        <p className="mt-2 text-sm text-slate-400">
          Use the email and password for your account. Password must be 8 to 30 characters.
        </p>
      </div>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        {error ? (
          <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}
        <div>
          <label htmlFor="login-email" className="mb-1 block text-sm text-slate-300">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
        <div>
          <label htmlFor="login-password" className="mb-1 block text-sm text-slate-300">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            maxLength={30}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Signing in…" : "Sign in"}
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
