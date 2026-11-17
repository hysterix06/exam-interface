import { z } from "zod";
import { assetRefSchema, checkAssetRef } from "@/engine/asset";
import { quote } from "@/engine/grading/format";
import { gradePairs } from "@/engine/grading/pairs";
import { defineQuestionType } from "@/engine/question-type";
import type { PreflightIssue } from "@/engine/types";

// Drag labels onto numbered pins on an image. Labels no pin uses are
// distractors. Pins are numbered in the order the author placed them.

const unit = z.number().min(0).max(1);
const defSchema = z.object({
  stem: z.string(),
  image: assetRefSchema.nullable(),
  pins: z.array(z.object({ id: z.string().min(1), x: unit, y: unit, labelId: z.string() })),
  labels: z.array(z.object({ id: z.string().min(1), text: z.string() })),
  penalty: z.number().min(0).max(1).default(0),
});
const instanceSchema = z.object({
  stem: z.string(),
  image: assetRefSchema.nullable(),
  pins: z.array(z.object({ id: z.string(), x: z.number(), y: z.number(), labelId: z.string() })),
  /** Shuffled per student. */
  labels: z.array(z.object({ id: z.string(), text: z.string() })),
  penalty: z.number(),
});
const responseSchema = z.object({ placement: z.record(z.string(), z.string()) });

export type LabelDiagramDef = z.infer<typeof defSchema>;
export type LabelDiagramInstance = z.infer<typeof instanceSchema>;
export type LabelDiagramResponse = z.infer<typeof responseSchema>;

export const labelDiagram = defineQuestionType<LabelDiagramDef, LabelDiagramInstance, LabelDiagramResponse>({
  id: "label-diagram",
  label: "Label the diagram",
  defSchema,
  instanceSchema,
  responseSchema,

  generate: (def, rng) => ({ instance: { ...def, labels: rng.shuffle(def.labels) }, vars: {} }),

  grade(inst, response, { points }) {
    const textOf = (id: string) => inst.labels.find((l) => l.id === id)?.text ?? id;
    return gradePairs({
      rows: inst.pins.map((p, i) => ({ id: p.id, label: `Pin ${i + 1}`, expectedId: p.labelId })),
      given: response?.placement ?? {},
      textOf,
      points,
      penalty: inst.penalty,
    });
  },

  keyResponse: (inst) => ({ placement: Object.fromEntries(inst.pins.map((p) => [p.id, p.labelId])) }),
  randomResponse: (inst, rng) => ({ placement: Object.fromEntries(inst.pins.map((p) => [p.id, rng.pick(inst.labels).id])) }),
  // Each pin gets a label that isn't its own (the next pin's, or a distractor).
  wrongResponse(inst) {
    const n = inst.pins.length;
    const wrong = (i: number) => inst.labels.find((l) => l.id !== inst.pins[i].labelId)?.id;
    if (inst.labels.length < 2 || n === 0) return null;
    return { placement: Object.fromEntries(inst.pins.map((p, i) => [p.id, wrong(i)!])) };
  },
  estimateSeconds: (def) => 20 + 12 * def.pins.length,

  analysisTokens: (_inst, r) => Object.entries(r.placement).filter(([, v]) => v).map(([p, l]) => `${p}=${l}`),
  tokenUniverse: (inst) => ({
    tokens: inst.pins.flatMap((p, i) => inst.labels.map((l) => ({ id: `${p.id}=${l.id}`, text: `Pin ${i + 1} → ${l.text}` }))),
    key: inst.pins.map((p) => `${p.id}=${p.labelId}`),
  }),

  validateDef(def) {
    const issues: PreflightIssue[] = [...checkAssetRef(def.image, "label-diagram", "image")];
    const block = (code: string, message: string, path?: string) => issues.push({ severity: "blocking", code, message, path });
    if (!def.stem.trim()) block("label-diagram.empty-stem", "The question has no text.", "stem");
    if (def.pins.length < 2) block("label-diagram.too-few-pins", "Place at least two pins on the image.", "pins");
    const labelIds = def.labels.map((l) => l.id);
    if (new Set(labelIds).size !== labelIds.length) block("label-diagram.duplicate-label-id", "Two labels share the same id.", "labels");
    const texts = def.labels.map((l) => l.text.trim().toLowerCase());
    if (new Set(texts).size !== texts.length) block("label-diagram.duplicate-label", "Two labels have the same text, so a right answer could be marked wrong.", "labels");
    def.labels.forEach((l, i) => {
      if (!l.text.trim()) block("label-diagram.empty-label", `Label ${i + 1} has no text.`, `labels[${i}].text`);
    });
    const pinIds = def.pins.map((p) => p.id);
    if (new Set(pinIds).size !== pinIds.length) block("label-diagram.duplicate-pin", "Two pins share the same id.", "pins");
    def.pins.forEach((p, i) => {
      if (!labelIds.includes(p.labelId)) block("label-diagram.pin-no-label", `Choose the correct label for pin ${i + 1}.`, `pins[${i}].labelId`);
    });
    const used = new Set(def.pins.map((p) => p.labelId));
    const repeated = def.labels.filter((l) => def.pins.filter((p) => p.labelId === l.id).length > 1);
    if (repeated.length) issues.push({ severity: "warning", code: "label-diagram.label-reused", message: `${repeated.map((l) => quote(l.text)).join(", ")} is the answer for more than one pin, but each label can only be placed once.`, path: "pins" });
    if (def.labels.length > 0 && def.labels.every((l) => used.has(l.id))) {
      issues.push({ severity: "warning", code: "label-diagram.no-distractors", message: "Every label is used, so the last one is a giveaway. Add a wrong label or two.", path: "labels" });
    }
    return issues;
  },

  redact: ({ stem, image, pins, labels }) => ({ stem, image, pins: pins.map(({ id, x, y }) => ({ id, x, y })), labels }),
});
