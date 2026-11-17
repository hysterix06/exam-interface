import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce, nextBoundary, pollDelay } from "./signal";

describe("realtime helpers", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("polls slowly when connected and quickly when not", () => {
    expect(pollDelay("SUBSCRIBED")).toBe(30_000);
    expect(pollDelay("connecting")).toBe(5_000);
    expect(pollDelay("CHANNEL_ERROR", { fallbackMs: 2_000 })).toBe(2_000);
  });

  it("debounces a burst into one call", () => {
    const fn = vi.fn();
    const d = debounce(fn, 300);
    d();
    d();
    vi.advanceTimersByTime(200);
    d();
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    d();
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("finds the next schedule boundary", () => {
    const now = Date.parse("2026-01-01T10:00:00Z");
    expect(nextBoundary(["2026-01-01T09:00:00Z", "2026-01-01T11:00:00Z", null, "2026-01-01T10:30:00Z"], now)).toBe(Date.parse("2026-01-01T10:30:00Z"));
    expect(nextBoundary([null, undefined, "nonsense"], now)).toBeNull();
  });
});
