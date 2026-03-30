export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return port;
}

export const JWT_SECRET = requireEnv("JWT_SECRET");
export const CLIENT_ORIGIN = requireEnv("CLIENT_ORIGIN");
export const PORT = parsePort(requireEnv("PORT"));
