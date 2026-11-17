import { generateQuestion } from "./generate";
import { createRng, questionSeed } from "./rng";
import type { GradeLine } from "./types";
import { getQuestionType } from "@/question-types/registry";

export interface RegradeInput {
  itemId: string;
  attemptId: string;
  attemptSeed: string;
  /** The version the item was first drawn from; its id seeds the instance, before and after any regrade. */
  seedVersionId: string;
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
 * (attempt seed + the version they were first drawn), so their option order and variable
 * values stay what they were, then their saved answer is graded against it.
 * Nothing is written: the caller shows the diff and applies it on confirm.
 */
export function regradeItems(inputs: readonly RegradeInput[]): RegradeDiff[] {
  return inputs.map((i) => {
    const type = getQuestionType(i.type);
    const { instance } = generateQuestion(type, i.newDef, createRng(questionSeed(i.attemptSeed, i.seedVersionId)));
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
  attemptSeed: string;
  stored: readonly {
    position: number;
    /** The version the item was drawn and seeded from. */
    seedVersionId: string;
    /** The version it is graded against now (differs after a regrade). */
    questionVersionId: string;
    instance: unknown;
    /** Needed only for regraded items: the current version's number, type and definition. */
    version?: number;
    type?: string;
    def?: unknown;
  }[];
  rebuilt: readonly { position: number; versionId: string; instance: unknown }[];
}

export interface ReproduceResult {
  identical: boolean;
  /** Plain-language differences, empty when identical. */
  differences: string[];
  /** Things that are fine but worth saying, e.g. "regraded to version 2". */
  notes: string[];
}

/**
 * Compare a stored attempt with the same seed run through the selector and
 * generators again. A regraded item can't match the rebuild byte for byte (its
 * content comes from the new version), so it passes when it was drawn the same
 * way AND equals the new version generated from the student's original seed.
 */
export function compareReproduction({ attemptSeed, stored, rebuilt }: ReproduceInput): ReproduceResult {
  const differences: string[] = [];
  const notes: string[] = [];
  if (stored.length !== rebuilt.length) {
    differences.push(`The stored attempt has ${stored.length} questions but rebuilding gives ${rebuilt.length}.`);
  }
  for (const s of stored) {
    const r = rebuilt.find((x) => x.position === s.position);
    if (!r) continue;
    const at = `Position ${s.position + 1}`;
    if (r.versionId !== s.seedVersionId) {
      differences.push(`${at}: a different question (or version) was drawn.`);
    } else if (s.questionVersionId !== s.seedVersionId) {
      const label = s.version === undefined ? "a later version" : `version ${s.version}`;
      let expected: unknown = undefined;
      try {
        expected = generateQuestion(s.type ?? "", s.def, createRng(questionSeed(attemptSeed, s.seedVersionId))).instance;
      } catch {
        // Falls through to "doesn't match".
      }
      if (expected !== undefined && canonical(expected) === canonical(s.instance)) {
        notes.push(`${at}: regraded to ${label}; drawn and seeded identically.`);
      } else {
        differences.push(`${at}: regraded to ${label}, but the stored content doesn't match that version generated from this seed.`);
      }
    } else if (canonical(r.instance) !== canonical(s.instance)) {
      differences.push(`${at}: same question, but the generated content differs.`);
    }
  }
  return { identical: differences.length === 0, differences, notes };
}
