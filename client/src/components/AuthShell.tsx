import { ReactNode } from "react";
import { AmbientBackground } from "./AmbientBackground";
import { BrandLogo } from "./BrandLogo";

type AuthShellProps = {
  children: ReactNode;
  eyebrow?: string;
  title: string;
  description?: string;
};

export function AuthShell({ children, eyebrow, title, description }: AuthShellProps) {
  return (
    <div className="relative min-h-screen">
      <AmbientBackground />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-12 sm:px-6">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo to="/" />
          {eyebrow ? (
            <p className="mt-6 text-xs font-medium uppercase tracking-[0.2em] text-amber-200/70">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-white">
            {title}
          </h1>
          {description ? (
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-400">{description}</p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
