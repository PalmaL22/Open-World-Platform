import { useId } from "react";
import { Link } from "react-router-dom";

type BrandLogoProps = {
  to?: string;
  className?: string;
  size?: "sm" | "md";
};

export function BrandLogo({ to = "/", className = "", size = "md" }: BrandLogoProps) {
  const uid = useId().replace(/:/g, "");
  const planetGrad = `logo-planet-${uid}`;
  const glowGrad = `logo-glow-${uid}`;

  const iconClass =
    size === "sm" ? "h-12 w-12 rounded-2xl" : "h-16 w-16 rounded-2xl";
  const textClass = size === "sm" ? "text-lg" : "text-2xl";
  const svgClass = size === "sm" ? "h-10 w-10" : "h-12 w-12";

  const inner = (
    <>
      <span
        className={`flex ${iconClass} shrink-0 items-center justify-center bg-gradient-to-br from-cyan-500/20 via-slate-900/80 to-amber-500/15 ring-1 ring-white/10`}
      >
        <svg
          viewBox="0 0 32 32"
          className={svgClass}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <defs>
            <radialGradient id={planetGrad} cx="32%" cy="28%" r="70%">
              <stop offset="0%" stopColor="#a5f3fc" />
              <stop offset="45%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#0e7490" />
            </radialGradient>
            <radialGradient id={glowGrad} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fcd34d" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
            </radialGradient>
          </defs>

          <circle cx="23" cy="9" r="5" fill={`url(#${glowGrad})`} />

          <ellipse
            cx="16"
            cy="16"
            rx="13"
            ry="5"
            stroke="#fcd34d"
            strokeOpacity="0.55"
            strokeWidth="1"
            transform="rotate(-24 16 16)"
          />
          <circle cx="26.5" cy="12" r="1.35" fill="#fde68a" stroke="#fbbf24" strokeWidth="0.35" />

          <circle cx="16" cy="16" r="8.25" fill={`url(#${planetGrad})`} stroke="#67e8f9" strokeOpacity="0.35" strokeWidth="0.5" />

          <ellipse cx="16" cy="16" rx="3.2" ry="8.25" stroke="white" strokeOpacity="0.22" strokeWidth="0.65" />

          <ellipse cx="16" cy="12" rx="6.8" ry="2.1" stroke="white" strokeOpacity="0.18" strokeWidth="0.55" />
          <ellipse cx="16" cy="20" rx="6.8" ry="2.1" stroke="white" strokeOpacity="0.18" strokeWidth="0.55" />

          <path
            d="M 7.75 16 Q 16 18.5 24.25 16"
            stroke="white"
            strokeOpacity="0.2"
            strokeWidth="0.6"
            strokeLinecap="round"
          />

          <circle cx="12" cy="14" r="1.15" fill="#fef3c7" stroke="#fbbf24" strokeWidth="0.35" />
          <circle cx="19.5" cy="18.5" r="1.15" fill="#fef3c7" stroke="#fbbf24" strokeWidth="0.35" />
          <circle cx="16" cy="11.5" r="0.9" fill="#cffafe" stroke="#22d3ee" strokeWidth="0.3" />
          <path
            d="M 12 14 Q 14.5 12.5 16 11.5 Q 17.5 14.5 19.5 18.5"
            stroke="#fcd34d"
            strokeOpacity="0.75"
            strokeWidth="0.75"
            strokeLinecap="round"
            fill="none"
          />

          <path
            d="M 24 7.5 C 26.5 9 27.5 11 27.5 13"
            stroke="#fcd34d"
            strokeOpacity="0.5"
            strokeWidth="0.65"
            strokeLinecap="round"
          />
          <path
            d="M 25.5 6 C 28.5 8 30 10.5 30 13.5"
            stroke="#fcd34d"
            strokeOpacity="0.35"
            strokeWidth="0.55"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className={`font-display font-semibold tracking-tight ${textClass}`}>
        <span className="bg-gradient-to-r from-amber-100 via-white to-cyan-100 bg-clip-text text-transparent">
          Open World
        </span>
      </span>
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        className={`inline-flex items-center gap-4 transition-opacity hover:opacity-90 ${className}`}
      >
        {inner}
      </Link>
    );
  }

  return <span className={`inline-flex items-center gap-4 ${className}`}>{inner}</span>;
}
