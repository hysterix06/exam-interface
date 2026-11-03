/** Round away float noise (0.1 + 0.2) without hiding real fractions. */
export function roundScore(n: number) {
  return Math.round(n * 10_000) / 10_000 + 0;
}

/** Human-readable number: no float noise, no trailing zeros. */
export function fmtNum(n: number) {
  if (!Number.isFinite(n)) return String(n);
  return String(Number(n.toPrecision(12)) + 0);
}

export function fmtPoints(n: number) {
  const r = roundScore(n);
  return `${fmtNum(r)} ${Math.abs(r) === 1 ? "point" : "points"}`;
}

export function quote(s: string) {
  return `“${s}”`;
}

/** "A", "A or B", "A, B or C". */
export function orList(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

export function sumPoints(lines: { points: number }[]) {
  return roundScore(lines.reduce((s, l) => s + l.points, 0));
}
