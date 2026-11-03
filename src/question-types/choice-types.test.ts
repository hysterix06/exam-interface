import { describe, expect, it } from "vitest";
import { createRng } from "@/engine/rng";
import { blueprintSchema } from "@/engine/selection/types";
import { dropdown } from "./dropdown/core";
import { dropdownFixtures } from "./dropdown/fixtures";
import { trueFalse } from "./true-false/core";

describe("true-false", () => {
  const def = trueFalse.defSchema.parse({ stem: "Water boils at 100 °C at sea level.", answer: true, penalty: 0.5 });
  const { instance } = trueFalse.generate(def, createRng("x"));

  it("grades with negative marking", () => {
    expect(trueFalse.grade(instance, { value: true }, { points: 2 }).score).toBe(2);
    expect(trueFalse.grade(instance, { value: false }, { points: 2 }).score).toBe(-1);
  });

  it("requires a statement and hides the answer", () => {
    expect(trueFalse.validateDef({ ...def, stem: " " }).map((i) => i.code)).toEqual(["true-false.empty-stem"]);
    expect(trueFalse.redact(instance)).toEqual({ stem: def.stem, penalty: 0.5 });
  });
});

describe("dropdown", () => {
  const base = dropdown.defSchema.parse(dropdownFixtures[0]);
  const codes = (patch: Partial<typeof base>) => dropdown.validateDef({ ...base, ...patch }).map((i) => i.code);

  it("catches a missing answer, few options and blank text", () => {
    expect(codes({ answer: "nope" })).toContain("dropdown.no-answer");
    expect(codes({ options: [{ id: "m", text: "mitochondrion" }] })).toContain("dropdown.too-few-options");
    expect(codes({ options: [...base.options, { id: "e", text: "" }] })).toContain("dropdown.empty-option");
    expect(codes({ stem: "" })).toContain("dropdown.empty-stem");
  });

  it("keeps author order unless shuffling", () => {
    const { instance } = dropdown.generate({ ...base, shuffle: false }, createRng("x"));
    expect(instance.options.map((o) => o.id)).toEqual(["n", "m", "v"]);
  });
});

describe("blueprintSchema", () => {
  it("defaults to shuffled questions and rejects empty sections", () => {
    expect(blueprintSchema.parse({ sections: [{ topicId: "t", count: 2 }] }).shuffleQuestions).toBe(true);
    expect(() => blueprintSchema.parse({ sections: [{ topicId: "t", count: 0 }] })).toThrow();
  });
});
