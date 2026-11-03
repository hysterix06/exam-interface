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
  /** Authoring problems (missing key, empty options...). */
  validateDef(def: TDef): PreflightIssue[];
  /** The instance with the answer key removed: the only thing sent to students. */
  redact(instance: TInstance): unknown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyQuestionType = QuestionTypeCore<any, any, any>;

/** Identity helper that keeps the three type parameters inferred. */
export function defineQuestionType<TDef, TInstance, TResponse>(
  type: QuestionTypeCore<TDef, TInstance, TResponse>,
) {
  return type;
}
