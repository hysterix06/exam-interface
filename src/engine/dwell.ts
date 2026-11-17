// Time on each question, from the attempt's event log: the gaps between
// "view" events, without the time the tab was in the background (blur/focus)
// or the student was idle (idle/active). Approximate by nature, and always
// shown as such; never used for grading.

export interface DwellEvent {
  type: string;
  ts: Date;
  payload: unknown;
}

const itemOf = (e: DwellEvent) => {
  const p = e.payload as { itemId?: unknown } | null;
  return typeof p?.itemId === "string" ? p.itemId : null;
};

/**
 * Seconds per item between `start` and `end`. `firstItem` is credited with any
 * time before the first view (older attempts logged no views).
 */
export function dwellTimes(events: readonly DwellEvent[], start: Date, end: Date, firstItem: string | null = null): { seconds: Record<string, number>; current: string | null } {
  const inside = events.filter((e) => e.ts >= start && e.ts <= end).sort((a, b) => a.ts.getTime() - b.ts.getTime());
  const seconds: Record<string, number> = {};
  let current = firstItem;
  let away = false;
  let idle = false;
  let last = start.getTime();
  const credit = (until: number) => {
    if (current && !away && !idle && until > last) seconds[current] = (seconds[current] ?? 0) + (until - last) / 1000;
    last = until;
  };
  for (const e of inside) {
    credit(e.ts.getTime());
    if (e.type === "view") current = itemOf(e) ?? current;
    else if (e.type === "blur") away = true;
    else if (e.type === "focus") away = false;
    else if (e.type === "idle") idle = true;
    else if (e.type === "active") idle = false;
  }
  credit(end.getTime());
  for (const k of Object.keys(seconds)) seconds[k] = Math.round(seconds[k]);
  return { seconds, current };
}

export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** "45 s", "3 min 20 s". */
export function fmtDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
}
