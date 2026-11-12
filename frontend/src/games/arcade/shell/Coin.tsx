import type { ScratchIcon } from "../games/generators";
import { sizeClass, toneFor, type Tone } from "../games/symbols";
import { Mascot } from "./Mascot";

// ︎ keeps these as plain text glyphs rather than emoji on phones.
const GLYPHS: Record<Exclude<ScratchIcon, "smile">, string> = {
  star: "★",
  heart: "♥︎",
  diamond: "♦︎",
  club: "♣︎",
};

/** Round token: a prize label, or a plain icon that stands for no prize. */
export function Coin({ label, tone, icon, className = "" }: { label?: string; tone?: Tone; icon?: ScratchIcon; className?: string }) {
  if (icon === "smile") {
    return (
      <span className={`rg-coin rg-coin-smile ${className}`}>
        <Mascot mood="smile" />
      </span>
    );
  }
  if (icon) {
    return (
      <span className={`rg-coin rg-tone-white ${className}`}>
        <span className="rg-coin-label rg-fit-l" aria-hidden="true">{GLYPHS[icon]}</span>
      </span>
    );
  }
  const t = tone ?? toneFor(label ?? "");
  return (
    <span className={`rg-coin rg-tone-${t} ${className}`}>
      <span className={`rg-coin-label ${sizeClass(label ?? "")}`}>{label}</span>
    </span>
  );
}
