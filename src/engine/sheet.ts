import { HyperFormula } from "hyperformula";

// Pure spreadsheet helpers over HyperFormula. No DOM, no network: a sheet is a
// map of "A1" -> raw text ("10", "=A1*2"), evaluated into display values.

export const MAX_ROWS = 30;
export const MAX_COLS = 12;
const ADDR_RE = /^([A-Z]{1,2})([1-9][0-9]*)$/;

export function colName(i: number): string {
  let n = i;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export function colIndex(name: string): number {
  let n = 0;
  for (const ch of name) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function addr(row: number, col: number) {
  return `${colName(col)}${row + 1}`;
}

/** "B3" -> { row: 2, col: 1 }, or null if it isn't an address. */
export function parseAddr(a: string): { row: number; col: number } | null {
  const m = ADDR_RE.exec(a);
  return m ? { row: Number(m[2]) - 1, col: colIndex(m[1]) } : null;
}

export function inGrid(a: string, rows: number, cols: number) {
  const p = parseAddr(a);
  return p !== null && p.row < rows && p.col < cols;
}

export type CellValue = number | string | boolean | null;

export interface Evaluated {
  /** Display value of each non-empty cell. Errors come back as "#ERROR" text. */
  values: Record<string, CellValue>;
}

// Evaluation is a pure function of (size, contents), and building a HyperFormula
// instance is the slow part, so repeat evaluations (the same model solution, the
// same blank sheet) are served from a small cache.
const CACHE_MAX = 256;
const cache = new Map<string, Evaluated>();

/** Evaluate a sheet. The caller supplies already-merged raw text for every cell. */
export function evaluateSheet(rows: number, cols: number, raw: Readonly<Record<string, string>>): Evaluated {
  const key = `${rows}x${cols}:${JSON.stringify(Object.entries(raw).filter(([, t]) => t.trim() !== "").sort(([a], [b]) => a.localeCompare(b)))}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const result = evaluateUncached(rows, cols, raw);
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, result);
  return result;
}

function evaluateUncached(rows: number, cols: number, raw: Readonly<Record<string, string>>): Evaluated {
  const data: (string | number | null)[][] = Array.from({ length: rows }, () => Array<string | number | null>(cols).fill(null));
  for (const [a, text] of Object.entries(raw)) {
    const p = parseAddr(a);
    if (p && p.row < rows && p.col < cols && text.trim() !== "") data[p.row][p.col] = text.trim();
  }
  // 'gpl-v3' is the licence key HyperFormula's GPL terms call for.
  const hf = HyperFormula.buildFromArray(data, { licenseKey: "gpl-v3" });
  try {
    const values: Record<string, CellValue> = {};
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (data[r][c] === null) continue;
        const v = hf.getCellValue({ sheet: 0, row: r, col: c });
        values[addr(r, c)] = typeof v === "object" && v !== null ? "#ERROR" : v;
      }
    }
    return { values };
  } finally {
    hf.destroy();
  }
}

/** Do two evaluated cells agree? Numbers within tolerance, text ignoring case and spacing. */
export function sameValue(expected: CellValue, got: CellValue, tol: { abs?: number; rel?: number }): boolean {
  if (typeof expected === "number" && typeof got === "number") {
    const allowed = Math.max(tol.abs ?? 0, tol.rel ? Math.abs(expected) * tol.rel : 0);
    return Math.abs(expected - got) <= allowed + 1e-9 * Math.max(1, Math.abs(expected));
  }
  if (expected === null || got === null) return expected === got;
  return String(expected).trim().toLowerCase() === String(got).trim().toLowerCase();
}

export function showValue(v: CellValue | undefined): string {
  if (v === null || v === undefined) return "empty";
  return typeof v === "number" ? String(Number(v.toPrecision(12))) : String(v);
}
