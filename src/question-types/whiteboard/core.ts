import { z } from "zod";
import { assetRefSchema, checkAssetRef } from "@/engine/asset";
import { markRubric, pendingRubric, rubricCriteria } from "@/engine/grading/rubric";
import { defineQuestionType } from "@/engine/question-type";
import type { PreflightIssue } from "@/engine/types";

// Draw an answer: a sketch, a graph, a labelled diagram. Marked by a person
// against a rubric, like a long answer. The drawing is stored as vectors in
// 0–1 coordinates (never pixels), simplified so a save stays small.

export const MAX_STROKES = 500;
const MAX_POINTS = 20_000;

const criterionSchema = z.object({ id: z.string().min(1), text: z.string(), points: z.number() });
const defSchema = z.object({
  stem: z.string(),
  /** Optional image to draw on (axes, a map, a diagram to annotate). */
  background: assetRefSchema.nullable().default(null),
  rubric: z.array(criterionSchema),
});
const instanceSchema = z.object({ stem: z.string(), background: assetRefSchema.nullable(), rubric: z.array(criterionSchema) });

const unit = z.number().min(0).max(1);
const strokeSchema = z.object({
  tool: z.enum(["pen", "marker", "eraser"]),
  points: z.array(z.tuple([unit, unit])).min(1).max(2000),
});
const responseSchema = z
  .object({ strokes: z.array(strokeSchema).max(MAX_STROKES) })
  .refine((r) => r.strokes.reduce((n, s) => n + s.points.length, 0) <= MAX_POINTS, { message: "The drawing is too detailed to save." });

export type WhiteboardDef = z.infer<typeof defSchema>;
export type WhiteboardInstance = z.infer<typeof instanceSchema>;
export type WhiteboardResponse = z.infer<typeof responseSchema>;

const drawn = (r: WhiteboardResponse | null) => (r?.strokes ?? []).some((s) => s.tool !== "eraser");

export const whiteboard = defineQuestionType<WhiteboardDef, WhiteboardInstance, WhiteboardResponse>({
  id: "whiteboard",
  label: "Drawing (whiteboard)",
  manual: true,
  defSchema,
  instanceSchema,
  responseSchema,

  generate: (def) => ({ instance: { stem: def.stem, background: def.background, rubric: def.rubric }, vars: {} }),

  grade: (inst, response, { points }) => pendingRubric(inst.rubric, drawn(response), points),

  review: {
    criteria: (inst, points) => rubricCriteria(inst.rubric, points),
    mark: (inst, _response, ticked, { points }) => markRubric(inst.rubric, ticked.filter((id) => inst.rubric.some((c) => c.id === id)), points),
    aids: (_inst, response) => {
      const strokes = (response?.strokes ?? []).filter((s) => s.tool !== "eraser").length;
      return { notes: [`${strokes} ${strokes === 1 ? "stroke" : "strokes"}`] };
    },
  },

  // A key "drawing" can't be right by machine; a cross in the middle stands in for one.
  keyResponse: () => ({ strokes: [{ tool: "pen", points: [[0.4, 0.4], [0.6, 0.6]] }, { tool: "pen", points: [[0.6, 0.4], [0.4, 0.6]] }] }),
  randomResponse: (_inst, rng) => ({
    strokes: Array.from({ length: rng.int(1, 5) }, () => ({ tool: "pen" as const, points: Array.from({ length: rng.int(2, 6) }, () => [rng.next(), rng.next()] as [number, number]) })),
  }),

  estimateSeconds: () => 300,

  validateDef(def) {
    const issues: PreflightIssue[] = [...checkAssetRef(def.background, "whiteboard", "background", false)];
    const block = (code: string, message: string, path?: string) => issues.push({ severity: "blocking", code, message, path });
    if (!def.stem.trim()) block("whiteboard.empty-stem", "The question has no text.", "stem");
    if (def.rubric.length === 0) block("whiteboard.no-rubric", "Add at least one rubric criterion so markers know what earns points.", "rubric");
    def.rubric.forEach((c, i) => {
      if (!c.text.trim()) block("whiteboard.empty-criterion", `Criterion ${i + 1} has no text.`, `rubric[${i}].text`);
      if (!(c.points > 0)) block("whiteboard.bad-weight", `Criterion ${i + 1} must be worth more than 0.`, `rubric[${i}].points`);
    });
    if (new Set(def.rubric.map((c) => c.id)).size !== def.rubric.length) block("whiteboard.duplicate-id", "Two criteria share the same id.", "rubric");
    issues.push({ severity: "warning", code: "whiteboard.manual", message: "Drawings are marked by hand. Results stay provisional until someone reviews them." });
    return issues;
  },

  redact: ({ stem, background }) => ({ stem, background }),
});
