import { describe, expect, it } from "vitest";
import { lateness, latePolicySchema, penaltyFor } from "./late";

const accept = latePolicySchema.parse({ mode: "accept", windowMinutes: 30, penaltyPercentPerMinute: 2, maxPenaltyPercent: 30 });
const at = (min: number) => new Date(Date.UTC(2026, 0, 1, 10, 0) + min * 60_000);

describe("late submission", () => {
  it("defaults to rejecting late work", () => {
    expect(latePolicySchema.parse(undefined)).toEqual({ mode: "reject" });
  });

  it("counts whole minutes late, after the grace period", () => {
    expect(lateness(at(0), at(0))).toBe(0);
    expect(lateness(at(0), new Date(at(0).getTime() + 4_000))).toBe(0);
    expect(lateness(at(0), at(0.5))).toBe(1);
    expect(lateness(at(0), at(7))).toBe(7);
    expect(lateness(null, at(7))).toBe(0);
  });

  it("takes a percentage of the points earned, capped, and explains it", () => {
    const p = penaltyFor(accept, 7, 18)!;
    expect(p).toMatchObject({ minutes: 7, percent: 14, points: 2.52 });
    expect(p.explanation).toBe("Submitted 7 minutes late: 7 × 2% = 14% of the 18 points earned, so 2.52 points off.");
    const capped = penaltyFor(accept, 25, 10)!;
    expect(capped.percent).toBe(30);
    expect(capped.explanation).toMatch(/capped at 30%/);
  });

  it("is nothing when on time, under reject, or with no points", () => {
    expect(penaltyFor(accept, 0, 18)).toBeNull();
    expect(penaltyFor({ mode: "reject" }, 5, 18)).toBeNull();
    expect(penaltyFor(accept, 5, 0)?.points).toBe(0);
  });
});
