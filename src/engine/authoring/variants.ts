import { createRng } from "../rng";
import { getQuestionType } from "@/question-types/registry";

export interface VariantRow {
  seed: string;
  vars: Record<string, string | number | boolean>;
  /** The full generated instance, answer key included (author eyes only). */
  instance: unknown;
  /** What a perfect student would answer for this variant. */
  key: unknown;
}

export type VariantResult =
  | { ok: true; rows: VariantRow[]; distinct: number }
  | { ok: false; error: string };

/**
 * The variant explorer: N generated versions of one question, side by side,
 * so an educator can spot-check the math and odd edge cases. Seeds are fixed
 * ("variant:1" ... ) so the same table shows up every time.
 */
export function exploreVariants(typeId: string, def: unknown, count = 20): VariantResult {
  try {
    const type = getQuestionType(typeId);
    const parsed = type.defSchema.parse(def);
    const rows = Array.from({ length: count }, (_, i): VariantRow => {
      const seed = `variant:${i + 1}`;
      const { instance, vars } = type.generate(parsed, createRng(seed));
      return { seed, vars, instance, key: type.keyResponse(instance) };
    });
    return { ok: true, rows, distinct: new Set(rows.map((r) => JSON.stringify(r.instance))).size };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
