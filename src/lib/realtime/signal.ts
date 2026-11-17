// Pure helpers behind useTableSignal, kept apart so they can be tested.

export type ChannelStatus = "connecting" | "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

/** While Realtime is connected a slow safety poll is enough; without it, poll as before. */
export function pollDelay(status: ChannelStatus, opts: { connectedMs?: number; fallbackMs?: number } = {}) {
  return status === "SUBSCRIBED" ? (opts.connectedMs ?? 30_000) : (opts.fallbackMs ?? 5_000);
}

/** Collapse a burst of change events (every save of a class) into one refetch. */
export function debounce(fn: () => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | null = null;
  const run = () => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      t = null;
      fn();
    }, ms);
  };
  run.cancel = () => {
    if (t) clearTimeout(t);
    t = null;
  };
  return run;
}

/** The next moment a schedule boundary passes (an exam opens or closes), or null. */
export function nextBoundary(times: readonly (string | null | undefined)[], now: number): number | null {
  const future = times.map((t) => (t ? Date.parse(t) : NaN)).filter((t) => Number.isFinite(t) && t > now);
  return future.length ? Math.min(...future) : null;
}
