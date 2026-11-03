import { describe, expect, it } from "vitest";
import { createRng } from "@/engine/rng";
import { initMessage, MAX_STATE_BYTES, parseWidgetMessage, readPath, WIDGETS, widgetById } from "@/engine/widget";
import { widget } from "./core";
import { widgetFixtures } from "./fixtures";

describe("widget protocol", () => {
  it("accepts only well-formed widget messages", () => {
    expect(parseWidgetMessage({ type: "exam:ready", version: 1 })).toEqual({ type: "exam:ready", version: 1 });
    expect(parseWidgetMessage({ type: "exam:response", version: 1, state: { a: 1 } })?.type).toBe("exam:response");
    for (const bad of [null, "hi", {}, { type: "exam:ready" }, { type: "exam:ready", version: 2 }, { type: "other", version: 1 }, { type: "webpackOk" }]) {
      expect(parseWidgetMessage(bad)).toBeNull();
    }
  });
  it("refuses a state that is too big", () => {
    const big = { type: "exam:response", version: 1, state: "x".repeat(MAX_STATE_BYTES + 1) };
    expect(parseWidgetMessage(big)).toBeNull();
    expect(parseWidgetMessage({ type: "exam:response", version: 1, state: "x".repeat(100) })).not.toBeNull();
  });
  it("builds the init message with safe defaults", () => {
    expect(initMessage(undefined, undefined, true)).toEqual({ type: "exam:init", version: 1, state: null, config: {}, readOnly: true });
  });
  it("lists widgets served from our own origin", () => {
    expect(WIDGETS.every((w) => w.src.startsWith("/widgets/"))).toBe(true);
    expect(widgetById("pos-demo")?.label).toBeTruthy();
    expect(widgetById("nope")).toBeUndefined();
  });
  it("reads paths, including array length and indexes", () => {
    const s = { total: 9, order: [{ qty: 2 }, { qty: 1 }], nested: { x: "y" } };
    expect(readPath(s, "total")).toBe(9);
    expect(readPath(s, "order.length")).toBe(2);
    expect(readPath(s, "order.1.qty")).toBe(1);
    expect(readPath(s, "nested.x")).toBe("y");
    for (const p of ["missing", "order.5.qty", "total.deeper", "order.name", "toString"]) expect(readPath(s, p)).toBeUndefined();
    expect(readPath(null, "a")).toBeUndefined();
  });
});

describe("widget type", () => {
  const def = widget.defSchema.parse(widgetFixtures[0]);
  const { instance } = widget.generate(def, createRng("w"));

  it("scores each check from the reported state", () => {
    const right = widget.grade(instance, { state: instance.solution }, { points: 3 });
    expect(right.score).toBe(3);
    const wrongTotal = widget.grade(instance, { state: { ...(instance.solution as object), total: 10 } }, { points: 3 });
    expect(wrongTotal.lines.map((l) => l.verdict)).toEqual(["wrong", "correct", "correct"]);
    expect(wrongTotal.lines[0]).toMatchObject({ expected: "9 ± 0.01", got: "10" });
  });

  it("says when a value was not reported, and treats no state as unanswered", () => {
    expect(widget.grade(instance, { state: { order: [] } }, { points: 3 }).lines[0].got).toBe("not reported");
    for (const r of [null, { state: null }]) expect(widget.grade(instance, r, { points: 3 }).lines.every((l) => l.verdict === "unanswered")).toBe(true);
  });

  it("compares text checks loosely and rejects non-numbers for number checks", () => {
    const d = widget.defSchema.parse({
      stem: "x", widget: "pos-demo", solution: { name: "Ann", n: 1 },
      checks: [{ kind: "text", id: "t", label: "Name", path: "name", expected: "ann" }, { kind: "number", id: "n", label: "N", path: "n", expected: 1 }],
    });
    const i = widget.generate(d, createRng("t")).instance;
    expect(widget.grade(i, { state: { name: " ANN ", n: 1 } }, { points: 2 }).score).toBe(2);
    expect(widget.grade(i, { state: { name: "Bob", n: "one" } }, { points: 2 }).score).toBe(0);
  });

  it("keeps checks and the solution away from students", () => {
    expect(Object.keys(widget.redact(instance) as object).sort()).toEqual(["config", "stem", "widget"]);
  });

  it("validates the widget, the checks and the model run", () => {
    const codes = (x: Partial<typeof def>) => widget.validateDef({ ...def, ...x }).map((i) => i.code);
    expect(widget.validateDef(def)).toEqual([]);
    expect(codes({ stem: " " })).toContain("widget.empty-stem");
    expect(codes({ widget: "evil" })).toContain("widget.unknown");
    expect(codes({ checks: [] })).toContain("widget.no-checks");
    expect(codes({ checks: [def.checks[0], def.checks[0]] })).toContain("widget.duplicate-check");
    expect(codes({ checks: [{ kind: "text", id: "z", label: " ", path: "", expected: "" }] })).toContain("widget.incomplete-check");
    expect(codes({ solution: null })).toContain("widget.no-solution");
    expect(codes({ solution: { total: 1, order: [], discountPct: 0 } })).toContain("widget.solution-fails");
    expect(codes({ solution: "x".repeat(MAX_STATE_BYTES + 1) })).toContain("widget.solution-too-big");
  });
});
