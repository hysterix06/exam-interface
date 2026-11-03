import { z } from "zod";

/** A question as the selector sees it: no content, just drawing metadata. */
export interface PoolItem {
  id: string;
  topicId: string;
  /** Relative selection likelihood within its bucket; 0 = never drawn. */
  weight: number;
  difficulty: number;
  points: number;
  /** Variant group: at most one question per group per exam. */
  groupKey?: string | null;
  /** Questions that must never appear on the same exam as this one. */
  conflictsWith?: readonly string[];
}

export const blueprintSectionSchema = z.object({
  topicId: z.string(),
  count: z.number().int().min(1),
  /**
   * Optional exact count per difficulty level, e.g. { "1": 2, "3": 1 }.
   * Must add up to `count`.
   */
  difficultyMix: z.record(z.string(), z.number().int().min(0)).optional(),
});

export const blueprintSchema = z.object({
  sections: z.array(blueprintSectionSchema),
  shuffleQuestions: z.boolean().default(true),
});

export type BlueprintSection = z.infer<typeof blueprintSectionSchema>;
export type Blueprint = z.infer<typeof blueprintSchema>;

export interface SelectionPick {
  questionId: string;
  sectionIndex: number;
  difficulty: number | null;
  /** 1-based position in the weighted lottery for its bucket. */
  rank: number;
  candidates: number;
  /** Chance a single draw from this bucket would land on it (weight share). */
  weightShare: number;
}

export interface SelectionSkip {
  questionId: string;
  sectionIndex: number;
  reason: "variant-group" | "conflict";
  /** The already-chosen question that caused the skip. */
  because: string;
}

export interface SelectionTrace {
  picks: SelectionPick[];
  skips: SelectionSkip[];
  shuffled: boolean;
}

export interface SelectionResult {
  /** Question ids in exam order. */
  questionIds: string[];
  trace: SelectionTrace;
}
