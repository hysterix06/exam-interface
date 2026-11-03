import { z } from "zod";
import { parseCloze } from "@/engine/cloze";
import { checkBlank, expectedOf, keyOfBlank } from "@/engine/grading/blanks";
import { quote, roundScore } from "@/engine/grading/format";
import { defineQuestionType } from "@/engine/question-type";
import type { GradeLine, PreflightIssue } from "@/engine/types";

// A grid where some cells are given and some are blanks. Each cell is written
// in the cloze syntax: plain text is given, {{num:5}} / {{text:x}} / {{select:..}} is a blank.
const defSchema = z.object({
  stem: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});

const blankSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), id: z.string(), accepted: z.array(z.string()) }),
  z.object({ kind: z.literal("num"), id: z.string(), value: z.number(), abs: z.number(), rel: z.number() }),
  z.object({ kind: z.literal("select"), id: z.string(), options: z.array(z.string()), correct: z.string() }),
]);
const segmentSchema = z.union([z.object({ kind: z.literal("lit"), text: z.string() }), blankSchema]);

const instanceSchema = z.object({
  stem: z.string(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.array(segmentSchema))),
});
const responseSchema = z.object({ blanks: z.record(z.string(), z.string()) });

export type TableFillDef = z.infer<typeof defSchema>;
export type TableFillInstance = z.infer<typeof instanceSchema>;
export type TableFillResponse = z.infer<typeof responseSchema>;
type Blank = z.infer<typeof blankSchema>;
type Segment = z.infer<typeof segmentSchema>;

/** Parse every cell; blank ids become "r{row}c{col}b{n}" so they're unique across the grid. */
function parseGrid(def: TableFillDef) {
  const errors: string[] = [];
  const rows = def.rows.map((row, r) =>
    row.map((cell, c): Segment[] => {
      const parsed = parseCloze(cell, { allowNoBlanks: true });
      parsed.errors.forEach((e) => errors.push(`Row ${r + 1}, column ${c + 1}: ${e}`));
      return parsed.segments.map((s) => (s.kind === "lit" ? s : { ...s, id: `r${r}c${c}${s.id}` })) as Segment[];
    }),
  );
  return { rows, errors };
}

const blanksIn = (inst: TableFillInstance) =>
  inst.rows.flatMap((row, r) =>
    row.flatMap((cell, c) =>
      cell.filter((s): s is Blank => s.kind !== "lit").map((b) => ({ b, where: `Row ${r + 1}, ${inst.columns[c] || `column ${c + 1}`}` })),
    ),
  );

export const tableFill = defineQuestionType<TableFillDef, TableFillInstance, TableFillResponse>({
  id: "table-fill",
  label: "Table fill",
  defSchema,
  instanceSchema,
  responseSchema,

  generate(def, rng) {
    const { rows } = parseGrid(def);
    return {
      instance: {
        stem: def.stem,
        columns: def.columns,
        rows: rows.map((row) => row.map((cell) => cell.map((s) => (s.kind === "select" ? { ...s, options: rng.shuffle(s.options) } : s)))),
      },
      vars: {},
    };
  },

  grade(inst, response, { points }) {
    const all = blanksIn(inst);
    const share = points / all.length;
    const given = response?.blanks ?? {};
    const answered = all.some(({ b }) => (given[b.id] ?? "").trim() !== "");
    const lines = all.map(({ b, where }): GradeLine => {
      const got = (given[b.id] ?? "").trim();
      if (!answered || got === "") {
        return { label: where, expected: expectedOf(b), got: "no answer", verdict: "unanswered", points: 0, max: share };
      }
      const { ok, note } = checkBlank(b, got);
      return { label: where, expected: expectedOf(b), got: quote(got), verdict: ok ? "correct" : "wrong", points: ok ? share : 0, max: share, note };
    });
    return { score: roundScore(lines.reduce((s, l) => s + l.points, 0)), max: points, needsReview: false, lines };
  },

  keyResponse: (inst) => ({ blanks: Object.fromEntries(blanksIn(inst).map(({ b }) => [b.id, keyOfBlank(b)])) }),

  randomResponse(inst, rng) {
    return {
      blanks: Object.fromEntries(
        blanksIn(inst).map(({ b }) => {
          if (rng.next() < 0.33) return [b.id, keyOfBlank(b)];
          if (b.kind === "select") return [b.id, rng.pick(b.options)];
          if (b.kind === "num") return [b.id, String(b.value + rng.int(1, 9))];
          return [b.id, `guess ${rng.int(1, 999)}`];
        }),
      ),
    };
  },

  validateDef(def) {
    const issues: PreflightIssue[] = [];
    const block = (code: string, message: string, path?: string) => issues.push({ severity: "blocking", code, message, path });
    if (!def.stem.trim()) block("table-fill.empty-stem", "The question has no text.", "stem");
    if (def.columns.length < 1) block("table-fill.no-columns", "Add at least one column.", "columns");
    if (def.rows.length < 1) block("table-fill.no-rows", "Add at least one row.", "rows");
    def.rows.forEach((row, r) => {
      if (row.length !== def.columns.length) block("table-fill.ragged", `Row ${r + 1} has ${row.length} cells but there are ${def.columns.length} columns.`, `rows[${r}]`);
    });
    const { rows, errors } = parseGrid(def);
    errors.forEach((e) => block("table-fill.syntax", e));
    if (errors.length === 0 && def.rows.length > 0 && !rows.some((row) => row.some((cell) => cell.some((s) => s.kind !== "lit")))) {
      block("table-fill.no-blanks", "No cell is a blank. Write one as {{num:5}}, {{text:answer}} or {{select:a|b*}}.", "rows");
    }
    return issues;
  },

  redact(inst) {
    return {
      stem: inst.stem,
      columns: inst.columns,
      rows: inst.rows.map((row) =>
        row.map((cell) => cell.map((s) => (s.kind === "lit" ? s : s.kind === "select" ? { kind: "select", id: s.id, options: s.options } : { kind: s.kind, id: s.id }))),
      ),
    };
  },
});
