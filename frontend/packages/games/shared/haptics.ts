/** A short buzz on phones that support it (Android). Silently does nothing elsewhere or with reduced motion. */
export function buzz(pattern: number | number[], enabled = true): void {
  if (!enabled) return;
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
  } catch {
    /* not available */
  }
}
