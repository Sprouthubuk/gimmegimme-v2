import { useId } from "react";
import { useSkin } from "../skins/SkinContext";

export type MascotMood = "happy" | "wink" | "smile";

/**
 * The Gimme Gimme smiley. Under a skin with a hat (Christmas: a Santa hat) it wears it
 * everywhere it appears; `hat` overrides that.
 */
export function Mascot({ mood = "smile", className = "", hat }: { mood?: MascotMood; className?: string; hat?: "santa" | "none" }) {
  const fill = useId();
  const skinHat = useSkin().hat;
  const wearing = hat === "none" ? null : (hat ?? skinHat ?? null);
  return (
    <svg className={`rg-mascot ${className}`} viewBox={wearing ? "-6 -24 112 124" : "0 0 100 100"} aria-hidden="true">
      <defs>
        <radialGradient id={fill} cx="38%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff59a" />
          <stop offset="0.55" stopColor="#ffe11a" />
          <stop offset="1" stopColor="#f5b800" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="45" fill={`url(#${fill})`} stroke="#141414" strokeWidth="5" />
      {mood === "happy" && (
        <>
          <path d="M27 42 q7 -11 14 0" fill="none" stroke="#141414" strokeWidth="5" strokeLinecap="round" />
          <path d="M59 42 q7 -11 14 0" fill="none" stroke="#141414" strokeWidth="5" strokeLinecap="round" />
          <circle cx="22" cy="56" r="6" fill="#ff7cc3" opacity="0.8" />
          <circle cx="78" cy="56" r="6" fill="#ff7cc3" opacity="0.8" />
          <path d="M30 54 h40 q0 26 -20 26 q-20 0 -20 -26z" fill="#141414" />
          <path d="M38 72 q12 -9 24 0 q-4 8 -12 8 q-8 0 -12 -8z" fill="#ff2d95" />
        </>
      )}
      {mood === "wink" && (
        <>
          <ellipse cx="36" cy="40" rx="5" ry="8" fill="#141414" />
          <path d="M57 41 q8 -6 16 -2" fill="none" stroke="#141414" strokeWidth="5" strokeLinecap="round" />
          <path d="M28 58 q22 24 44 0" fill="none" stroke="#141414" strokeWidth="5.5" strokeLinecap="round" />
        </>
      )}
      {mood === "smile" && (
        <>
          <ellipse cx="37" cy="39" rx="5" ry="8.5" fill="#141414" />
          <ellipse cx="63" cy="39" rx="5" ry="8.5" fill="#141414" />
          <path d="M27 57 q23 24 46 0" fill="none" stroke="#141414" strokeWidth="5.5" strokeLinecap="round" />
        </>
      )}
      {wearing === "santa" && <SantaHat />}
    </svg>
  );
}

/** A floppy red hat with a white brim and bobble, drawn over the top of the smiley. */
function SantaHat() {
  return (
    <g className="rg-santa-hat">
      <path d="M14 22 C18 -8 52 -22 80 -10 C90 -6 96 2 98 12 L90 16 C86 4 78 -1 70 0 C78 8 82 16 84 24 Z" fill="#e0283a" stroke="#141414" strokeWidth="4.5" strokeLinejoin="round" />
      <path d="M30 4 C40 -6 56 -10 68 -6" fill="none" stroke="#ff8a96" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
      <rect x="8" y="16" width="82" height="16" rx="8" fill="#ffffff" stroke="#141414" strokeWidth="4.5" />
      <circle cx="96" cy="16" r="9" fill="#ffffff" stroke="#141414" strokeWidth="4.5" />
    </g>
  );
}
