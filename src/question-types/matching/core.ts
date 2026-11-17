import { z } from "zod";
import { gradePairs } from "@/engine/grading/pairs";
import { defineQuestionType } from "@/engine/question-type";
import type { PreflightIssue } from "@/engine/types";

const pairSchema = z.object({ id: z.string().min(1), left: z.string(), right: z.string() });

const defSchema = z.object({
  stem: z.string(),
  pairs: z.array(pairSchema),
  /** Extra right-hand choices that match nothing. */
  distractors: z.array(z.string()).default([]),
});

const sideSchema = z.object({ id: z.string(), text: z.string() });

const instanceSchema = z.object({
  stem: z.string(),
  lefts: z.array(sideSchema),
  /** Shuffled; ids are the pair ids, or "x1", "x2"... for distractors. */
  rights: z.array(sideSchema),
  /** left id -> correct right id */
  key: z.record(z.string(), z.string()),
});

const responseSchema = z.object({ matches: z.record(z.string(), z.string()) });

export type MatchingDef = z.infer<typeof defSchema>;
export type MatchingInstance = z.infer<typeof instanceSchema>;
export type MatchingResponse = z.infer<typeof responseSchema>;

export const matching = defineQuestionType<MatchingDef, MatchingInstance, MatchingResponse>({
  id: "matching",
  label: "Matching",
  defSchema,
  instanceSchema,
  responseSchema,

  generate(def, rng) {
    const rights = [
      ...def.pairs.map((p) => ({ id: p.id, text: p.right })),
      ...def.distractors.map((text, i) => ({ id: `x${i + 1}`, text })),
    ];
    return {
      instance: {
        stem: def.stem,
        lefts: rng.shuffle(def.pairs.map((p) => ({ id: p.id, text: p.left }))),
        rights: rng.shuffle(rights),
        key: Object.fromEntries(def.pairs.map((p) => [p.id, p.id])),
      },
      vars: {},
    };
  },

  grade(inst, response, { points }) {
    const textOf = (id: string) => inst.rights.find((r) => r.id === id)?.text ?? id;
    return gradePairs({
      rows: inst.lefts.map((l) => ({ id: l.id, label: l.text, expectedId: inst.key[l.id] })),
      given: response?.matches ?? {},
      textOf,
      points,
    });
  },

  keyResponse: (inst) => ({ matches: { ...inst.key } }),

  randomResponse(inst, rng) {
    return { matches: Object.fromEntries(inst.lefts.map((l) => [l.id, rng.pick(inst.rights).id])) };
  },

  // Each left gets the next left's answer: with two or more pairs, every match is wrong.
  wrongResponse(inst) {
    const n = inst.lefts.length;
    if (n < 2) return null;
    return { matches: Object.fromEntries(inst.lefts.map((l, i) => [l.id, inst.key[inst.lefts[(i + 1) % n].id]])) };
  },

  estimateSeconds: (def) => 20 + 15 * def.pairs.length,

  analysisTokens: (_inst, r) => Object.entries(r.matches).filter(([, v]) => v).map(([l, v]) => `${l}=${v}`),
  tokenUniverse(inst) {
    const rights = new Map(inst.rights.map((r) => [r.id, r.text]));
    return {
      tokens: inst.lefts.flatMap((l) => inst.rights.map((r) => ({ id: `${l.id}=${r.id}`, text: `${l.text} → ${rights.get(r.id)}` }))),
      key: inst.lefts.map((l) => `${l.id}=${inst.key[l.id]}`),
    };
  },

  validateDef(def) {
    const issues: PreflightIssue[] = [];
    if (!def.stem.trim()) {
      issues.push({ severity: "blocking", code: "matching.empty-stem", message: "The question has no text.", path: "stem" });
    }
    if (def.pairs.length < 2) {
      issues.push({ severity: "blocking", code: "matching.too-few-pairs", message: "Add at least two pairs to match.", path: "pairs" });
    }
    def.pairs.forEach((p, i) => {
      if (!p.left.trim() || !p.right.trim()) {
        issues.push({ severity: "blocking", code: "matching.empty-pair", message: `Pair ${i + 1} is missing its left or right side.`, path: `pairs[${i}]` });
      }
    });
    const ids = def.pairs.map((p) => p.id);
    if (new Set(ids).size !== ids.length) {
      issues.push({ severity: "blocking", code: "matching.duplicate-id", message: "Two pairs share the same id.", path: "pairs" });
    }
    const rights = [...def.pairs.map((p) => p.right), ...def.distractors].map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (new Set(rights).size !== rights.length) {
      issues.push({
        severity: "blocking",
        code: "matching.ambiguous-right",
        message: "Two right-hand choices have the same text, so a correct match could be marked wrong.",
        path: "pairs",
      });
    }
    if (def.distractors.some((d) => !d.trim())) {
      issues.push({ severity: "blocking", code: "matching.empty-distractor", message: "One of the extra choices is blank.", path: "distractors" });
    }
    return issues;
  },

  redact({ key: _key, ...rest }) {
    return rest;
  },
});
