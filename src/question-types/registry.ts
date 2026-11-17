import type { AnyQuestionType } from "@/engine/question-type";
import { categorization } from "./categorization/core";
import { makeComposite } from "./composite/core";
import { cloze } from "./cloze/core";
import { code } from "./code/core";
import { dropdown } from "./dropdown/core";
import { fileTask } from "./file-task/core";
import { hotspot } from "./hotspot/core";
import { labelDiagram } from "./label-diagram/core";
import { longAnswer } from "./long-answer/core";
import { matching } from "./matching/core";
import { mcq } from "./mcq/core";
import { numeric } from "./numeric/core";
import { ordering } from "./ordering/core";
import { shortAnswer } from "./short-answer/core";
import { spreadsheet } from "./spreadsheet/core";
import { tableFill } from "./table-fill/core";
import { widget } from "./widget/core";
import { trueFalse } from "./true-false/core";
import { whiteboard } from "./whiteboard/core";

// Core (pure) registry: server grading, generation, tests. The UI registry
// (Editor/Renderer per type) is separate so this never pulls in React.
// The passage type delegates to the others, looked up lazily (no import cycle).
const composite = makeComposite((id) => getQuestionType(id));

const TYPES: AnyQuestionType[] = [mcq, trueFalse, dropdown, shortAnswer, ordering, matching, categorization, cloze, numeric, longAnswer, tableFill, spreadsheet, fileTask, widget, hotspot, labelDiagram, whiteboard, code, composite];

export const questionTypes: ReadonlyMap<string, AnyQuestionType> = new Map(
  TYPES.map((t) => [t.id, t]),
);

export function getQuestionType(id: string): AnyQuestionType {
  const type = questionTypes.get(id);
  if (!type) throw new Error(`Unknown question type "${id}"`);
  return type;
}

let ready: Promise<void> | null = null;

/**
 * Finish every type's async setup (the code sandbox). Grading is synchronous,
 * so anything that grades or validates code questions awaits this first.
 * Memoized: the first call does the work, later calls are free.
 */
export function ensureTypesReady(): Promise<void> {
  ready ??= Promise.all(TYPES.map((t) => t.init?.())).then(() => undefined);
  return ready;
}
