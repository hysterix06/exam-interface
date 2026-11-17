import { categorizationUi } from "./categorization/ui";
import { clozeUi } from "./cloze/ui";
import { codeUi } from "./code/ui";
import { makeCompositeUi } from "./composite/ui";
import { dropdownUi } from "./dropdown/ui";
import { fileTaskUi } from "./file-task/ui";
import { hotspotUi } from "./hotspot/ui";
import { labelDiagramUi } from "./label-diagram/ui";
import { longAnswerUi } from "./long-answer/ui";
import { matchingUi } from "./matching/ui";
import { mcqUi } from "./mcq/ui";
import { numericUi } from "./numeric/ui";
import { orderingUi } from "./ordering/ui";
import { shortAnswerUi } from "./short-answer/ui";
import { spreadsheetUi } from "./spreadsheet/ui";
import { tableFillUi } from "./table-fill/ui";
import { widgetUi } from "./widget/ui";
import { trueFalseUi } from "./true-false/ui";
import { whiteboardUi } from "./whiteboard/ui";
import type { AnyQuestionTypeUi } from "./ui-types";

// UI registry (Editor/Renderer per type). Client-side only; the pure core
// registry in registry.ts is what the server and tests use.
// Looked up lazily, so the passage UI can nest every other type's UI without a cycle.
const compositeUi = makeCompositeUi((id) => getQuestionTypeUi(id));

const UIS: AnyQuestionTypeUi[] = [mcqUi, trueFalseUi, dropdownUi, shortAnswerUi, orderingUi, matchingUi, categorizationUi, clozeUi, numericUi, longAnswerUi, tableFillUi, spreadsheetUi, fileTaskUi, widgetUi, hotspotUi, labelDiagramUi, whiteboardUi, codeUi, compositeUi];

export const questionTypeUis: ReadonlyMap<string, AnyQuestionTypeUi> = new Map(
  UIS.map((u) => [u.id, u]),
);

export function getQuestionTypeUi(id: string): AnyQuestionTypeUi {
  const ui = questionTypeUis.get(id);
  if (!ui) throw new Error(`No UI registered for question type "${id}"`);
  return ui;
}
