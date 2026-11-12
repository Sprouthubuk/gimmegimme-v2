/** Only ever send someone back to a path on this site (never //evil.com or https://…). */
export function safeNext(next: string | null | undefined, fallback = "/account"): string {
  if (!next || typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\r\n]/.test(next) || /^\/(api|sanctum|admin)(\/|$)/.test(next)) return fallback;
  return next.slice(0, 500);
}
