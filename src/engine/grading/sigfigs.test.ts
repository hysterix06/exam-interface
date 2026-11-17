import { describe, expect, it } from "vitest";
import { countSigFigs, matchesSigFigs, toSigFigs } from "./numeric";

describe("countSigFigs", () => {
  it.each([
    ["4.05", 3, 3],
    ["0.0040", 2, 2],
    ["-12.30", 4, 4],
    ["1.20e3", 3, 3],
    ["1200", 2, 4],
    ["1200.", 4, 4],
    ["0", 1, 1],
    ["0.000", 1, 1],
    ["7", 1, 1],
    ["100", 1, 3],
    ["3.0E-5", 2, 2],
  ])("%s has %i to %i significant figures", (text, min, max) => {
    expect(countSigFigs(text)).toEqual({ min, max });
  });

  it("rejects things that aren't plain numbers", () => {
    expect(countSigFigs("abc")).toBeNull();
    expect(countSigFigs("")).toBeNull();
  });
});

describe("toSigFigs", () => {
  it("keeps significant trailing zeros and uses exponents when it must", () => {
    expect(toSigFigs(2.5, 3)).toBe("2.50");
    expect(toSigFigs(0.004049, 2)).toBe("0.0040");
    expect(toSigFigs(1234.5, 2)).toBe("1.2e+3");
    expect(toSigFigs(-9.876, 3)).toBe("-9.88");
    expect(countSigFigs(toSigFigs(1234.5, 2))).toEqual({ min: 2, max: 2 });
  });
});

describe("matchesSigFigs", () => {
  it("accepts any reading of an ambiguous number", () => {
    expect(matchesSigFigs("1200", 3)).toBe(true);
    expect(matchesSigFigs("1200", 5)).toBe(false);
    expect(matchesSigFigs("4.05", 3)).toBe(true);
    expect(matchesSigFigs("4.050", 3)).toBe(false);
    expect(matchesSigFigs("x", 3)).toBe(false);
  });
});
