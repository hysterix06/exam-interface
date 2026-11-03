export type CsvCell = string | number | boolean | null | undefined;

/**
 * One CSV cell. Quotes when needed, and defuses spreadsheet formulas: a value
 * starting with = + - @ (or a tab/CR) would run as a formula when opened in
 * Excel or Sheets, and names/emails are user-controlled, so it gets a leading '.
 */
export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
