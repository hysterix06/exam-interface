import { createRng, questionSeed } from "./rng";
import type { GradeLine } from "./types";
import { getQuestionType } from "@/question-types/registry";

export interface RegradeInput {
  itemId: string;
  attemptId: string;
  attemptSeed: string;
  /** The version the student actually saw; its id seeds their instance. */
  oldVersionId: string;
  type: string;
  /** The definition to regrade against (the new version's). */
  newDef: unknown;
  response: unknown | null;
  points: number;
  oldScore: number;
}

export interface RegradeDiff {
  itemId: string;
  attemptId: string;
  oldScore: number;
  newScore: number;
  delta: number;
  /** The instance rebuilt from the new definition with the student's own seed. */
  instance: unknown;
  lines: GradeLine[];
  needsReview: boolean;
}

/**
 * What would change if a question's definition changed. Each student's
 * instance is regenerated from the NEW definition but their ORIGINAL seed
 * (attempt seed + the version they saw), so their option order and variable
 * values stay what they were, then their saved answer is graded against it.
 * Nothing is written: the caller shows the diff and applies it on confirm.
 */
export function regradeItems(inputs: readonly RegradeInput[]): RegradeDiff[] {
  return inputs.map((i) => {
    const type = getQuestionType(i.type);
    const def = type.defSchema.parse(i.newDef);
    const { instance } = type.generate(def, createRng(questionSeed(i.attemptSeed, i.oldVersionId)));
    const parsed = i.response === null ? null : type.responseSchema.safeParse(i.response);
    const response = parsed && parsed.success ? parsed.data : null;
    const r = type.grade(instance, response, { points: i.points });
    return {
      itemId: i.itemId,
      attemptId: i.attemptId,
      oldScore: i.oldScore,
      newScore: r.score,
      delta: Math.round((r.score - i.oldScore) * 10_000) / 10_000,
      instance,
      lines: r.lines,
      needsReview: r.needsReview,
    };
  });
}

/** JSON with object keys sorted: Postgres jsonb stores keys in its own order, so compare content, not text. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export interface ReproduceInput {
  stored: readonly { position: number; questionVersionId: string; instance: unknown }[];
  rebuilt: readonly { position: number; versionId: string; instance: unknown }[];
}

export interface ReproduceResult {
  identical: boolean;
  /** Plain-language differences, empty when identical. */
  differences: string[];
}

/** Compare a stored attempt with the same seed run through the selector and generators again. */
export function compareReproduction({ stored, rebuilt }: ReproduceInput): ReproduceResult {
  const differences: string[] = [];
  if (stored.length !== rebuilt.length) {
    differences.push(`The stored attempt has ${stored.length} questions but rebuilding gives ${rebuilt.length}.`);
  }
  for (const s of stored) {
    const r = rebuilt.find((x) => x.position === s.position);
    if (!r) continue;
    if (r.versionId !== s.questionVersionId) {
      differences.push(`Position ${s.position + 1}: a different question (or version) was drawn.`);
    } else if (canonical(r.instance) !== canonical(s.instance)) {
      differences.push(`Position ${s.position + 1}: same question, but the generated content differs (e.g. after a regrade).`);
    }
  }
  return { identical: differences.length === 0, differences };
}
