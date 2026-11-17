import { GRACE_MS } from "../attempts/deadline";
import { hardCloseAt, type DueLatePolicy } from "./late";

/**
 * Where an assignment stands for one student right now, worked out on every
 * read (no background job), like effectiveState() for exams.
 *  - scheduled: published, not open yet
 *  - open: taking hand-ins, not yet due
 *  - late: past due, still taking (penalised) hand-ins
 *  - closed: no longer taking hand-ins
 */
export type AssignmentState = "draft" | "scheduled" | "open" | "late" | "closed";

export function assignmentState(
  a: { state: "draft" | "published"; opensAt: Date | null; dueAt: Date | null; late: DueLatePolicy },
  now: Date,
  /** This student's extended due date, if any. */
  dueOverride?: Date | null,
): AssignmentState {
  if (a.state === "draft") return "draft";
  if (a.opensAt && now < a.opensAt) return "scheduled";
  const due = dueOverride ?? a.dueAt;
  if (!due) return "open";
  const t = now.getTime();
  if (t <= due.getTime() + GRACE_MS) return "open";
  const close = hardCloseAt(due, a.late)!;
  return t <= close.getTime() + GRACE_MS ? "late" : "closed";
}

export const canSubmit = (s: AssignmentState) => s === "open" || s === "late";
