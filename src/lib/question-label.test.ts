import { describe, expect, it } from "vitest";
import { plainText, questionLabel } from "./question-label";

describe("questionLabel", () => {
  it("uses the stem, trimmed and shortened", () => {
    expect(questionLabel({ stem: "  What   is ATP? " })).toBe("What is ATP?");
    expect(questionLabel({ stem: "x".repeat(20) }, 10)).toBe(`${"x".repeat(9)}…`);
    expect(questionLabel({})).toBe("Untitled question");
    expect(questionLabel(null)).toBe("Untitled question");
  });

  it("falls back to a cloze template with blanks as ___", () => {
    expect(questionLabel({ template: "Paris is in {{text:France}}." })).toBe("Paris is in ___.");
  });

  it("strips Markdown and maths to plain words", () => {
    expect(questionLabel({ stem: "**Solve** $$x^2 = 4$$ for *x*" })).toBe("Solve x^2 = 4 for x");
    expect(plainText("![cell diagram](asset:abc) and [a link](https://x.y)")).toBe("cell diagram and a link");
    expect(plainText("# Title\n- one\n1. two\n> quote")).toBe("Title\none\ntwo\nquote");
    expect(plainText("| a | b |\n|---|---|\n| 1 | 2 |")).toBe("  a   b  \n\n  1   2  ");
    expect(plainText("Costs $5 and snake_case_name")).toBe("Costs $5 and snake_case_name");
  });
});
