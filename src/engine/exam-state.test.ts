import { describe, expect, it } from "vitest";
import { effectiveState } from "./exam-state";

describe("effectiveState", () => {
  const at = (s: string) => new Date(`2026-03-01T${s}Z`);
  const win = (state: Parameters<typeof effectiveState>[0]["state"], o: string | null, c: string | null) => ({
    state,
    opensAt: o ? at(o) : null,
    closesAt: c ? at(c) : null,
  });

  it("opens a scheduled exam by itself at its start time", () => {
    expect(effectiveState(win("scheduled", "09:00:00", null), at("08:59:59"))).toBe("scheduled");
    expect(effectiveState(win("scheduled", "09:00:00", null), at("09:00:00"))).toBe("open");
  });
  it("closes at the end time, whether it opened by schedule or by hand", () => {
    expect(effectiveState(win("scheduled", "09:00:00", "10:00:00"), at("10:00:01"))).toBe("closed");
    expect(effectiveState(win("open", null, "10:00:00"), at("09:59:59"))).toBe("open");
    expect(effectiveState(win("open", null, "10:00:00"), at("10:00:01"))).toBe("closed");
  });
  it("leaves other states and unscheduled exams alone", () => {
    expect(effectiveState(win("draft", "09:00:00", "10:00:00"), at("09:30:00"))).toBe("draft");
    expect(effectiveState(win("scheduled", null, null), at("12:00:00"))).toBe("scheduled");
    expect(effectiveState(win("released", null, "10:00:00"), at("11:00:00"))).toBe("released");
  });
});

