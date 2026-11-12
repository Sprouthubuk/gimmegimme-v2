// Every date and time is shown in UK time (Europe/London), whatever the visitor's timezone.
const TZ = "Europe/London";

export function ukDateTime(iso: string): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" });
  return `${day}, ${ukTime(iso)}`;
}

export function ukTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).replace(":00", "").replace(" ", "");
}

export function ukDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
}

/** "Sat 8pm" */
export function ukShortDay(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { timeZone: TZ, weekday: "short" })} ${ukTime(iso)}`;
}

export interface Remaining { days: number; hours: number; mins: number; secs: number; done: boolean }

export function remaining(iso: string, now = Date.now()): Remaining {
  const ms = Math.max(0, new Date(iso).getTime() - now);
  return {
    days: Math.floor(ms / 864e5),
    hours: Math.floor(ms / 36e5) % 24,
    mins: Math.floor(ms / 6e4) % 60,
    secs: Math.floor(ms / 1e3) % 60,
    done: ms === 0,
  };
}

/** "18d 10h", "5h 20m", "4m 10s", "Closed" */
export function endsIn(iso: string, now = Date.now()): string {
  const r = remaining(iso, now);
  if (r.done) return "Closed";
  if (r.days > 0) return `${r.days}d ${r.hours}h`;
  if (r.hours > 0) return `${r.hours}h ${r.mins}m`;
  return `${r.mins}m ${r.secs}s`;
}

/** "53 min ago", "6 days ago" */
export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "Just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}
