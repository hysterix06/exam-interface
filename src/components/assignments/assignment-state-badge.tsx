import { Badge } from "@/components/ui/badge";
import type { AssignmentState } from "@/engine/assignments/state";

const LABEL: Record<AssignmentState, string> = { draft: "Draft", scheduled: "Published", open: "Open", late: "Taking late work", closed: "Closed" };

/** An assignment's state as staff see it, matching the exam badge: only "Open" carries colour. */
export function AssignmentStateBadge({ state, released }: { state: AssignmentState; released?: boolean }) {
  return (
    <span className="inline-flex gap-2">
      <Badge tone={state === "open" ? "success" : state === "draft" ? "neutral" : "strong"}>{LABEL[state]}</Badge>
      {released && <Badge tone="strong">Grades released</Badge>}
    </span>
  );
}
