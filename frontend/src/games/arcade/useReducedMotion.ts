import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(cb: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", cb);
  return () => mql.removeEventListener("change", cb);
}

const getSnapshot = () => typeof window !== "undefined" && !!window.matchMedia?.(QUERY).matches;

/** An explicit prop wins; otherwise follow the OS setting. */
export function useReducedMotion(override?: boolean): boolean {
  const system = useSyncExternalStore(subscribe, getSnapshot, () => false);
  return override ?? system;
}
