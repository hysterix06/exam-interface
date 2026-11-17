// The calendar as data: one dated list merging exams, assignments and course
// events, and a month laid out in whole weeks. Days are civil dates
// ("2026-11-17") in the viewer's time zone, which only the browser knows, so
// bucketing takes the zone as an argument.

export type CalendarKind = "exam-opens" | "exam-closes" | "assignment-due" | "event";

export interface CalendarItem {
  id: string;
  kind: CalendarKind;
  /** Course event kind (class, deadline, holiday, other) for kind "event". */
  eventKind?: "class" | "deadline" | "holiday" | "other";
  title: string;
  courseId: string;
  courseLabel: string;
  startsAt: string;
  endsAt?: string | null;
  allDay?: boolean;
  location?: string | null;
  description?: string | null;
  href?: string;
  /** A short status, e.g. "Submitted" or "Late". */
  status?: string;
}

export interface GridDay {
  date: string;
  inMonth: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
const civil = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** "2026-11" plus or minus whole months. */
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** The weeks covering a month; `weekStartsOn` 0 = Sunday, 1 = Monday. */
export function monthGrid(month: string, weekStartsOn: 0 | 1): GridDay[][] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() - weekStartsOn + 7) % 7;
  const start = new Date(Date.UTC(y, m - 1, 1 - lead));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const weeks = Math.ceil((lead + daysInMonth) / 7);
  const prefix = `${y}-${pad(m)}`;
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = civil(new Date(start.getTime() + (w * 7 + d) * 86_400_000));
      return { date, inMonth: date.startsWith(prefix) };
    }),
  );
}

/** The civil date of an instant in a time zone. */
export function dayKey(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const byStart = (a: CalendarItem, b: CalendarItem) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);

/** Items that overlap [from, to), earliest first. */
export function agenda(items: readonly CalendarItem[], from: Date, to: Date): CalendarItem[] {
  const f = from.getTime();
  const t = to.getTime();
  return items
    .filter((i) => {
      const s = Date.parse(i.startsAt);
      const e = i.endsAt ? Date.parse(i.endsAt) : s;
      return s < t && e >= f;
    })
    .sort(byStart);
}

/** An agenda split into days (by start), in the viewer's zone. */
export function groupByDay(items: readonly CalendarItem[], timeZone: string): { date: string; items: CalendarItem[] }[] {
  const out: { date: string; items: CalendarItem[] }[] = [];
  for (const i of [...items].sort(byStart)) {
    const date = dayKey(i.startsAt, timeZone);
    const last = out.at(-1);
    if (last?.date === date) last.items.push(i);
    else out.push({ date, items: [i] });
  }
  return out;
}
