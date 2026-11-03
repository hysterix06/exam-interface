import { describe, expect, it } from "vitest";
import { createRng } from "@/engine/rng";
import { tableFill } from "./core";
import { tableFillFixtures } from "./fixtures";

const def = tableFill.defSchema.parse(tableFillFixtures[0]);
const { instance } = tableFill.generate(def, createRng("t"));

describe("table fill", () => {
  it("makes one graded blank per blank cell with unique ids and located labels", () => {
    const r = tableFill.grade(instance, tableFill.keyResponse(instance), { points: 4 });
    expect(r.lines.map((l) => l.label)).toEqual(["Row 1, Quantity", "Row 2, Total ($)", "Row 3, Item", "Row 3, Total ($)"]);
    expect(r.score).toBe(4);
    const ids = Object.keys(tableFill.keyResponse(instance).blanks);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("scores each cell independently and explains misses", () => {
    const key = tableFill.keyResponse(instance).blanks;
    const ids = Object.keys(key);
    const r = tableFill.grade(instance, { blanks: { [ids[0]]: "5", [ids[1]]: "30.5", [ids[2]]: "cups" } }, { points: 4 });
    expect(r.lines.map((l) => l.verdict)).toEqual(["wrong", "correct", "correct", "unanswered"]);
    expect(r.score).toBe(2);
  });

  it("hides every answer from students but keeps given cells", () => {
    const shown = JSON.stringify(tableFill.redact(instance));
    expect(shown).toContain("Pens");
    expect(shown).not.toMatch(/accepted|"value"|"correct"|Mugs/);
  });

  it("flags structural and syntax problems", () => {
    const codes = (d: unknown) => tableFill.validateDef(tableFill.defSchema.parse(d)).map((i) => i.code);
    expect(codes({ stem: "", columns: [], rows: [] })).toEqual(
      expect.arrayContaining(["table-fill.empty-stem", "table-fill.no-columns", "table-fill.no-rows"]),
    );
    expect(codes({ stem: "x", columns: ["A", "B"], rows: [["only one"]] })).toContain("table-fill.ragged");
    expect(codes({ stem: "x", columns: ["A"], rows: [["{{num:x}}"]] })).toContain("table-fill.syntax");
    expect(codes({ stem: "x", columns: ["A"], rows: [["nothing to fill"]] })).toContain("table-fill.no-blanks");
    expect(tableFill.validateDef(def)).toEqual([]);
  });
});
