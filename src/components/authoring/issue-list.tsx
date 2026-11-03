import { Badge } from "@/components/ui/badge";
import type { PreflightIssue } from "@/engine/types";

export function IssueList({ issues, empty }: { issues: PreflightIssue[]; empty?: string }) {
  if (issues.length === 0) {
    return empty ? <p className="text-sm text-success">{empty}</p> : null;
  }
  return (
    <ul className="grid gap-1.5 text-sm">
      {issues.map((i, n) => (
        <li key={n} className="flex items-start gap-2">
          <Badge tone={i.severity === "blocking" ? "danger" : "warning"}>
            {i.severity === "blocking" ? "Must fix" : "Heads up"}
          </Badge>
          <span>{i.message}</span>
        </li>
      ))}
    </ul>
  );
}
