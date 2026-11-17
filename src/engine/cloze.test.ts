import { describe, expect, it } from "vitest";
import { createRng } from "./rng";
import { cloze } from "@/question-types/cloze/core";
import { parseCloze } from "./cloze";

describe("parseCloze", () => {
  it("parses text, number and dropdown blanks around plain text", () => {
    const p = parseCloze("A {{text:Paris|paris}} B {{num:4±0.5}} C {{num:100±5%}} D {{select:a|b*|c}} E");
    expect(p.errors).toEqual([]);
    expect(p.blanks.map((b) => b.id)).toEqual(["b1", "b2", "b3", "b4"]);
    expect(p.blanks[0]).toMatchObject({ kind: "text", accepted: ["Paris", "paris"] });
    expect(p.blanks[1]).toMatchObject({ kind: "num", value: 4, abs: 0.5, rel: 0 });
    expect(p.blanks[2]).toMatchObject({ kind: "num", value: 100, abs: 0, rel: 0.05 });
    expect(p.blanks[3]).toMatchObject({ kind: "select", options: ["a", "b", "c"], correct: "b" });
    expect(p.segments.filter((s) => s.kind === "lit").map((s) => (s as { text: string }).text)).toEqual(["A ", " B ", " C ", " D ", " E"]);
  });

  it("accepts a bare number as exact and +- as the margin sign", () => {
    expect(parseCloze("{{num:7}}").blanks[0]).toMatchObject({ value: 7, abs: 0, rel: 0 });
    expect(parseCloze("{{num:7+-2}}").blanks[0]).toMatchObject({ abs: 2 });
  });

  it("reports mistakes in plain language", () => {
    const msg = (t: string) => parseCloze(t).errors.join(" | ");
    expect(msg("no blanks here")).toMatch(/at least one blank/);
    expect(msg("{{text:}}")).toMatch(/Blank 1: add at least one accepted answer/);
    expect(msg("{{num:abc}}")).toMatch(/write a number/);
    expect(msg("{{select:a|b}}")).toMatch(/exactly one option as correct/);
    expect(msg("{{select:a*}}")).toMatch(/at least two options/);
    expect(msg("{{select:a*|A}}")).toMatch(/same text/);
    expect(msg("{{wat:x}}")).toMatch(/unknown blank type/);
    expect(msg("{{nokind}}")).toMatch(/unknown blank type/);
    expect(msg("start {{text:x")).toMatch(/closing/);
  });

  it("numbers messages by position even when an earlier blank is broken", () => {
    expect(parseCloze("{{num:x}} {{text:}}").errors[1]).toMatch(/^Blank 2/);
  });
});

describe("cloze type", () => {
  const def = cloze.defSchema.parse({ template: "{{text:Paris}} / {{num:10±1}} / {{select:x|y*}} / {{num:200±10%}}" });
  const { instance } = cloze.generate(def, createRng("c"));
  const ids = ["b1", "b2", "b3", "b4"];

  it("gives each blank an equal share with a line per blank", () => {
    const r = cloze.grade(instance, { blanks: { b1: " PARIS ", b2: "10.9", b3: "x", b4: "225" } }, { points: 4 });
    expect(r.lines.map((l) => l.verdict)).toEqual(["correct", "correct", "wrong", "wrong"]);
    expect(r.score).toBe(2);
    expect(r.lines[3].note).toMatch(/Off by 25/);
  });

  it("only counts plain numbers", () => {
    const r = cloze.grade(instance, { blanks: { b2: "ten", b4: "200 kg" } }, { points: 4 });
    expect(r.lines[1].note).toMatch(/Not a plain number/);
    expect(r.lines[3].note).toMatch(/Not a plain number/);
  });

  it("leaves unanswered blanks at zero, and blank attempts all unanswered", () => {
    const part = cloze.grade(instance, { blanks: { b1: "Paris" } }, { points: 4 });
    expect(part.score).toBe(1);
    expect(part.lines[1].verdict).toBe("unanswered");
    expect(cloze.grade(instance, null, { points: 4 }).lines.every((l) => l.verdict === "unanswered")).toBe(true);
  });

  it("shuffles dropdown options and hides the key from students", () => {
    const orders = new Set(Array.from({ length: 40 }, (_, s) => JSON.stringify((cloze.generate(def, createRng(`s${s}`)).instance.segments.find((x) => x.kind === "select") as { options: string[] }).options)));
    expect(orders.size).toBe(2);
    expect(JSON.stringify(cloze.redact(instance))).not.toMatch(/Paris|"correct"|"value"|accepted/);
    expect(Object.keys(cloze.keyResponse(instance).blanks)).toEqual(ids);
  });

  it("random students sometimes get things right and stay in range", () => {
    let total = 0;
    for (let s = 0; s < 200; s++) total += cloze.grade(instance, cloze.randomResponse(instance, createRng(`r${s}`)), { points: 1 }).score;
    expect(total).toBeGreaterThan(20);
    expect(total).toBeLessThan(150);
  });

  it("validateDef surfaces syntax problems and a missing sentence", () => {
    expect(cloze.validateDef({ template: "{{num:x}}" })[0]).toMatchObject({ severity: "blocking", code: "cloze.syntax" });
    expect(cloze.validateDef({ template: "{{text:a}}" }).map((i) => i.code)).toContain("cloze.no-context");
    expect(cloze.validateDef({ template: "Say {{text:a}}" })).toEqual([]);
  });
});

describe("chip blanks", () => {
  const def = cloze.defSchema.parse({ template: "{{chip:Paris}} is in {{chip:France}}; Rome is in {{text:Italy}}.", extraChips: ["Spain", " "] });

  it("parse only where chips are allowed", () => {
    expect(parseCloze("{{chip:Paris}}", { allowChips: true }).blanks[0]).toMatchObject({ kind: "chip", answer: "Paris" });
    expect(parseCloze("{{chip:Paris}}").errors[0]).toMatch(/only work in fill-in-the-blank/);
    expect(parseCloze("{{chip:}}", { allowChips: true }).errors[0]).toMatch(/write the chip/);
    expect(parseCloze("{{chip:a|b}}", { allowChips: true }).errors[0]).toMatch(/one answer/);
  });

  it("puts every answer and extra in one shuffled bank, and grades by chip text", () => {
    const { instance } = cloze.generate(def, createRng("chips"));
    expect([...instance.chips!].sort()).toEqual(["France", "Paris", "Spain"]);
    const r = cloze.grade(instance, { blanks: { b1: "Paris", b2: "Spain", b3: "italy" } }, { points: 3 });
    expect(r.lines.map((l) => l.verdict)).toEqual(["correct", "wrong", "correct"]);
    expect(cloze.redact(instance)).toMatchObject({ chips: instance.chips, segments: expect.arrayContaining([{ kind: "chip", id: "b1" }]) });
  });

  it("leaves questions without chips exactly as before", () => {
    const plain = cloze.defSchema.parse({ template: "A {{text:x}}" });
    expect(cloze.generate(plain, createRng("p")).instance).not.toHaveProperty("chips");
  });

  it("warns about extras that do nothing or repeat an answer", () => {
    const codes = (d: unknown) => cloze.validateDef(cloze.defSchema.parse(d)).map((i) => i.code);
    expect(codes({ template: "A {{text:x}}", extraChips: ["y"] })).toContain("cloze.extra-chips-unused");
    expect(codes({ template: "A {{chip:x}}", extraChips: ["x"] })).toContain("cloze.extra-chip-is-answer");
  });
});
