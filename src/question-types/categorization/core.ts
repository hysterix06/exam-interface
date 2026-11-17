import { z } from "zod";
import { quote } from "@/engine/grading/format";
import { gradePairs } from "@/engine/grading/pairs";
import { defineQuestionType } from "@/engine/question-type";
import type { PreflightIssue } from "@/engine/types";

// Sort items into categories ("bucket sort"): each item belongs to exactly one
// category, categories can hold any number of items (or none).

const defSchema = z.object({
  stem: z.string(),
  categories: z.array(z.object({ id: z.string().min(1), name: z.string() })),
  items: z.array(z.object({ id: z.string().min(1), text: z.string(), category: z.string() })),
  /** Fraction of an item's share lost when it is sorted into the wrong category. */
  penalty: z.number().min(0).max(1).default(0),
});

const instanceSchema = z.object({
  stem: z.string(),
  categories: z.array(z.object({ id: z.string(), name: z.string() })),
  /** Shuffled per student. */
  items: z.array(z.object({ id: z.string(), text: z.string() })),
  key: z.record(z.string(), z.string()),
  penalty: z.number(),
});

const responseSchema = z.object({ placement: z.record(z.string(), z.string()) });

export type CategorizationDef = z.infer<typeof defSchema>;
export type CategorizationInstance = z.infer<typeof instanceSchema>;
export type CategorizationResponse = z.infer<typeof responseSchema>;

export const categorization = defineQuestionType<CategorizationDef, CategorizationInstance, CategorizationResponse>({
  id: "categorization",
  label: "Categorize",
  defSchema,
  instanceSchema,
  responseSchema,

  generate(def, rng) {
    return {
      instance: {
        stem: def.stem,
        categories: def.categories,
        items: rng.shuffle(def.items.map(({ id, text }) => ({ id, text }))),
        key: Object.fromEntries(def.items.map((i) => [i.id, i.category])),
        penalty: def.penalty,
      },
      vars: {},
    };
  },

  grade(inst, response, { points }) {
    const nameOf = (id: string) => inst.categories.find((c) => c.id === id)?.name ?? id;
    return gradePairs({
      rows: inst.items.map((i) => ({ id: i.id, label: i.text, expectedId: inst.key[i.id] })),
      given: response?.placement ?? {},
      textOf: nameOf,
      points,
      penalty: inst.penalty,
    });
  },

  keyResponse: (inst) => ({ placement: { ...inst.key } }),

  randomResponse: (inst, rng) => ({ placement: Object.fromEntries(inst.items.map((i) => [i.id, rng.pick(inst.categories).id])) }),

  // Every item in a category other than its own (needs at least two categories).
  wrongResponse(inst) {
    if (inst.categories.length < 2) return null;
    return {
      placement: Object.fromEntries(inst.items.map((i) => [i.id, inst.categories.find((c) => c.id !== inst.key[i.id])!.id])),
    };
  },

  estimateSeconds: (def) => 20 + 8 * def.items.length,

  analysisTokens: (_inst, r) => Object.entries(r.placement).filter(([, v]) => v).map(([i, c]) => `${i}=${c}`),
  tokenUniverse: (inst) => ({
    tokens: inst.items.flatMap((i) => inst.categories.map((c) => ({ id: `${i.id}=${c.id}`, text: `${i.text} → ${c.name}` }))),
    key: inst.items.map((i) => `${i.id}=${inst.key[i.id]}`),
  }),

  validateDef(def) {
    const issues: PreflightIssue[] = [];
    const block = (code: string, message: string, path?: string) => issues.push({ severity: "blocking", code, message, path });
    if (!def.stem.trim()) block("categorization.empty-stem", "The question has no text.", "stem");
    if (def.categories.length < 2) block("categorization.too-few-categories", "Add at least two categories.", "categories");
    if (def.items.length < 2) block("categorization.too-few-items", "Add at least two items to sort.", "items");
    const catIds = def.categories.map((c) => c.id);
    if (new Set(catIds).size !== catIds.length) block("categorization.duplicate-category-id", "Two categories share the same id.", "categories");
    const names = def.categories.map((c) => c.name.trim().toLowerCase());
    if (new Set(names).size !== names.length) block("categorization.duplicate-category", "Two categories have the same name.", "categories");
    def.categories.forEach((c, i) => {
      if (!c.name.trim()) block("categorization.empty-category", `Category ${i + 1} has no name.`, `categories[${i}].name`);
    });
    const ids = def.items.map((i) => i.id);
    if (new Set(ids).size !== ids.length) block("categorization.duplicate-item-id", "Two items share the same id.", "items");
    def.items.forEach((it, i) => {
      if (!it.text.trim()) block("categorization.empty-item", `Item ${i + 1} has no text.`, `items[${i}].text`);
      if (!catIds.includes(it.category)) block("categorization.no-category", `Choose a category for ${it.text.trim() ? quote(it.text) : `item ${i + 1}`}.`, `items[${i}].category`);
    });
    const texts = def.items.map((i) => i.text.trim().toLowerCase()).filter(Boolean);
    if (new Set(texts).size !== texts.length) issues.push({ severity: "warning", code: "categorization.duplicate-item", message: "Two items have the same text, so students can't tell them apart.", path: "items" });
    for (const c of def.categories) {
      if (c.name.trim() && !def.items.some((i) => i.category === c.id)) {
        issues.push({ severity: "warning", code: "categorization.empty-bucket", message: `Nothing belongs in ${quote(c.name)}. That's allowed, but check it's deliberate.`, path: "categories" });
      }
    }
    return issues;
  },

  redact: ({ key: _key, penalty: _penalty, ...rest }) => rest,
});
