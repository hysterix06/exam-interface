import type { z } from "zod";
import type { Rng } from "./rng";
import type { GenerateResult, GradeOpts, GradeResult, PreflightIssue } from "./types";

/**
 * The pure half of a question-type plugin. Everything here must run in the
 * browser preview, on the server and in tests, so no React and no DB.
 * The UI half (Editor, Renderer) lives in the type's ui.tsx.
 */
export interface QuestionTypeCore<TDef, TInstance, TResponse> {
  id: string;
  /** Human name for the editor and explanations. */
  label: string;
  /**
   * Graded by a person: grade() only flags the answer for review (score 0,
   * needsReview true), so "key = full marks" cannot hold for it.
   */
  manual?: boolean;
  /**
   * Responses are written by the server (e.g. from an uploaded file it
   * parsed), never by the browser's autosave.
   */
  serverResponse?: boolean;
  /**
   * One-time async setup (e.g. loading a sandbox) so that generate and grade
   * can stay synchronous. Callers await ensureTypesReady() before grading.
   */
  init?(): Promise<void>;
  /** What an author stores (the template). */
  defSchema: z.ZodType<TDef>;
  /** A generated, frozen instance (includes the answer key; server only). */
  instanceSchema: z.ZodType<TInstance>;
  responseSchema: z.ZodType<TResponse>;

  /** Template + seeded RNG -> concrete instance. Must be deterministic. */
  generate(def: TDef, rng: Rng): GenerateResult<TInstance>;
  /** Pure grading. A null response means unanswered. */
  grade(instance: TInstance, response: TResponse | null, opts: GradeOpts): GradeResult;
  /** The response a perfect student gives; must grade to full marks. */
  keyResponse(instance: TInstance): TResponse;
  /** A plausible random response, for simulations. */
  randomResponse(instance: TInstance, rng: Rng): TResponse;
  /**
   * A response that is wrong everywhere it can be (pre-flight's "wrong-answer
   * run"). Must score 0 or less: below 0 only through the question's own
   * penalty rules. null when no wrong answer exists (every option correct).
   * Omit for hand-marked types.
   */
  wrongResponse?(instance: TInstance): TResponse | null;
  /**
   * Rough seconds a typical student needs, for the blueprint's "estimated
   * time". A rule of thumb, shown as such; 60 when omitted.
   */
  estimateSeconds?(def: TDef): number;
  /**
   * How a person marks it, for types with hand-marked lines (long answer,
   * whiteboard, a passage with a written part). The marking queue is built
   * entirely from this, so it never needs to know the type.
   */
  review?: ReviewHook<TInstance, TResponse>;
  /**
   * Item analysis: the discrete choices a response made, as stable tokens
   * ("b", "left1=right3", "blank2=kettle"). Enables "which options students
   * chose" for any type with choices; omit for free-text types.
   */
  analysisTokens?(instance: TInstance, response: TResponse): string[];
  /** Every possible token with readable text, and which ones the key picks. */
  tokenUniverse?(instance: TInstance): {
    tokens: { id: string; text: string }[];
    key: string[];
    /** True when tokens are options a student picks between, so an unpicked wrong one is a "dead distractor". */
    options?: boolean;
  };
  /** Authoring problems (missing key, empty options...). */
  validateDef(def: TDef): PreflightIssue[];
  /** The instance with the answer key removed: the only thing sent to students. */
  redact(instance: TInstance): unknown;
}

export interface ReviewCriterion {
  id: string;
  text: string;
  /** Points this criterion is worth for this question. */
  points: number;
}

export interface ReviewAids {
  /** Typed text to show with highlights, when the answer is text. */
  text?: string;
  /** Words to highlight in `text`. */
  keywords?: string[];
  /** One-line notes for the marker: "212 words (limit 250)". Never set the score. */
  notes: string[];
}

export interface ReviewHook<TInstance, TResponse> {
  /** The checklist a marker ticks, scaled to the question's points. */
  criteria(instance: TInstance, points: number): ReviewCriterion[];
  /** The marker's ticks -> the final grade (machine-marked lines are recomputed alongside). */
  mark(instance: TInstance, response: TResponse | null, ticked: readonly string[], opts: GradeOpts): GradeResult;
  /** Scanning aids; informational only. */
  aids?(instance: TInstance, response: TResponse | null): ReviewAids;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyQuestionType = QuestionTypeCore<any, any, any>;

/** Identity helper that keeps the three type parameters inferred. */
export function defineQuestionType<TDef, TInstance, TResponse>(
  type: QuestionTypeCore<TDef, TInstance, TResponse>,
) {
  return type;
}
