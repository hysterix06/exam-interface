import { fmtNum } from "./format";

export interface Tolerance {
  /** Absolute: accept expected ± abs. */
  abs?: number;
  /** Relative: accept expected ± |expected| × rel (0.01 = 1%). */
  rel?: number;
}

export interface ParsedNumber {
  value: number;
  /** Trailing unit text, trimmed ("" if none). */
  unit: string;
}

const NUMBER_RE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(.*)$/i;
const THOUSANDS_RE = /^([+-]?\d{1,3}(?:,\d{3})+)(?=$|[.\se])/;

/**
 * Parse "4.05", "-1.2e3", "1,250 kg", "−3" (unicode minus). Commas are only
 * accepted as thousands separators, so "1,5" is rejected rather than guessed.
 */
export function parseNumberWithUnit(input: string): ParsedNumber | null {
  let s = input.trim().replace(/−/g, "-");
  s = s.replace(THOUSANDS_RE, (m) => m.replace(/,/g, ""));
  const m = NUMBER_RE.exec(s);
  if (!m) return null;
  const value = Number(m[1]);
  if (!Number.isFinite(value)) return null;
  const unit = m[2].trim();
  if (unit.startsWith(",")) return null;
  return { value, unit };
}

/** Largest accepted distance from the expected value. */
export function allowedError(expected: number, tol: Tolerance) {
  return Math.max(tol.abs ?? 0, tol.rel ? Math.abs(expected) * tol.rel : 0);
}

export function withinTolerance(expected: number, got: number, tol: Tolerance) {
  // A hair of slack so 0.1 + 0.2 counts as 0.3 under "exact".
  const epsilon = 1e-9 * Math.max(1, Math.abs(expected));
  return Math.abs(got - expected) <= allowedError(expected, tol) + epsilon;
}

/** "exactly", "±0.1", "±1%", or both when both are set. */
export function describeTolerance(tol: Tolerance) {
  const parts: string[] = [];
  if (tol.abs) parts.push(`±${fmtNum(tol.abs)}`);
  if (tol.rel) parts.push(`±${fmtNum(tol.rel * 100)}%`);
  if (parts.length === 0) return "exactly";
  if (parts.length === 1) return `within ${parts[0]}`;
  return `within ${parts.join(" or ")}, whichever is larger`;
}
