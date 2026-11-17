import { fmtNum } from "../grading/format";

export interface DeadlineExtension {
  kind: "multiplier" | "minutes";
  value: number;
}

export interface EffectiveTime {
  minutes: number;
  /** Plain-language working, e.g. "30 min × 1.25 + 10 min = 47.5 min". */
  explanation: string;
}

/**
 * Time one student gets: the exam limit, scaled by their largest multiplier
 * (accommodations don't stack multiplicatively), plus any extra minutes.
 * Null when the exam is untimed.
 */
export function effectiveTime(
  limitMinutes: number | null,
  extensions: readonly DeadlineExtension[] = [],
): EffectiveTime | null {
  if (limitMinutes === null) return null;
  const multiplier = Math.max(1, ...extensions.filter((e) => e.kind === "multiplier").map((e) => e.value));
  const extra = extensions.filter((e) => e.kind === "minutes").reduce((s, e) => s + e.value, 0);
  const minutes = limitMinutes * multiplier + extra;

  const parts = [`${fmtNum(limitMinutes)} min`];
  if (multiplier !== 1) parts[0] += ` × ${fmtNum(multiplier)}`;
  if (extra !== 0) parts.push(`${extra > 0 ? "+" : "−"} ${fmtNum(Math.abs(extra))} min`);
  const explanation = parts.length === 1 && multiplier === 1 ? `${fmtNum(minutes)} min` : `${parts.join(" ")} = ${fmtNum(minutes)} min`;
  return { minutes, explanation };
}

export function computeDeadline(
  startedAt: Date,
  limitMinutes: number | null,
  extensions: readonly DeadlineExtension[] = [],
): Date | null {
  const t = effectiveTime(limitMinutes, extensions);
  return t ? new Date(startedAt.getTime() + t.minutes * 60_000) : null;
}

/** Saves are accepted a few seconds past the deadline to absorb clock and network lag. */
export const GRACE_MS = 5_000;

export function isExpired(deadline: Date | null, now: Date, graceMs = GRACE_MS) {
  return deadline !== null && now.getTime() > deadline.getTime() + graceMs;
}

export function secondsLeft(deadline: Date | null, now: Date) {
  return deadline === null ? null : Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / 1000));
}

/** When an attempt really stops taking answers: its deadline plus any late window. */
export function hardDeadline(deadline: Date | null, lateWindowMinutes = 0): Date | null {
  return deadline === null ? null : new Date(deadline.getTime() + lateWindowMinutes * 60_000);
}

/**
 * Time one student gets per question: the limit scaled by their largest
 * multiplier. Extra *minutes* belong to the whole exam, so they don't apply here.
 */
export function effectiveItemTime(limitSeconds: number | null, extensions: readonly DeadlineExtension[] = []): { seconds: number; explanation: string } | null {
  if (limitSeconds === null) return null;
  const multiplier = Math.max(1, ...extensions.filter((e) => e.kind === "multiplier").map((e) => e.value));
  const seconds = Math.round(limitSeconds * multiplier);
  return { seconds, explanation: multiplier === 1 ? `${fmtNum(seconds)} s per question` : `${fmtNum(limitSeconds)} s × ${fmtNum(multiplier)} = ${fmtNum(seconds)} s per question` };
}

/** A question's own deadline, from when the student reached it. */
export function itemDeadline(openedAt: Date | null, seconds: number | null): Date | null {
  return openedAt && seconds !== null ? new Date(openedAt.getTime() + seconds * 1000) : null;
}
