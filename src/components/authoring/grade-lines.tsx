import { Badge } from "@/components/ui/badge";
import { fmtNum } from "@/engine/grading/format";
import type { GradeLine, GradeResult, Verdict } from "@/engine/types";

const TONE: Record<Verdict, "success" | "warning" | "danger" | "neutral" | "brand"> = {
  correct: "success",
  partial: "warning",
  wrong: "danger",
  unanswered: "neutral",
  review: "brand",
};

/**
 * Renders a grader's explanation verbatim: what was expected, what the
 * student gave, and the points each line is worth. Never re-derives anything.
 */
export function GradeLines({ result }: { result: Pick<GradeResult, "score" | "max" | "lines"> }) {
  return (
    <div className="grid gap-2 text-sm">
      <p className="font-medium">
        Score: {fmtNum(result.score)} / {fmtNum(result.max)}
      </p>
      <ul className="grid gap-2">
        {result.lines.map((l: GradeLine, i) => (
          <li key={i} className="rounded-md border px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{l.label}</span>
              <span className="flex items-center gap-2">
                <Badge tone={TONE[l.verdict]}>{l.verdict}</Badge>
                <span className="tabular-nums">
                  {fmtNum(l.points)} / {fmtNum(l.max)}
                </span>
              </span>
            </div>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 text-xs text-muted-foreground">
              <dt>Expected</dt>
              <dd className="text-foreground">{l.expected}</dd>
              <dt>Got</dt>
              <dd className="text-foreground">{l.got}</dd>
              {l.note ? (
                <>
                  <dt>Why</dt>
                  <dd className="text-foreground">{l.note}</dd>
                </>
              ) : null}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
