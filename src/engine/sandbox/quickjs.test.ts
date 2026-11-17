import { beforeAll, describe, expect, it } from "vitest";
import { initSandbox, runTests, sameJson } from "./quickjs";

beforeAll(() => initSandbox());

const t = (call: string, expected: string, extra = {}) => ({ id: call, label: call, call, expected, ...extra });

describe("code sandbox", () => {
  it("runs the student's code against each test", () => {
    const r = runTests("function add(a, b) { return a + b }", [t("add(2, 3)", "5"), t("add(1, 1)", "3")]);
    expect(r.map((x) => [x.ok, x.got])).toEqual([[true, "5"], [false, "2"]]);
  });

  it("compares structures deeply, ignoring key order, with number tolerance", () => {
    const r = runTests("const f = () => ({ b: [1, 2], a: 0.1 + 0.2 })", [t("f()", '{"a":0.3,"b":[1,2]}'), t("f().a", "0.31", { tolerance: 0.05 })]);
    expect(r.every((x) => x.ok)).toBe(true);
    expect(sameJson({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameJson("x", "x")).toBe(true);
  });

  it("stops endless loops by step count, the same way every time", () => {
    const [a] = runTests("function f(){ while(true){} }", [t("f()", "1")], 50);
    const [b] = runTests("function f(){ while(true){} } // again", [t("f()", "1")], 50);
    expect(a.ok).toBe(false);
    expect(a.error).toMatch(/ran too long/);
    expect(a.steps).toBe(b.steps);
  });

  it("reports errors and runaway memory plainly, and keeps each test isolated", { timeout: 20_000 }, () => {
    expect(runTests("function f(){ throw new TypeError('nope') }", [t("f()", "1")])[0].error).toBe("TypeError: nope");
    // Big allocations hit the 16 MB cap within a few steps.
    expect(runTests("function f(){ const a=[]; while(true) a.push(new Array(1e6).fill(1)) }", [t("f()", "1")], 1e5)[0].error).toMatch(/memory|ran too long/);
    const r = runTests("var n = 0; function inc(){ return ++n }", [t("inc()", "1"), t("inc()", "1")]);
    expect(r.every((x) => x.ok)).toBe(true);
  });

  it("fixes time and randomness, and captures console output", () => {
    const [d] = runTests("const f = () => [new Date().getUTCFullYear(), Date.now() > 0]", [t("f()", "[2026,true]")]);
    expect(d.ok).toBe(true);
    const r1 = runTests("const f = () => Math.random()", [t("f()", "0")])[0].got;
    const r2 = runTests("const f = () => Math.random() ", [t("f()", "0")])[0].got;
    expect(r1).toBe(r2);
    expect(runTests("function f(){ console.log('hi', {a:1}); return 1 }", [t("f()", "1")])[0].output).toBe('hi {"a":1}');
  });

  it("has no access to the outside world", () => {
    const [r] = runTests("const f = () => [typeof fetch, typeof require, typeof process, typeof window]", [t("f()", '["undefined","undefined","undefined","undefined"]')]);
    expect(r.ok).toBe(true);
  });
});
