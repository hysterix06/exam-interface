import { dropdownUi } from "./dropdown/ui";
import { mcqUi } from "./mcq/ui";
import { shortAnswerUi } from "./short-answer/ui";
import { trueFalseUi } from "./true-false/ui";
import type { AnyQuestionTypeUi } from "./ui-types";

// UI registry (Editor/Renderer per type). Client-side only; the pure core
// registry in registry.ts is what the server and tests use.
const UIS: AnyQuestionTypeUi[] = [mcqUi, trueFalseUi, dropdownUi, shortAnswerUi];

export const questionTypeUis: ReadonlyMap<string, AnyQuestionTypeUi> = new Map(
  UIS.map((u) => [u.id, u]),
);

export function getQuestionTypeUi(id: string): AnyQuestionTypeUi {
  const ui = questionTypeUis.get(id);
  if (!ui) throw new Error(`No UI registered for question type "${id}"`);
  return ui;
}
