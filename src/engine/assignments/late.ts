import { z } from "zod";
import { fmtNum, roundScore } from "../grading/format";
import type { LatePenalty } from "../attempts/late";

/**
 * Late hand-ins for assignments, counted in days rather than the exam's
 * minutes: "reject" closes at the due date; "accept" keeps it open for a few
 * days and takes a share of the points earned for every day (or part of one).
 */
export const dueLatePolicySchema = z
  .discriminatedUnion("mode", [
    z.object({ mode: z.literal("reject") }),
    z.object({
      mode: z.literal("accept"),
      penaltyPercentPerDay: z.number().min(0).max(100),
      maxPenaltyPercent: z.number().min(0).max(100),
      closesAfterDays: z.number().int().min(1).max(60),
    }),
  ])
  .default({ mode: "reject" });
export type DueLatePolicy = z.infer<typeof dueLatePolicySchema>;

const DAY_MS = 24 * 60 * 60 * 1000;
const days = (n: number) => `${fmtNum(n)} ${n === 1 ? "day" : "days"}`;

/** When hand-ins stop being accepted (the due date itself under "reject"). */
export function hardCloseAt(due: Date | null, policy: DueLatePolicy): Date | null {
  if (!due) return null;
  return policy.mode === "accept" ? new Date(due.getTime() + policy.closesAfterDays * DAY_MS) : due;
}

/** Days late, counting any part of a day as a whole one. */
export const daysLate = (minutes: number) => (minutes <= 0 ? 0 : Math.ceil(minutes / (24 * 60)));

/** The deduction for handing in `minutes` late with `earned` points; null when there is none. */
export function dueLatePenalty(policy: DueLatePolicy, minutes: number, earned: number): LatePenalty | null {
  if (policy.mode !== "accept" || minutes <= 0) return null;
  const d = daysLate(minutes);
  const raw = d * policy.penaltyPercentPerDay;
  const percent = roundScore(Math.min(policy.maxPenaltyPercent, raw));
  const points = roundScore((Math.max(0, earned) * percent) / 100);
  const how =
    raw > policy.maxPenaltyPercent
      ? `${fmtNum(d)} × ${fmtNum(policy.penaltyPercentPerDay)}%, capped at ${fmtNum(policy.maxPenaltyPercent)}%`
      : `${fmtNum(d)} × ${fmtNum(policy.penaltyPercentPerDay)}% = ${fmtNum(percent)}%`;
  return { minutes, percent, points, explanation: `Handed in ${days(d)} late: ${how} of the ${fmtNum(earned)} points earned, so ${fmtNum(points)} points off.` };
}

export function describeDueLatePolicy(p: DueLatePolicy): string {
  if (p.mode === "reject") return "Late work is not accepted: hand-ins close at the due date.";
  return `Late work is accepted for up to ${days(p.closesAfterDays)}, losing ${fmtNum(p.penaltyPercentPerDay)}% per day (or part of a day), at most ${fmtNum(p.maxPenaltyPercent)}%.`;
}
