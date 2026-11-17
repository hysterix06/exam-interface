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

const topicLimitSchema = z.object({
  min: z.number().int().min(0).optional(),
  max: z.number().int().min(0).optional(),
});

export const blueprintSectionSchema = z
  .object({
    topicId: z.string(),
    /** More topics drawn in the same lottery as `topicId` ("5 from Genetics or Ecology"). */
    extraTopicIds: z.array(z.string()).optional(),
    count: z.number().int().min(1),
    /**
     * Optional exact count per difficulty level, e.g. { "1": 2, "3": 1 }.
     * Must add up to `count`.
     */
    difficultyMix: z.record(z.string(), z.number().int().min(0)).optional(),
    /** Per-topic minimum/maximum within the section, e.g. { genetics: { min: 2 } }. */
    limits: z.record(z.string(), topicLimitSchema).optional(),
  })
  .refine((s) => !(s.limits && s.difficultyMix), {
    message: "A section can control the difficulty mix or per-topic limits, not both.",
    path: ["limits"],
  });

export type TopicLimit = z.infer<typeof topicLimitSchema>;

export const blueprintSchema = z.object({
  sections: z.array(blueprintSectionSchema),
  shuffleQuestions: z.boolean().default(true),
});

export type BlueprintSection = z.infer<typeof blueprintSectionSchema>;
export type Blueprint = z.infer<typeof blueprintSchema>;

/** Every topic a section draws from, main topic first, without repeats. */
export function sectionTopics(section: Pick<BlueprintSection, "topicId" | "extraTopicIds">): string[] {
  return [...new Set([section.topicId, ...(section.extraTopicIds ?? [])])];
}

/** Every topic the blueprint draws from, in section order. */
export function blueprintTopics(blueprint: Pick<Blueprint, "sections">): string[] {
  return [...new Set(blueprint.sections.flatMap(sectionTopics))];
}

export interface SelectionPick {
  questionId: string;
  sectionIndex: number;
  difficulty: number | null;
  /** 1-based position in the weighted lottery for its bucket. */
  rank: number;
  candidates: number;
  /** Chance a single draw from this bucket would land on it (weight share). */
  weightShare: number;
  /** Multi-topic sections only: the topic it came from. */
  topicId?: string;
  /** Sections with limits only: taken to meet a topic's minimum, or on rank. */
  via?: "minimum" | "rank";
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
