/**
 * HTTP + Socket.IO origin (host + port, no path). Set `VITE_API_URL` in `client/.env`.
 * In development, if unset, defaults to http://localhost:3002 so requests don’t hit Vite by mistake.
 */
export function getApiOrigin(): string {
  const raw = import.meta.env.VITE_API_URL;
  if (typeof raw === "string" && raw.trim() !== "") {
    return raw.replace(/\/$/, "");
  }
  if (import.meta.env.DEV) {
    return "http://localhost:3002";
  }
  return "";
}
