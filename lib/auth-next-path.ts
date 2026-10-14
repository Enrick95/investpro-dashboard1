const LOCAL_ORIGIN = "https://investpro.invalid";

function permittedPath(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/")) return false;
  if (/[\\\u0000-\u0020\u007f]/.test(value)) return false;
  try {
    const parsed = new URL(value, LOCAL_ORIGIN);
    if (parsed.origin !== LOCAL_ORIGIN) return false;
    // Route segments are deliberate: encoded separators and dot traversal are not destinations.
    const path = value.split(/[?#]/, 1)[0];
    return path === "/vip" || /^\/dashboard(?:\/[A-Za-z0-9_-]+)*\/?$/.test(path);
  } catch {
    return false;
  }
}

export function safeNextPath(value: unknown, fallback = "/dashboard"): string {
  if (permittedPath(value)) return value;
  return permittedPath(fallback) ? fallback : "/dashboard";
}
