import { z } from "zod";
import { assetRefSchema, checkAssetRef } from "@/engine/asset";
import { sumPoints } from "@/engine/grading/format";
import { type AnyQuestionType, defineQuestionType, type ReviewCriterion } from "@/engine/question-type";
import type { GradeLine, GradeResult, PreflightIssue } from "@/engine/types";

// Composite / passage: one stimulus (a reading, a data set) with several
// sub-questions of any other type. Each part is generated, graded, keyed and
// redacted by its own type; this type only shares out the points and prefixes
// the explanation lines ("Part b · Blank 2"), so the total still adds up.
//
// Built by a factory: the registry passes in a lookup, so this file never
// imports the registry that registers it.

export const COMPOSITE_ID = "composite";

const partDefSchema = z.object({
  /** Author-assigned and stable ("p1"): seeds the part, so adding a part never changes the others. */
  id: z.string().min(1),
  type: z.string(),
  /** Optional heading, e.g. "Reading the table". */
  label: z.string().optional(),
  /** Share of the question's points, relative to the other parts. */
  weight: z.number().gt(0).default(1),
  def: z.unknown(),
});

const defSchema = z.object({
  stem: z.string(),
  /** The shared material, as Markdown (tables, $$maths$$...). */
  stimulus: z.string().default(""),
  /** An optional figure shown with the passage (a graph, a map, a photo). */
  stimulusImage: assetRefSchema.optional(),
  parts: z.array(partDefSchema),
  shuffleParts: z.boolean().default(false),
});

const partInstanceSchema = z.object({
  id: z.string(),
  type: z.string(),
  label: z.string().optional(),
  weight: z.number(),
  instance: z.unknown(),
});

const instanceSchema = z.object({ stem: z.string(), stimulus: z.string(), stimulusImage: assetRefSchema.optional(), parts: z.array(partInstanceSchema) });
const responseSchema = z.object({ parts: z.record(z.string(), z.unknown()) });

export type CompositeDef = z.infer<typeof defSchema>;
export type CompositeInstance = z.infer<typeof instanceSchema>;
export type CompositeResponse = z.infer<typeof responseSchema>;
type PartInstance = CompositeInstance["parts"][number];

/** "a", "b", ... by position in this student's version. */
export const partLetter = (i: number) => String.fromCharCode(97 + (i % 26));

