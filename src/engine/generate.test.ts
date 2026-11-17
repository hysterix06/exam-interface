import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixturesByType } from "@/question-types/fixtures";
import { getQuestionType } from "@/question-types/registry";
import { generateQuestion, joinDef, placeholdersIn, splitDef, substitute, validateQuestion } from "./generate";
import { createRng } from "./rng";

const mcq = fixturesByType.mcq[0] as Record<string, unknown>;
const withVars = {
  ...mcq,
  stem: "[[name]] asks: which organelle makes ATP in [[place]]?",
  textVars: {
    table: [
      { name: "Ana", place: "Lisbon" },
      { name: "Kofi", place: "Accra" },
      { name: "Mei", place: "Taipei" },
    ],
    lists: [],
  },
};

describe("generateQuestion", () => {
  it("is exactly the type's own generator when there are no wording variants", () => {
    for (const [id, defs] of Object.entries(fixturesByType)) {
      const type = getQuestionType(id);
      for (const def of defs) {
        expect(generateQuestion(id, def, createRng("s"))).toEqual(type.generate(type.defSchema.parse(def), createRng("s")));
      }
    }
  });

  it("fills [[names]] from one table row per student and reports the values", () => {
    const seen = new Set<string>();
    for (let s = 0; s < 40; s++) {
      const { instance, vars } = generateQuestion("mcq", withVars, createRng(`s${s}`));
      const stem = (instance as { stem: string }).stem;
      expect(stem).toBe(`${vars.name} asks: which organelle makes ATP in ${vars.place}?`);
      expect([["Ana", "Lisbon"], ["Kofi", "Accra"], ["Mei", "Taipei"]]).toContainEqual([vars.name, vars.place]);
      seen.add(String(vars.name));
    }
    expect(seen.size).toBe(3);
  });

  it("leaves the type's own randomness untouched (same shuffle with or without wording)", () => {
    const plain = generateQuestion("mcq", mcq, createRng("x")).instance as { options: unknown };
    const worded = generateQuestion("mcq", withVars, createRng("x")).instance as { options: unknown };
    expect(worded.options).toEqual(plain.options);
  });

  it("draws lists independently and substitutes inside keys and nested strings", () => {
    const def = { stem: "Weight in [[unit]]?", match: { kind: "text", accepted: ["[[unit]]"], caseSensitive: false, collapseWhitespace: true }, textVars: { table: [], lists: [{ name: "unit", options: ["kg", "g"] }] } };
    const { instance, vars } = generateQuestion("short-answer", def, createRng("u"));
    expect((instance as { match: { accepted: string[] } }).match.accepted).toEqual([vars.unit]);
    expect(substitute({ "[[a]]": ["[[a]] [[b]]"] }, { a: "1" })).toEqual({ "1": ["1 [[b]]"] });
  });
});

describe("splitDef / joinDef", () => {
  it("round-trips and drops an empty block", () => {
    const { def, textVars } = splitDef(withVars);
    expect(def).not.toHaveProperty("textVars");
    expect(joinDef(def, textVars)).toEqual(withVars);
    expect(joinDef(def, { table: [], lists: [] })).toEqual(def);
    expect(splitDef({ stem: "x", textVars: { table: [], lists: [] } }).textVars).toBeNull();
    expect(splitDef({ stem: "x", textVars: "junk" }).textVars).toBeNull();
    expect(splitDef("not an object").def).toBe("not an object");
  });

  it("finds placeholders anywhere", () => {
    expect([...placeholdersIn({ a: ["[[x]] and [[y]]"], "[[z]]": 1 })].sort()).toEqual(["x", "y", "z"]);
  });
});

describe("validateQuestion", () => {
  const codes = (raw: unknown) => validateQuestion("mcq", raw).map((i) => i.code);

  it("passes a good wording block and matches validateDef without one", () => {
    expect(validateQuestion("mcq", withVars).filter((i) => i.severity === "blocking")).toEqual([]);
    const type = getQuestionType("mcq");
    expect(validateQuestion("mcq", mcq)).toEqual(type.validateDef(type.defSchema.parse(mcq)));
  });

  it("blocks unknown placeholders, bad names, incomplete rows, empty lists and template syntax in values", () => {
    expect(codes({ ...mcq, stem: "Hi [[who]]" })).toContain("text-vars.undefined");
    expect(codes({ ...withVars, stem: "[[name]] [[nope]] [[place]]" })).toContain("text-vars.undefined");
    expect(codes({ ...withVars, textVars: { table: [{ "1bad": "x" }], lists: [] }, stem: "[[1bad]]" })).toContain("text-vars.bad-name");
    expect(codes({ ...withVars, textVars: { table: [{ name: "A", place: "B" }, { name: "C" }], lists: [] } })).toContain("text-vars.incomplete-row");
    expect(codes({ ...withVars, textVars: { table: withVars.textVars.table, lists: [{ name: "x", options: [] }] } })).toContain("text-vars.empty-list");
    expect(codes({ ...withVars, textVars: { table: [{ name: "{{num:1}}", place: "p" }], lists: [] } })).toContain("text-vars.syntax-in-value");
    expect(codes({ ...withVars, textVars: { table: withVars.textVars.table, lists: [{ name: "name", options: ["x"] }] } })).toContain("text-vars.duplicate-name");
    expect(codes(5)).toEqual(["malformed"]);
  });

  it("warns about unused variables and runs the type's checks per wording", () => {
    expect(codes({ ...withVars, stem: "[[name]] only" })).toContain("text-vars.unused");
    // A row that duplicates another option is caught, and the message says which wording.
    const def = { ...mcq, options: [{ id: "a", text: "[[o]]", correct: true }, { id: "b", text: "Nucleus", correct: false }], textVars: { table: [{ o: "Mitochondrion" }, { o: "nucleus" }], lists: [] } };
    const issue = validateQuestion("mcq", def).find((i) => i.code === "mcq.duplicate-option-text");
    expect(issue?.message).toMatch(/with o = “nucleus”/);
  });
});

describe("generation call sites", () => {
  it("go through generateQuestion (no direct type.generate outside the engine's own helpers)", () => {
    const allowed = new Set(["src/engine/generate.ts"]);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) && !p.startsWith("src/question-types/") && !allowed.has(p)) {
          if (/\btype\.generate\(|\.generate\(def/.test(readFileSync(p, "utf8"))) offenders.push(p);
        }
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
  });
});
