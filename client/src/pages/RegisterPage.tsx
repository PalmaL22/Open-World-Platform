import { FormEvent, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { register as registerRequest } from "../api/auth";
import { AuthShell } from "../components/AuthShell";
import { isValidRegistrationEmail } from "../lib/email";
import { useAuthStore } from "../store/authStore";

export function RegisterPage() {
  const token = useAuthStore((s) => s.token);
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [characterColor, setCharacterColor] = useState("#3498db");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (token) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedEmail = email.trim().toLowerCase();
    if (!isValidRegistrationEmail(trimmedEmail)) {
      setError(
        "Please enter a valid email address from a supported provider (e.g., Gmail, Outlook, Yahoo, Hotmail, iCloud, etc).",
      );
      return;
    }
    setLoading(true);
    try {
      const { token: nextToken, user } = await registerRequest({
        email: trimmedEmail,
        password,
        username: username.trim(),
        characterColor,
      });
      login(nextToken, user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Join the platform"
      title="Create account"
      description="Set up your profile for live events and open-world rooms. Username: 3–20 letters, numbers, or underscores."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {error ? (
          <p className="rounded-lg border border-red-500/30 bg-red-950/50 px-3 py-2.5 text-sm text-red-100">
            {error}
          </p>
        ) : null}
        <div>
          <label htmlFor="reg-email" className="label-auth">
            Email
          </label>
          <input
            id="reg-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-auth"
          />
        </div>
        <div>
          <label htmlFor="reg-password" className="label-auth">
            Password
          </label>
          <input
            id="reg-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={30}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-auth"
          />
          <p className="mt-1.5 text-xs text-slate-500">8–30 characters.</p>
        </div>
        <div>
          <label htmlFor="reg-username" className="label-auth">
            Username
          </label>
          <input
            id="reg-username"
            type="text"
            autoComplete="username"
            required
            pattern="[a-zA-Z0-9_]{3,20}"
            title="3–20 characters: letters, numbers, underscores"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="player_name"
            className="input-auth"
          />
        </div>
        <div>
          <label htmlFor="reg-color" className="label-auth">
            Character color
          </label>
          <input
            id="reg-color"
            type="color"
            value={characterColor}
            onChange={(e) => setCharacterColor(e.target.value)}
            className="h-11 w-full cursor-pointer rounded-lg border border-slate-600/80 bg-slate-950/50 p-1 shadow-inner"
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary mt-1 w-full">
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-amber-300/90 hover:text-amber-200">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
