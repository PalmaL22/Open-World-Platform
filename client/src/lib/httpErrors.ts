import { isAxiosError } from "axios";
import { getApiOrigin } from "./apiOrigin";

/** User-facing message when the request never reached the API or the response was not JSON. */
export function getApiConnectionErrorMessage(err: unknown): string {
  const api = getApiOrigin() || "API (set VITE_API_URL for production)";
  if (isAxiosError(err)) {
    if (err.response?.data && typeof err.response.data === "object") {
      const msg = (err.response.data as { error?: unknown }).error;
      if (typeof msg === "string") return msg;
    }
    if (err.response) {
      return `Server responded with ${err.response.status} at ${api}.`;
    }
    if (err.code === "ERR_NETWORK" || err.message === "Network Error") {
      return `No response from ${api}. Open a terminal, run "npm run dev" in the server folder, then retry. Use the same port as PORT in server/.env (default 3002).`;
    }
    return `${err.message} — tried ${api}`;
  }
  return `Could not reach ${api}. Check that the API is running and CORS CLIENT_ORIGIN matches this page (try http://localhost:5173 rather than 127.0.0.1, or the reverse).`;
}
