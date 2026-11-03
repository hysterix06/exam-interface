import { z } from "zod";
import { fmtNum } from "@/engine/grading/format";
import { scoreOrder } from "@/engine/grading/order";
import { defineQuestionType } from "@/engine/question-type";
import type { GradeLine, PreflightIssue } from "@/engine/types";

const itemSchema = z.object({ id: z.string().min(1), text: z.string() });

const defSchema = z.object({
  stem: z.string(),
  /** Listed in the CORRECT order; students see them shuffled. */
  items: z.array(itemSchema),
});

const instanceSchema = z.object({
  stem: z.string(),
  /** In the order this student is shown them. */
  items: z.array(itemSchema),
  /** Item ids in the correct order. */
  key: z.array(z.string()),
});

const responseSchema = z.object({ order: z.array(z.string()) });

export type OrderingDef = z.infer<typeof defSchema>;
export type OrderingInstance = z.infer<typeof instanceSchema>;
export type OrderingResponse = z.infer<typeof responseSchema>;

export const ordering = defineQuestionType<OrderingDef, OrderingInstance, OrderingResponse>({
  id: "ordering",
  label: "Ordering",
  defSchema,
  instanceSchema,
  responseSchema,

  generate(def, rng) {
    const key = def.items.map((i) => i.id);
    // Never hand out the answer: reshuffle (a few times) if the draw is already sorted.
    let shown = rng.shuffle(def.items);
    for (let tries = 0; tries < 5 && def.items.length > 1 && shown.every((it, i) => it.id === key[i]); tries++) {
      shown = rng.shuffle(def.items);
    }
    return { instance: { stem: def.stem, items: shown, key }, vars: {} };
  },

  grade(inst, response, { points }) {
    const textOf = (id: string) => inst.items.find((i) => i.id === id)?.text ?? id;
    const expected = inst.key.map(textOf).join(" → ");
    const answer = response?.order ?? [];
    if (answer.length === 0) {
      return {
        score: 0,
        max: points,
        needsReview: false,
        lines: [{ label: "Order", expected, got: "no answer", verdict: "unanswered", points: 0, max: points }],
      };
    }
    const s = scoreOrder(inst.key, answer);
    const score = points * s.fraction;
    const line: GradeLine = {
      label: "Order",
      expected,
      got: answer.filter((id) => inst.key.includes(id)).map(textOf).join(" → "),
      verdict: s.fraction === 1 ? "correct" : s.concordant === 0 ? "wrong" : "partial",
      points: score,
      max: points,
      note:
        s.pairs === 0
          ? undefined
          : `${fmtNum(s.concordant)} of ${fmtNum(s.pairs)} pairs of items are in the right order, so ${fmtNum(Math.round(s.fraction * 1000) / 10)}% of the points.`,
    };
    return { score: Math.round(score * 10_000) / 10_000, max: points, needsReview: false, lines: [line] };
  },

  keyResponse: (inst) => ({ order: [...inst.key] }),

  randomResponse: (inst, rng) => ({ order: rng.shuffle(inst.key) }),

  validateDef(def) {
    const issues: PreflightIssue[] = [];
    if (!def.stem.trim()) {
      issues.push({ severity: "blocking", code: "ordering.empty-stem", message: "The question has no text.", path: "stem" });
    }
    if (def.items.length < 2) {
      issues.push({ severity: "blocking", code: "ordering.too-few-items", message: "Add at least two items to put in order.", path: "items" });
    }
    def.items.forEach((it, i) => {
      if (!it.text.trim()) {
        issues.push({ severity: "blocking", code: "ordering.empty-item", message: `Item ${i + 1} has no text.`, path: `items[${i}].text` });
      }
    });
    const ids = def.items.map((i) => i.id);
    if (new Set(ids).size !== ids.length) {
      issues.push({ severity: "blocking", code: "ordering.duplicate-id", message: "Two items share the same id.", path: "items" });
    }
    const texts = def.items.map((i) => i.text.trim().toLowerCase()).filter(Boolean);
    if (new Set(texts).size !== texts.length) {
      issues.push({ severity: "warning", code: "ordering.duplicate-text", message: "Two items have the same text, so students can't tell them apart.", path: "items" });
    }
    return issues;
  },

  redact({ key: _key, ...rest }) {
    return rest;
  },
});
