import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";

/**
 * Turns a board's own SVG icon (a React element) into an image the 3D scene can paint onto a texture,
 * so the 3D version uses exactly the symbols the 2D one does. `defs` supplies shared gradients and
 * `css` the few text styles the icons use.
 */
export function svgElementToImage(el: ReactElement, { defs = null as ReactElement | null, css = "", size = 256 } = {}): Promise<HTMLImageElement> {
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() => root.render(el));
  let svg = host.innerHTML;
  let defsMarkup = "";
  if (defs) {
    const d = document.createElement("div");
    const r2 = createRoot(d);
    flushSync(() => r2.render(defs));
    const m = d.innerHTML.match(/<defs>[\s\S]*<\/defs>/);
    defsMarkup = m ? m[0] : "";
    r2.unmount();
  }
  root.unmount();
  svg = svg.replace(/<svg([^>]*)>/, (_m, attrs: string) => {
    const clean = attrs.replace(/\s(width|height)="[^"]*"/g, "");
    return `<svg xmlns="http://www.w3.org/2000/svg"${clean} width="${size}" height="${size}"><style>${css}</style>${defsMarkup}`;
  });
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}
