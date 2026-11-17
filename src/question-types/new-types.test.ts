import { describe, expect, it } from "vitest";
import { createRng } from "@/engine/rng";
import { categorization } from "./categorization/core";
import { code } from "./code/core";
import { makeComposite } from "./composite/core";
import { FORMAT_HINT, withFormatHint } from "./hints";
import { getQuestionType } from "./registry";

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe("format hint", () => {
  it("adds the Markdown note to a field's own hint", () => {
    expect(withFormatHint()).toBe(FORMAT_HINT);
    expect(withFormatHint("Say what to do.")).toBe(`Say what to do. ${FORMAT_HINT}`);
  });
});

describe("categorization pre-flight", () => {
  it("catches empty, duplicate and unassigned items, and empty buckets", () => {
    const def = categorization.defSchema.parse({
      stem: "",
      categories: [{ id: "a", name: "A" }, { id: "a", name: "a" }, { id: "c", name: "" }],
      items: [{ id: "1", text: "", category: "zz" }, { id: "1", text: "x", category: "a" }, { id: "3", text: "X", category: "a" }],
    });
    expect(codes(categorization.validateDef(def))).toEqual(
      expect.arrayContaining(["categorization.empty-stem", "categorization.duplicate-category-id", "categorization.duplicate-category", "categorization.empty-category", "categorization.duplicate-item-id", "categorization.empty-item", "categorization.no-category", "categorization.duplicate-item"]),
    );
    const one = categorization.defSchema.parse({ stem: "s", categories: [{ id: "a", name: "A" }], items: [{ id: "1", text: "x", category: "a" }] });
    expect(categorization.wrongResponse!(categorization.generate(one, createRng("x")).instance)).toBeNull();
  });
});

describe("code pre-flight", () => {
  const base = { stem: "s", starter: "", solution: "const f = () => 1", tests: [{ id: "a", label: "", call: "f()", expected: "1" }] };
  it("catches missing pieces, bad JSON, failing solutions and a starter that already passes", () => {
    expect(codes(code.validateDef(code.defSchema.parse({ ...base, stem: "", solution: "", tests: [] })))).toEqual(expect.arrayContaining(["code.empty-stem", "code.no-tests", "code.no-solution"]));
    expect(codes(code.validateDef(code.defSchema.parse({ ...base, tests: [{ id: "a", label: "", call: "", expected: "{" }, { id: "a", label: "", call: "f()", expected: "1" }] })))).toEqual(expect.arrayContaining(["code.empty-call", "code.bad-expected", "code.duplicate-test"]));
    expect(codes(code.validateDef(code.defSchema.parse({ ...base, solution: "const f = () => 2" })))).toContain("code.solution-fails");
    expect(codes(code.validateDef(code.defSchema.parse({ ...base, starter: "const f = () => 1", tests: [{ ...base.tests[0], hidden: true }] })))).toEqual(expect.arrayContaining(["code.starter-passes", "code.all-hidden"]));
  });

  it("keeps hidden tests and the solution out of the student's view", () => {
    const inst = code.generate(code.defSchema.parse({ ...base, tests: [...base.tests, { id: "h", label: "", call: "f()", expected: "1", hidden: true }] }), createRng("x")).instance;
    expect(code.redact(inst)).toEqual({ stem: "s", language: "javascript", starter: "", tests: [{ id: "a", label: "", call: "f()", expected: "1" }] });
    const r = code.grade(inst, { code: "const f = () => 2" }, { points: 2 });
    expect(r.lines[1]).toMatchObject({ label: "Hidden test 2", expected: "hidden", got: "failed" });
  });
});

describe("composite pre-flight", () => {
  const composite = makeComposite((id) => getQuestionType(id));
  it("rejects nesting, unknown types, duplicate ids and broken parts, prefixing each part's issues", () => {
    const def = composite.defSchema.parse({
      stem: "",
      parts: [
        { id: "p", type: "composite", def: {} },
        { id: "p", type: "nope", def: {} },
        { id: "q", type: "mcq", def: { nonsense: true } },
        { id: "r", type: "true-false", def: { stem: "", answer: true } },
      ],
    });
    const issues = composite.validateDef(def);
    expect(codes(issues)).toEqual(expect.arrayContaining(["composite.empty", "composite.duplicate-id", "composite.nested", "composite.unknown-type", "composite.part-malformed", "true-false.empty-stem"]));
    expect(issues.find((i) => i.code === "true-false.empty-stem")!.message).toMatch(/^Part d: /);
    expect(() => composite.generate(composite.defSchema.parse({ stem: "s", parts: [{ id: "p", type: "composite", def: {} }] }), createRng("x"))).toThrow(/can't contain another passage/);
  });
});
