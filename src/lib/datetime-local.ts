// <input type="datetime-local"> speaks the browser's local wall time without a
// zone; the server speaks ISO instants. Client-side only (uses the local zone).
const pad = (n: number) => String(n).padStart(2, "0");

/** ISO instant -> "2026-11-17T10:00" in the browser's zone ("" for none). */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "2026-11-17T10:00" (local) -> ISO instant, or null when empty or invalid. */
export function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