export function makeComposite(lookup: (id: string) => AnyQuestionType) {
  const child = (type: string) => {
    if (type === COMPOSITE_ID) throw new Error("A passage can't contain another passage.");
    return lookup(type);
  };
  const totalWeight = (parts: readonly { weight: number }[]) => parts.reduce((s, p) => s + p.weight, 0) || 1;
  const shareOf = (inst: CompositeInstance, p: PartInstance, points: number) => (points * p.weight) / totalWeight(inst.parts);
  const responseOf = (p: PartInstance, response: CompositeResponse | null) => {
    const raw = response?.parts[p.id];
    if (raw === undefined || raw === null) return null;
    const parsed = child(p.type).responseSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  };
  const prefix = (i: number, p: PartInstance, lines: GradeLine[]) =>
    lines.map((l) => ({ ...l, label: `Part ${partLetter(i)}${p.label ? ` (${p.label})` : ""} · ${l.label}` }));
  const combine = (points: number, parts: GradeResult[], inst: CompositeInstance): GradeResult => {
    const lines = parts.flatMap((r, i) => prefix(i, inst.parts[i], r.lines));
    return { score: sumPoints(lines), max: points, needsReview: parts.some((r) => r.needsReview), lines };
  };
  const reviewable = (inst: CompositeInstance) => inst.parts.some((p) => child(p.type).review);

  return defineQuestionType<CompositeDef, CompositeInstance, CompositeResponse>({
    id: COMPOSITE_ID,
    label: "Passage with questions",
    defSchema,
    instanceSchema,
    responseSchema,

    generate(def, rng) {
      const vars: Record<string, string | number | boolean> = {};
      const parts = def.parts.map((p): PartInstance => {
        const type = child(p.type);
        const r = type.generate(type.defSchema.parse(p.def), rng.fork(`part:${p.id}`));
        for (const [k, v] of Object.entries(r.vars)) vars[`${p.id}.${k}`] = v;
        return { id: p.id, type: p.type, ...(p.label ? { label: p.label } : {}), weight: p.weight, instance: r.instance };
      });
      return {
        instance: {
          stem: def.stem,
          stimulus: def.stimulus,
          ...(def.stimulusImage ? { stimulusImage: def.stimulusImage } : {}),
          parts: def.shuffleParts ? rng.fork("parts-order").shuffle(parts) : parts,
        },
        vars,
      };
    },

    grade(inst, response, { points }) {
      return combine(
        points,
        inst.parts.map((p) => child(p.type).grade(p.instance, responseOf(p, response), { points: shareOf(inst, p, points) })),
        inst,
      );
    },

    keyResponse: (inst) => ({ parts: Object.fromEntries(inst.parts.map((p) => [p.id, child(p.type).keyResponse(p.instance)])) }),

    randomResponse: (inst, rng) => ({
      parts: Object.fromEntries(inst.parts.map((p) => [p.id, child(p.type).randomResponse(p.instance, rng.fork(p.id))])),
    }),

    // Parts that can't be wrong by machine (hand-marked) are left unanswered.
    wrongResponse(inst) {
      const parts = Object.fromEntries(inst.parts.flatMap((p) => {
        const w = child(p.type).wrongResponse?.(p.instance) ?? null;
        return w === null ? [] : [[p.id, w]];
      }));
      return Object.keys(parts).length ? { parts } : null;
    },

    estimateSeconds: (def) =>
      60 +
      def.parts.reduce((s, p) => {
        try {
          const type = child(p.type);
          return s + (type.estimateSeconds?.(type.defSchema.parse(p.def)) ?? 60);
        } catch {
          return s + 60;
        }
      }, 0),

    review: {
      criteria(inst, points) {
        if (!reviewable(inst)) return [];
        return inst.parts.flatMap((p, i): ReviewCriterion[] => {
          const hook = child(p.type).review;
          if (!hook) return [];
          return hook.criteria(p.instance, shareOf(inst, p, points)).map((c) => ({ ...c, id: `${p.id}:${c.id}`, text: `Part ${partLetter(i)} · ${c.text}` }));
        });
      },
      mark(inst, response, ticked, { points }) {
        return combine(
          points,
          inst.parts.map((p) => {
            const type = child(p.type);
            const share = shareOf(inst, p, points);
            const mine = ticked.filter((t) => t.startsWith(`${p.id}:`)).map((t) => t.slice(p.id.length + 1));
            return type.review ? type.review.mark(p.instance, responseOf(p, response), mine, { points: share }) : type.grade(p.instance, responseOf(p, response), { points: share });
          }),
          inst,
        );
      },
      aids(inst, response) {
        return {
          notes: inst.parts.flatMap((p, i) => (child(p.type).review?.aids?.(p.instance, responseOf(p, response)).notes ?? []).map((n) => `Part ${partLetter(i)}: ${n}`)),
        };
      },
    },

    // Each part's own tokens, prefixed with the part ("p2/b1=kettle"), so passages get distractor analysis too.
    analysisTokens(inst, response) {
      return inst.parts.flatMap((p) => {
        const type = child(p.type);
        const r = responseOf(p, response);
        return type.analysisTokens && r !== null ? type.analysisTokens(p.instance, r).map((t) => `${p.id}/${t}`) : [];
      });
    },
    tokenUniverse(inst) {
      const parts = inst.parts.map((p, i) => ({ p, i, u: child(p.type).tokenUniverse?.(p.instance) }));
      return {
        tokens: parts.flatMap(({ p, i, u }) => (u?.tokens ?? []).map((t) => ({ id: `${p.id}/${t.id}`, text: `Part ${partLetter(i)} · ${t.text}` }))),
        key: parts.flatMap(({ p, u }) => (u?.key ?? []).map((k) => `${p.id}/${k}`)),
      };
    },

    validateDef(def) {
      const issues: PreflightIssue[] = [];
      const block = (code: string, message: string, path?: string) => issues.push({ severity: "blocking", code, message, path });
      if (!def.stem.trim() && !def.stimulus.trim() && !def.stimulusImage) block("composite.empty", "Add the passage or the question text.", "stem");
      if (def.stimulusImage) issues.push(...checkAssetRef(def.stimulusImage, "composite", "stimulusImage"));
      if (def.parts.length === 0) block("composite.no-parts", "Add at least one part.", "parts");
      const ids = def.parts.map((p) => p.id);
      if (new Set(ids).size !== ids.length) block("composite.duplicate-id", "Two parts share the same id.", "parts");
      def.parts.forEach((p, i) => {
        const where = `Part ${partLetter(i)}`;
        if (p.type === COMPOSITE_ID) return block("composite.nested", `${where}: a passage can't contain another passage.`, `parts[${i}].type`);
        let type: AnyQuestionType;
        try {
          type = child(p.type);
        } catch {
          return block("composite.unknown-type", `${where}: unknown question type “${p.type}”.`, `parts[${i}].type`);
        }
        const parsed = type.defSchema.safeParse(p.def);
        if (!parsed.success) return block("composite.part-malformed", `${where}: the question is incomplete.`, `parts[${i}].def`);
        for (const issue of type.validateDef(parsed.data)) {
          issues.push({ ...issue, message: `${where}: ${issue.message}`, path: `parts[${i}].def${issue.path ? `.${issue.path}` : ""}` });
        }
      });
      return issues;
    },

    redact: (inst) => ({
      stem: inst.stem,
      stimulus: inst.stimulus,
      ...(inst.stimulusImage ? { stimulusImage: inst.stimulusImage } : {}),
      parts: inst.parts.map((p) => ({ id: p.id, type: p.type, ...(p.label ? { label: p.label } : {}), instance: child(p.type).redact(p.instance) })),
    }),
  });
}
