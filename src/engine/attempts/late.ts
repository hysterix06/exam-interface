import { z } from "zod";
import { fmtNum, roundScore } from "../grading/format";
import { GRACE_MS } from "./deadline";

/**
 * What happens after the time limit. "reject" (the default) ends the attempt
 * at the deadline. "accept" keeps it open for a window and takes a percentage
 * of the points earned per minute late, up to a cap. The exam window closing
 * is always a hard stop.
 */
export const latePolicySchema = z
  .discriminatedUnion("mode", [
    z.object({ mode: z.literal("reject") }),
    z.object({
      mode: z.literal("accept"),
      windowMinutes: z.number().int().min(1).max(1440),
      penaltyPercentPerMinute: z.number().min(0).max(100),
      maxPenaltyPercent: z.number().min(0).max(100),
    }),
  ])
  .default({ mode: "reject" });
export type LatePolicy = z.infer<typeof latePolicySchema>;

/** Extra minutes an attempt stays open under this policy. */
export const lateWindowMinutes = (p: LatePolicy) => (p.mode === "accept" ? p.windowMinutes : 0);

/** Whole minutes past the deadline (rounded up), ignoring the few seconds of grace. */
export function lateness(deadline: Date | null, at: Date): number {
  if (!deadline) return 0;
  const over = at.getTime() - deadline.getTime() - GRACE_MS;
  return over <= 0 ? 0 : Math.ceil(over / 60_000);
}

export interface LatePenalty {
  minutes: number;
  percent: number;
  points: number;
  explanation: string;
}

/** The deduction for `minutes` late, on `earned` points; null when there is none. */
export function penaltyFor(policy: LatePolicy, minutes: number, earned: number): LatePenalty | null {
  if (policy.mode !== "accept" || minutes <= 0) return null;
  const raw = minutes * policy.penaltyPercentPerMinute;
  const percent = roundScore(Math.min(policy.maxPenaltyPercent, raw));
  const points = roundScore((Math.max(0, earned) * percent) / 100);
  const mins = `${fmtNum(minutes)} ${minutes === 1 ? "minute" : "minutes"}`;
  const how = raw > policy.maxPenaltyPercent ? `${fmtNum(minutes)} × ${fmtNum(policy.penaltyPercentPerMinute)}%, capped at ${fmtNum(policy.maxPenaltyPercent)}%` : `${fmtNum(minutes)} × ${fmtNum(policy.penaltyPercentPerMinute)}% = ${fmtNum(percent)}%`;
  return { minutes, percent, points, explanation: `Submitted ${mins} late: ${how} of the ${fmtNum(earned)} points earned, so ${fmtNum(points)} points off.` };
}

/** The same lateness applied to a new total (after marking or a regrade): same percentage, new points. */
export function reapplyPenalty(p: LatePenalty, earned: number): LatePenalty {
  const points = roundScore((Math.max(0, earned) * p.percent) / 100);
  const mins = `${fmtNum(p.minutes)} ${p.minutes === 1 ? "minute" : "minutes"}`;
  return { ...p, points, explanation: `Submitted ${mins} late: ${fmtNum(p.percent)}% of the ${fmtNum(earned)} points earned, so ${fmtNum(points)} points off.` };
}
