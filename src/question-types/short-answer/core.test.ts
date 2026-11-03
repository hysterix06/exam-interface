import { describe, expect, it } from "vitest";
import { createRng } from "@/engine/rng";
import { shortAnswer, type ShortAnswerDef } from "./core";
import { shortAnswerFixtures } from "./fixtures";

function gradeText(fixture: ShortAnswerDef, text: string) {
  const def = shortAnswer.defSchema.parse(fixture);
  const { instance } = shortAnswer.generate(def, createRng("x"));
  return shortAnswer.grade(instance, { text }, { points: 1 });
}

const [capital, colour, gravity, chromosomes] = shortAnswerFixtures;

describe("short-answer text", () => {
  it.each([
    ["Paris", 1],
    ["  paris ", 1],
    ["PARIS", 1],
    ["Pariss", 0],
    ["", 0],
  ])("%j scores %d", (text, score) => {
    expect(gradeText(capital, text).score).toBe(score);
  });

  it("explains which accepted answer matched", () => {
    expect(gradeText(capital, "paris").lines[0].note).toContain("Matches “Paris”");
  });
});

describe("short-answer regex", () => {
  it.each([
    ["color", 1],
    ["Colour", 1],
    ["colr", 0],
  ])("%j scores %d", (text, score) => {
    expect(gradeText(colour, text).score).toBe(score);
  });
});

describe("short-answer numeric", () => {
  it.each([
    ["9.81 m/s^2", 1],
    ["9.85 m/s²", 1],
    ["9.9 m/s^2", 0],
    ["9.81", 0], // unit required
    ["9.81 km", 0],
    ["nine", 0],
  ])("%j scores %d", (text, score) => {
    expect(gradeText(gravity, text).score).toBe(score);
  });

  it("is exact when no tolerance is set", () => {
    expect(gradeText(chromosomes, "46").score).toBe(1);
    expect(gradeText(chromosomes, "46.0").score).toBe(1);
    expect(gradeText(chromosomes, "46.01").score).toBe(0);
  });

  it("explains the miss in plain language", () => {
    expect(gradeText(gravity, "9.81").lines[0].note).toBe("The answer needs a unit.");
    expect(gradeText(gravity, "9.9 m/s^2").lines[0].note).toBe("Off by 0.09; accepted within ±0.05.");
  });
});

describe("short-answer validateDef", () => {
  const codes = (match: ShortAnswerDef["match"]) =>
    shortAnswer
      .validateDef(shortAnswer.defSchema.parse({ stem: "Q", match }))
      .map((i) => i.code);

  it("requires an accepted answer", () => {
    expect(codes({ kind: "text", accepted: [" "], caseSensitive: false, collapseWhitespace: true })).toContain(
      "short-answer.no-accepted",
    );
  });

  it("checks the regex compiles and accepts its own example", () => {
    expect(codes({ kind: "regex", pattern: "(", caseSensitive: false, example: "x" })).toContain(
      "short-answer.invalid-regex",
    );
    expect(codes({ kind: "regex", pattern: "a+", caseSensitive: false, example: "b" })).toContain(
      "short-answer.example-fails",
    );
  });

  it("warns about duplicate accepted answers", () => {
    expect(
      codes({ kind: "text", accepted: ["Paris", "paris"], caseSensitive: false, collapseWhitespace: true }),
    ).toContain("short-answer.duplicate-accepted");
  });
});
