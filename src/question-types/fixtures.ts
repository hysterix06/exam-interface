import { clozeFixtures } from "./cloze/fixtures";
import { dropdownFixtures } from "./dropdown/fixtures";
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

/** Valid definitions per type id; the contract suite runs every one. */
export const fixturesByType: Record<string, unknown[]> = {
  mcq: mcqFixtures,
  "true-false": trueFalseFixtures,
  dropdown: dropdownFixtures,
  "short-answer": shortAnswerFixtures,
  ordering: orderingFixtures,
  matching: matchingFixtures,
  cloze: clozeFixtures,
  numeric: numericFixtures,
  "long-answer": longAnswerFixtures,
  "table-fill": tableFillFixtures,
  spreadsheet: spreadsheetFixtures,
  widget: widgetFixtures,
};
