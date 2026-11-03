import type { AnyQuestionType } from "@/engine/question-type";
import { dropdown } from "./dropdown/core";
import { mcq } from "./mcq/core";
import { shortAnswer } from "./short-answer/core";
import { trueFalse } from "./true-false/core";

// Core (pure) registry: server grading, generation, tests. The UI registry
// (Editor/Renderer per type) is separate so this never pulls in React.
const TYPES: AnyQuestionType[] = [mcq, trueFalse, dropdown, shortAnswer];

export const questionTypes: ReadonlyMap<string, AnyQuestionType> = new Map(
  TYPES.map((t) => [t.id, t]),
);

export function getQuestionType(id: string): AnyQuestionType {
  const type = questionTypes.get(id);
  if (!type) throw new Error(`Unknown question type "${id}"`);
  return type;
}
