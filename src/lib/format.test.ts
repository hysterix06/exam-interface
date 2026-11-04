import { describe, expect, it } from "vitest";
import { fmtRelative, percent, plural } from "./format";

describe("format", () => {
  const now = new Date("2026-11-03T12:00:00Z");
  it("says relative times plainly", () => {
    expect(fmtRelative(new Date("2026-11-03T12:00:20Z"), now)).toBe("just now");
    expect(fmtRelative(new Date("2026-11-03T14:00:00Z"), now)).toBe("in 2 hours");
    expect(fmtRelative(new Date("2026-11-01T12:00:00Z"), now)).toBe("2 days ago");
  });
  it("pluralises and rounds", () => {
    expect(plural(1, "question")).toBe("1 question");
    expect(plural(3, "question")).toBe("3 questions");
    expect(percent(7, 9)).toBe(78);
    expect(percent(null, 9)).toBeNull();
    expect(percent(3, 0)).toBeNull();
  });
});
