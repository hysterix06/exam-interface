import { categorizationFixtures } from "./categorization/fixtures";
import { clozeFixtures } from "./cloze/fixtures";
import { codeFixtures } from "./code/fixtures";
import { compositeFixtures } from "./composite/fixtures";
import { dropdownFixtures } from "./dropdown/fixtures";
import { fileTaskFixtures } from "./file-task/fixtures";
import { hotspotFixtures } from "./hotspot/fixtures";
import { labelDiagramFixtures } from "./label-diagram/fixtures";
import { longAnswerFixtures } from "./long-answer/fixtures";
import { matchingFixtures } from "./matching/fixtures";
import { mcqFixtures } from "./mcq/fixtures";
import { numericFixtures } from "./numeric/fixtures";
import { orderingFixtures } from "./ordering/fixtures";
import { shortAnswerFixtures } from "./short-answer/fixtures";
import { spreadsheetFixtures } from "./spreadsheet/fixtures";
import { tableFillFixtures } from "./table-fill/fixtures";
import { widgetFixtures } from "./widget/fixtures";
import { trueFalseFixtures } from "./true-false/fixtures";
import { whiteboardFixtures } from "./whiteboard/fixtures";

/** Valid definitions per type id; the contract suite runs every one. */
export const fixturesByType: Record<string, unknown[]> = {
  mcq: mcqFixtures,
  "true-false": trueFalseFixtures,
  dropdown: dropdownFixtures,
  "short-answer": shortAnswerFixtures,
  ordering: orderingFixtures,
  matching: matchingFixtures,
  categorization: categorizationFixtures,
  cloze: clozeFixtures,
  numeric: numericFixtures,
  "long-answer": longAnswerFixtures,
  "table-fill": tableFillFixtures,
  spreadsheet: spreadsheetFixtures,
  widget: widgetFixtures,
  "file-task": fileTaskFixtures,
  hotspot: hotspotFixtures,
  "label-diagram": labelDiagramFixtures,
  whiteboard: whiteboardFixtures,
  code: codeFixtures,
  composite: compositeFixtures,
};
