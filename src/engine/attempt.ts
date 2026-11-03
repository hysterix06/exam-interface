import { getQuestionType } from "@/question-types/registry";
import { createRng, questionSeed } from "./rng";
import { selectQuestions } from "./selection/select";
import type { Blueprint, PoolItem, SelectionTrace } from "./selection/types";

/** A pool entry with everything needed to generate it. */
export interface AttemptPoolItem extends PoolItem {
  /** question_versions.id: seeds the instance and is what the attempt stores. */
  versionId: string;
  type: string;
  def: unknown;
}

export interface BuiltAttemptItem {
  position: number;
  questionId: string;
  versionId: string;
  type: string;
  points: number;
  instance: unknown;
  vars: Record<string, string | number | boolean>;
}

export interface BuiltAttempt {
  items: BuiltAttemptItem[];
  trace: SelectionTrace;
}

/**
 * Seed + blueprint + pool -> the exact exam one student gets. Pure and
 * deterministic: "reproduce" calls this again and diffs against the frozen
 * attempt_items.
 */
export function buildAttempt(
  attemptSeed: string,
  blueprint: Blueprint,
  pool: readonly AttemptPoolItem[],
): BuiltAttempt {
  const { questionIds, trace } = selectQuestions(
    blueprint,
    pool,
    createRng(attemptSeed).fork("selection"),
  );
  const byId = new Map(pool.map((q) => [q.id, q]));

  const items = questionIds.map((id, position) => {
    const q = byId.get(id)!;
    const type = getQuestionType(q.type);
    const def = type.defSchema.parse(q.def);
    const { instance, vars } = type.generate(def, createRng(questionSeed(attemptSeed, q.versionId)));
    return {
      position,
      questionId: q.id,
      versionId: q.versionId,
      type: q.type,
      points: q.points,
      instance,
      vars,
    };
  });

  return { items, trace };
}
