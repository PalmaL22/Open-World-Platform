import { FormEvent, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import type { Location } from "react-router-dom";
import { login as loginRequest } from "../api/auth";
import { isValidEmailFormat } from "../lib/email";
import { AuthShell } from "../components/AuthShell";
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
  const [loading, setLoading] = useState(false);

  if (token) {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedEmail = email.trim().toLowerCase();
    if (!isValidEmailFormat(trimmedEmail)) {
      setError(
        "Enter a valid email with a domain and TLD (e.g. name@gmail.com).",
      );
      return;
    }
    setLoading(true);
    try {
      const { token: nextToken, user } = await loginRequest({
        email: trimmedEmail,
        password,
      });
      login(nextToken, user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in"
      description="Enter the lobby and join live spaces—conferences, meetups, and open-world sessions."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {error ? (
          <p className="rounded-lg border border-red-500/30 bg-red-950/50 px-3 py-2.5 text-sm text-red-100">
            {error}
          </p>
        ) : null}
        <div>
          <label htmlFor="email" className="label-auth">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-auth"
          />
        </div>
        <div>
          <label htmlFor="password" className="label-auth">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-auth"
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary mt-1 w-full">
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        No account?{" "}
        <Link to="/register" className="font-medium text-amber-300/90 hover:text-amber-200">
          Create one
        </Link>
      </p>
    </AuthShell>
  );
}
