import { dropdownFixtures } from "./dropdown/fixtures";
import { mcqFixtures } from "./mcq/fixtures";
import { shortAnswerFixtures } from "./short-answer/fixtures";
import { trueFalseFixtures } from "./true-false/fixtures";

/** Valid definitions per type id; the contract suite runs every one. */
export const fixturesByType: Record<string, unknown[]> = {
  mcq: mcqFixtures,
  "true-false": trueFalseFixtures,
  dropdown: dropdownFixtures,
  "short-answer": shortAnswerFixtures,
};
