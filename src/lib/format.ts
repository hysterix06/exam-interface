/** Dates the way people say them: "Thu 14 Nov, 09:00"; the year only when it isn't this one. */
export function fmtDateTime(d: Date, now = new Date(), timeZone?: string) {
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleString("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDate(d: Date, now = new Date(), timeZone?: string) {
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-GB", { timeZone, day: "numeric", month: "short", year: sameYear ? undefined : "numeric" });
}

/** "in 3 days", "2 hours ago", "just now". */
export function fmtRelative(d: Date, now = new Date()) {
  const s = Math.round((d.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(s);
  if (abs < 45) return "just now";
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["minute", 60],
    ["hour", 3600],
    ["day", 86400],
    ["week", 604800],
    ["month", 2592000],
    ["year", 31536000],
  ];
  let unit = units[0];
  for (const u of units) if (abs >= u[1]) unit = u;
  return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(Math.round(s / unit[1]), unit[0]);
}

/** "12 questions", "1 question". */
export function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function percent(score: number | null, max: number | null) {
  if (score === null || !max) return null;
  return Math.round((score / max) * 100);
}
