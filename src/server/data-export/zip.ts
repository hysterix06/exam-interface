import "server-only";
import { strToU8, zipSync, type Zippable } from "fflate";
import { toCsv } from "@/engine/csv";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUBMISSION_BUCKET } from "@/server/assignments/submit";
import { TABLE_NOTES, type DataExport, type Row } from "./collect";

/** Above this, handed-in files are listed but not bundled (download them from the app or the API). */
const MAX_FILE_BYTES = 200 * 1024 * 1024;

const cell = (v: unknown) => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : (v as string | number | boolean));

/** A table as CSV: one column per key seen in any row; nested values as JSON. */
export function tableCsv(rows: Row[]): string {
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return toCsv([cols, ...rows.map((r) => cols.map((c) => cell(r[c])))]);
}

function readme(d: DataExport, skipped: string[]): string {
  const lines = [
    "# Your Modus data",
    "",
    `Exported ${d.manifest.exportedAt} for ${d.manifest.person.name ?? d.manifest.person.email} (${d.manifest.person.role}). Scope: ${d.manifest.scope}.`,
    "",
    "Every table is here twice: `json/` keeps nested values as they are; `csv/` opens in any spreadsheet (nested values are JSON text).",
    "Times are UTC (ISO 8601). Ids link tables together (for example `submissions.assignmentId` → `assignments.id`).",
    "",
    "## Tables",
    "",
    ...Object.entries(d.manifest.tables).map(([t, n]) => `- \`${t}\` (${n} rows): ${TABLE_NOTES[t] ?? ""}`),
  ];
  if (Object.keys(d.sheets).length) lines.push("", "## Gradebooks", "", ...Object.keys(d.sheets).map((s) => `- \`csv/${s}.csv\`: one row per student, every item and the course grade.`));
  if (d.files.length) {
    lines.push("", "## Files", "", skipped.length ? `${d.files.length - skipped.length} handed-in files are in \`files/\`; ${skipped.length} were left out to keep the download small (see manifest.json).` : "Handed-in files are in `files/submissions/<submission id>/`.");
  }
  lines.push("", "The same data is available from the read-only API: see /api/v1/openapi.json.", "");
  return lines.join("\n");
}

/** The whole export as one ZIP. With `withFiles`, handed-in files are fetched from storage and bundled. */
export async function exportZip(d: DataExport, withFiles: boolean): Promise<Uint8Array> {
  const out: Zippable = {};
  for (const [name, rows] of Object.entries(d.tables)) {
    out[`json/${name}.json`] = strToU8(JSON.stringify(rows, null, 2));
    out[`csv/${name}.csv`] = strToU8(tableCsv(rows));
  }
  for (const [name, rows] of Object.entries(d.sheets)) out[`csv/${name}.csv`] = strToU8(toCsv(rows));

  const skipped: string[] = [];
  if (withFiles && d.files.length) {
    const storage = createAdminClient().storage.from(SUBMISSION_BUCKET);
    let total = 0;
    for (const f of d.files) {
      if (total > MAX_FILE_BYTES) {
        skipped.push(f.zipPath);
        continue;
      }
      const { data } = await storage.download(f.path);
      if (!data) {
        skipped.push(f.zipPath);
        continue;
      }
      const bytes = new Uint8Array(await data.arrayBuffer());
      total += bytes.length;
      out[f.zipPath] = [bytes, { level: 0 }];
    }
  } else {
    skipped.push(...d.files.map((f) => f.zipPath));
  }
  out["manifest.json"] = strToU8(JSON.stringify({ ...d.manifest, filesLeftOut: skipped }, null, 2));
  out["README.md"] = strToU8(readme(d, skipped));
  return zipSync(out, { level: 6 });
}
