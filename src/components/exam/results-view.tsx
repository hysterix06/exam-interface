"use client";

import { GradeLines } from "@/components/authoring/grade-lines";
import { Badge } from "@/components/ui/badge";
import { fmtNum } from "@/engine/grading/format";
import type { GradeLine } from "@/engine/types";
import { getQuestionTypeUi } from "@/question-types/ui-registry";

export interface ResultItem {
  id: string;
  position: number;
  type: string;
  instance: unknown;
  response: unknown;
  score?: number;
  max?: number;
  lines?: GradeLine[];
  feedback?: Record<string, string>;
}

export function ResultsView({
  score,
  max,
  pendingReview,
  items,
}: {
  score: number;
  max: number;
  pendingReview: boolean;
  items: ResultItem[];
}) {
  const pct = max > 0 ? Math.round((score / max) * 100) : 0;
  return (
    <div className="grid gap-8">
      <section>
        <p className="text-sm text-muted-foreground">Your score</p>
        <p className="text-4xl font-semibold tracking-tight tabular-nums">
          {fmtNum(score)} <span className="text-muted-foreground">/ {fmtNum(max)}</span>
          <span className="ml-3 text-xl text-muted-foreground">{pct}%</span>
        </p>
        {pendingReview && (
          <p className="mt-2 text-sm text-warning">
            Some answers still need to be marked by your instructor, so this score may change.
          </p>
        )}
      </section>

      {items.some((i) => i.lines) && (
        <ol className="grid gap-6">
          {items.map((it) => {
            const { Renderer } = getQuestionTypeUi(it.type);
            return (
              <li key={it.id} className="grid gap-4 rounded-lg border p-5">
                <div className="flex items-center gap-2">
                  <Badge>Question {it.position + 1}</Badge>
                </div>
                <Renderer instance={it.instance} value={it.response} readOnly />
                {it.lines && <GradeLines result={{ score: it.score ?? 0, max: it.max ?? 0, lines: it.lines }} />}
                {it.feedback && (
                  <ul className="grid gap-1 text-sm text-muted-foreground">
                    {Object.values(it.feedback).map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
