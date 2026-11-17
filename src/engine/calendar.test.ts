import { describe, expect, it } from "vitest";
import { agenda, dayKey, groupByDay, monthGrid, shiftMonth, type CalendarItem } from "./calendar";

const item = (id: string, startsAt: string, o: Partial<CalendarItem> = {}): CalendarItem => ({
  id, kind: "event", title: id, courseId: "c", courseLabel: "BIO 101", startsAt, ...o,
});

describe("calendar", () => {
  it("lays out a month in whole weeks", () => {
    const nov = monthGrid("2026-11", 1); // Monday start; 1 Nov 2026 is a Sunday
    expect(nov[0][0]).toEqual({ date: "2026-10-26", inMonth: false });
    expect(nov[0][6]).toEqual({ date: "2026-11-01", inMonth: true });
    expect(nov.at(-1)!.at(-1)!.date).toBe("2026-12-06");
    expect(nov.every((w) => w.length === 7)).toBe(true);
    const feb = monthGrid("2026-02", 0); // Sunday start; 1 Feb 2026 is a Sunday
    expect(feb[0][0]).toEqual({ date: "2026-02-01", inMonth: true });
    expect(feb).toHaveLength(4);
  });
  it("moves between months across years", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
  it("buckets by the viewer's own day", () => {
    expect(dayKey("2026-11-17T23:30:00Z", "UTC")).toBe("2026-11-17");
    expect(dayKey("2026-11-17T23:30:00Z", "Asia/Tokyo")).toBe("2026-11-18");
    expect(dayKey("2026-11-17T03:00:00Z", "America/New_York")).toBe("2026-11-16");
  });
  it("lists what overlaps a range, in order", () => {
    const items = [
      item("late", "2026-11-20T10:00:00Z"),
      item("early", "2026-11-18T10:00:00Z"),
      item("span", "2026-11-10T00:00:00Z", { endsAt: "2026-11-19T00:00:00Z" }),
      item("before", "2026-11-01T00:00:00Z"),
      item("after", "2026-12-01T00:00:00Z"),
    ];
    const got = agenda(items, new Date("2026-11-17T00:00:00Z"), new Date("2026-11-24T00:00:00Z"));
    expect(got.map((i) => i.id)).toEqual(["span", "early", "late"]);
  });
  it("groups an agenda into days", () => {
    const g = groupByDay([item("a", "2026-11-17T09:00:00Z"), item("b", "2026-11-17T15:00:00Z"), item("c", "2026-11-19T09:00:00Z")], "UTC");
    expect(g.map((d) => [d.date, d.items.map((i) => i.id)])).toEqual([["2026-11-17", ["a", "b"]], ["2026-11-19", ["c"]]]);
  });
});
