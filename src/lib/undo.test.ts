import { describe, expect, it } from "vitest";
import { initHistory, record, redo, reset, undo } from "./undo";

describe("undo history", () => {
  it("undoes and redoes separate edits", () => {
    let h = initHistory("a");
    h = record(h, "b", 0);
    h = record(h, "c", 1000);
    expect(h.present).toBe("c");
    h = undo(h);
    expect(h.present).toBe("b");
    h = undo(h);
    expect(h.present).toBe("a");
    expect(undo(h)).toBe(h);
    h = redo(h);
    h = redo(h);
    expect(h.present).toBe("c");
    expect(redo(h)).toBe(h);
  });

  it("merges quick edits (typing) into one step", () => {
    let h = initHistory("");
    h = record(h, "h", 0);
    h = record(h, "he", 100);
    h = record(h, "hel", 200);
    expect(h.past).toEqual([""]);
    expect(undo(h).present).toBe("");
  });

  it("never merges the first edit, or an edit after undo", () => {
    let h = record(initHistory("a"), "b", 0);
    expect(h.past).toEqual(["a"]);
    h = undo(record(h, "c", 1000));
    h = record(h, "d", 1001);
    expect(h.past).toEqual(["a", "b"]);
    expect(h.future).toEqual([]);
  });

  it("ignores no-op edits and caps the history", () => {
    const h0 = initHistory(1);
    expect(record(h0, 1, 0)).toBe(h0);
    let h = h0;
    for (let i = 2; i < 10; i++) h = record(h, i, i * 1000, { cap: 3 });
    expect(h.past).toEqual([6, 7, 8]);
    expect(reset(5)).toEqual(initHistory(5));
  });
});
