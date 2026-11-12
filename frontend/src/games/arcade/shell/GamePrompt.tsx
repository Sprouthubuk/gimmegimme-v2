import type { ReactNode } from "react";

/** The line of text under a board: "Tap a duck to hook it" / "Hooked one!". */
export function GamePrompt({ title, sub, tone = "ink", children }: { title: ReactNode; sub?: ReactNode; tone?: "ink" | "pink" | "cyan"; children?: ReactNode }) {
  return (
    <div className="rg-prompt" aria-live="polite">
      <div className={`rg-prompt-title is-${tone}`}>{title}</div>
      {sub && <div className="rg-prompt-sub">{sub}</div>}
      {children}
    </div>
  );
}

export const RESULT_SET_NOTE = "Your result was set when you bought this ticket.";
