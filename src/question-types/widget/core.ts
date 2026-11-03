import { z } from "zod";
import { fmtNum, quote, roundScore } from "@/engine/grading/format";
import { defineQuestionType } from "@/engine/question-type";
import type { GradeLine, PreflightIssue } from "@/engine/types";
import { MAX_STATE_BYTES, readPath, widgetById } from "@/engine/widget";

const checkSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("number"), id: z.string().min(1), label: z.string(), path: z.string(), expected: z.number(), abs: z.number().min(0).default(0) }),
  z.object({ kind: z.literal("text"), id: z.string().min(1), label: z.string(), path: z.string(), expected: z.string() }),
]);

const defSchema = z.object({
  stem: z.string(),
  /** One of the registered widgets (src/engine/widget.ts). */
  widget: z.string(),
  /** Passed to the widget on init, e.g. a menu or a scenario. */
  config: z.record(z.string(), z.unknown()).default({}),
  /** Checks run against the state the widget reports. */
  checks: z.array(checkSchema),
  /** The state of a perfect run; must pass every check. */
  solution: z.unknown(),
});

const instanceSchema = defSchema;
const responseSchema = z.object({ state: z.unknown() });

export type WidgetDef = z.infer<typeof defSchema>;
export type WidgetInstance = z.infer<typeof instanceSchema>;
export type WidgetResponse = z.infer<typeof responseSchema>;
type Check = WidgetDef["checks"][number];

function expectedText(c: Check) {
  return c.kind === "number" ? `${fmtNum(c.expected)}${c.abs ? ` ± ${fmtNum(c.abs)}` : ""}` : quote(c.expected);
}

function evaluate(c: Check, state: unknown): { ok: boolean; got: string } {
  const v = readPath(state, c.path);
  if (v === undefined || v === null) return { ok: false, got: "not reported" };
  if (c.kind === "number") {
    const n = typeof v === "number" ? v : Number.NaN;
    return { ok: Number.isFinite(n) && Math.abs(n - c.expected) <= c.abs + 1e-9 * Math.max(1, Math.abs(c.expected)), got: Number.isFinite(n) ? fmtNum(n) : quote(String(v)) };
  }
  return { ok: String(v).trim().toLowerCase() === c.expected.trim().toLowerCase(), got: quote(String(v)) };
}

const hasState = (r: WidgetResponse | null) => r !== null && r.state !== undefined && r.state !== null;

export const widget = defineQuestionType<WidgetDef, WidgetInstance, WidgetResponse>({
  id: "widget",
  label: "Interactive widget",
  defSchema,
  instanceSchema,
  responseSchema,

  generate: (def) => ({ instance: def, vars: {} }),

  grade(inst, response, { points }) {
    const share = inst.checks.length ? points / inst.checks.length : points;
    const answered = hasState(response);
    const lines = inst.checks.map((c): GradeLine => {
      if (!answered) return { label: c.label, expected: expectedText(c), got: "no answer", verdict: "unanswered", points: 0, max: share };
      const { ok, got } = evaluate(c, response!.state);
      return { label: c.label, expected: expectedText(c), got, verdict: ok ? "correct" : "wrong", points: ok ? share : 0, max: share, note: `Read “${c.path}” from the widget's state.` };
    });
    return { score: roundScore(lines.reduce((s, l) => s + l.points, 0)), max: points, needsReview: false, lines };
  },

  keyResponse: (inst) => ({ state: inst.solution }),

  randomResponse: (inst, rng) => (rng.next() < 0.33 ? { state: inst.solution } : { state: { total: rng.int(0, 99), order: [] } }),

  validateDef(def) {
    const issues: PreflightIssue[] = [];
    const block = (code: string, message: string, path?: string) => issues.push({ severity: "blocking", code, message, path });
    if (!def.stem.trim()) block("widget.empty-stem", "The question has no text.", "stem");
    if (!widgetById(def.widget)) block("widget.unknown", `There is no widget called “${def.widget}”.`, "widget");
    if (def.checks.length === 0) block("widget.no-checks", "Add at least one check so the task can be graded.", "checks");
    const ids = def.checks.map((c) => c.id);
    if (new Set(ids).size !== ids.length) block("widget.duplicate-check", "Two checks share the same id.", "checks");
    def.checks.forEach((c, i) => {
      if (!c.label.trim() || !c.path.trim()) block("widget.incomplete-check", `Check ${i + 1} needs a label and a path.`, `checks[${i}]`);
    });
    if (def.solution === undefined || def.solution === null) {
      block("widget.no-solution", "Add the state of a perfect run, so the key can be checked.", "solution");
    } else {
      if (JSON.stringify(def.solution).length > MAX_STATE_BYTES) block("widget.solution-too-big", "The solution state is too large.", "solution");
      for (const c of def.checks) {
        if (!evaluate(c, def.solution).ok) block("widget.solution-fails", `The solution doesn't pass the check “${c.label}”. Either the check or the solution is wrong.`, "solution");
      }
    }
    return issues;
  },

  // The student only needs the scenario; checks and the solution stay server-side.
  redact: ({ stem, widget: w, config }) => ({ stem, widget: w, config }),
});
