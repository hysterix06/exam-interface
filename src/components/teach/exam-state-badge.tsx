import { Badge } from "@/components/ui/badge";
import type { ExamStateName } from "@/engine/exam-state";

const LABEL: Record<ExamStateName, string> = {
  draft: "Draft",
  scheduled: "Published",
  open: "Open",
  closed: "Closed",
  graded: "Graded",
  released: "Released",
};

/** One look for an exam's state everywhere staff see it. Only "Open" carries colour. */
export function ExamStateBadge({ state }: { state: ExamStateName }) {
  return <Badge tone={state === "open" ? "success" : state === "draft" ? "neutral" : "strong"}>{LABEL[state]}</Badge>;
}
