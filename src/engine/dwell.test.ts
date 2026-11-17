import { describe, expect, it } from "vitest";
import { dwellTimes, median } from "./dwell";

const t0 = new Date("2026-01-01T10:00:00Z");
const at = (s: number) => new Date(t0.getTime() + s * 1000);
const view = (s: number, itemId: string) => ({ type: "view", ts: at(s), payload: { itemId } });

describe("dwellTimes", () => {
  it("adds up time on each question between views", () => {
    const r = dwellTimes([view(0, "a"), view(30, "b"), view(50, "a")], t0, at(80));
    expect(r.seconds).toEqual({ a: 60, b: 20 });
    expect(r.current).toBe("a");
  });

  it("leaves out time in another tab and while idle", () => {
    const events = [view(0, "a"), { type: "blur", ts: at(10), payload: null }, { type: "focus", ts: at(40), payload: null }, { type: "idle", ts: at(50), payload: null }, { type: "active", ts: at(170), payload: null }, view(180, "b")];
    expect(dwellTimes(events, t0, at(200)).seconds).toEqual({ a: 30, b: 20 });
  });

  it("counts from the start to the first view as the first question when none was logged", () => {
    expect(dwellTimes([view(20, "b")], t0, at(30), "a").seconds).toEqual({ a: 20, b: 10 });
    expect(dwellTimes([], t0, at(30)).seconds).toEqual({});
  });

  it("ignores events outside the attempt and unordered input", () => {
    const r = dwellTimes([view(50, "b"), view(0, "a"), view(-10, "z"), view(500, "c")], t0, at(60));
    expect(r.seconds).toEqual({ a: 50, b: 10 });
  });

  it("medians", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});
