// Undo/redo history as a pure value, so it is easy to test and reason about.
// Edits that arrive close together (typing) merge into one step.

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** When the present was last changed by an edit; null after undo/redo. */
  lastEditAt: number | null;
}

export interface HistoryOptions {
  /** Edits within this many ms of the previous one merge into one step. */
  mergeMs?: number;
  /** Most steps kept; the oldest fall off. */
  cap?: number;
}

const DEFAULTS = { mergeMs: 600, cap: 100 };

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], lastEditAt: null };
}

/** A new edit. Clears redo; merges with the previous edit when it came quickly. */
export function record<T>(h: History<T>, next: T, now: number, opts: HistoryOptions = {}): History<T> {
  const { mergeMs, cap } = { ...DEFAULTS, ...opts };
  if (Object.is(next, h.present)) return h;
  const merge = h.lastEditAt !== null && now - h.lastEditAt < mergeMs && h.past.length > 0;
  const past = merge ? h.past : [...h.past, h.present].slice(-cap);
  return { past, present: next, future: [], lastEditAt: now };
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], lastEditAt: null };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), lastEditAt: null };
}

/** Replace everything (e.g. after loading a saved version): no undo across it. */
export function reset<T>(present: T): History<T> {
  return initHistory(present);
}
