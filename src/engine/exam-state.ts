export type ExamStateName = "draft" | "scheduled" | "open" | "closed" | "graded" | "released";

// draft is entered/left only through publish/unpublish. Everything after
// "scheduled" is the run of the exam: open it, close it, release the results.
const NEXT: Record<ExamStateName, readonly ExamStateName[]> = {
  draft: [],
  scheduled: ["open"],
  open: ["closed"],
  closed: ["open", "graded", "released"],
  graded: ["released", "open"],
  released: ["closed"],
};

export function canTransition(from: ExamStateName, to: ExamStateName) {
  return NEXT[from].includes(to);
}

export function nextStates(from: ExamStateName) {
  return NEXT[from];
}

export const STATE_LABELS: Record<ExamStateName, string> = {
  draft: "Draft",
  scheduled: "Published, not open",
  open: "Open",
  closed: "Closed",
  graded: "Graded",
  released: "Results released",
};

export interface ExamWindow {
  state: ExamStateName;
  opensAt: Date | null;
  closesAt: Date | null;
}

/**
 * The state students actually experience. A scheduled exam opens by itself at
 * its start time, and an open one stops accepting entries at its end time, with
 * no background job needed: this is evaluated whenever someone looks.
 */
export function effectiveState(exam: ExamWindow, now: Date): ExamStateName {
  const t = now.getTime();
  const live = exam.state === "open" || (exam.state === "scheduled" && exam.opensAt !== null && t >= exam.opensAt.getTime());
  if (live && exam.closesAt !== null && t > exam.closesAt.getTime()) return "closed";
  if (exam.state === "scheduled" && live) return "open";
  return exam.state;
}
