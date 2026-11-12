import { useEffect, useRef } from "react";

/** Move focus to the main action for keyboard/screen-reader users without scrolling the reveal. */
export function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  return ref;
}
