import { FormEvent, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { registerAccount } from "../lib/api";
import { getApiConnectionErrorMessage } from "../lib/httpErrors";
import { useAuthStore } from "../store/authStore";

export function RegisterPage() {
  const token = useAuthStore((s) => s.token);
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [characterColor, setCharacterColor] = useState("#3498db");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (token) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { token: jwt, user } = await registerAccount({
        email: email.trim(),
        password,
        username: username.trim(),
        characterColor,
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
        <h1 className="text-2xl font-semibold text-white">Create account</h1>
        <p className="mt-2 text-sm text-slate-400">
          3–20 character username (letters, numbers, underscores). Password 8–30 characters.
        </p>
      </div>
      <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
        {error ? (
          <p className="rounded-md border border-red-800/80 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}
        <div>
          <label htmlFor="reg-email" className="mb-1 block text-sm text-slate-300">
            Email
          </label>
          <input
            id="reg-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
        <div>
          <label htmlFor="reg-username" className="mb-1 block text-sm text-slate-300">
            Username
          </label>
          <input
            id="reg-username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            maxLength={20}
            pattern="[a-zA-Z0-9_]{3,20}"
            title="3 to 20 characters: letters, numbers, underscores"
            placeholder="player_one"
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
        <div>
          <label htmlFor="reg-password" className="mb-1 block text-sm text-slate-300">
            Password
          </label>
          <input
            id="reg-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            maxLength={30}
            className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
        <div>
          <label htmlFor="reg-character-color" className="mb-1 block text-sm text-slate-300">
            Character color
          </label>
          <input
            id="reg-character-color"
            type="color"
            value={characterColor}
            onChange={(e) => setCharacterColor(e.target.value)}
            className="h-10 w-full cursor-pointer rounded-md border border-slate-700 bg-slate-900"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-sky-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Creating…" : "Create account"}
        </button>
      </form>
      <p className="text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link to="/login" className="text-sky-400 hover:text-sky-300">
          Sign in
        </Link>
      </p>
    </div>
  );
}
