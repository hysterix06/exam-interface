"use client";

import { Printer } from "lucide-react";
import { GradeLines } from "@/components/authoring/grade-lines";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtNum } from "@/engine/grading/format";
import type { GradeLine } from "@/engine/types";
import { getQuestionTypeUi } from "@/question-types/ui-registry";

export interface AttemptViewItem {
  id: string;
  position: number;
  type: string;
  label: string;
  redacted: unknown;
  response: unknown;
  key: unknown;
  score: number | null;
  max: number | null;
  lines: GradeLine[];
  gradedBy: string | null;
}

export interface AttemptViewProps {
  student: string;
  examTitle: string;
  seed: string;
  state: string;
  score: number | null;
  maxScore: number | null;
  isPreview: boolean;
  signals: Record<string, number>;
  reproduction: { identical: boolean; differences: string[]; explanation: string[] } | null;
  items: AttemptViewItem[];
}

/**
 * The full record for disputes: exactly what this student saw, what they
 * answered, the key, and how each point was awarded. Prints cleanly.
 */
export function AttemptView(p: AttemptViewProps) {
  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{p.student}</h1>
          <Badge>{p.state.replace("_", " ")}</Badge>
          {p.isPreview && <Badge tone="signal">Preview</Badge>}
          <Button variant="outline" size="sm" className="ml-auto print:hidden" onClick={() => window.print()}>
            <Printer /> Print / save as PDF
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {p.examTitle} · seed <code className="font-mono">{p.seed}</code>
        </p>
        {p.score !== null && (
          <p className="text-lg font-semibold tabular-nums">
            {fmtNum(p.score)} / {fmtNum(p.maxScore ?? 0)}
          </p>
        )}
        {Object.keys(p.signals).length > 0 && (
          <p className="text-xs text-muted-foreground">
            Signals (never enforced): {Object.entries(p.signals).map(([k, n]) => `${n} ${k}`).join(", ")}
          </p>
        )}
      </header>

      {p.reproduction && (
        <section className="rounded-lg border p-4 text-sm print:break-inside-avoid">
          <h2 className="mb-1 font-medium">Reproduce from seed</h2>
          {p.reproduction.identical ? (
            <p className="text-success">Rebuilding this exam from its seed gives exactly what the student saw.</p>
          ) : (
            <ul className="list-disc pl-5 text-warning">
              {p.reproduction.differences.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          )}
          <details className="mt-2 print:hidden">
            <summary className="cursor-pointer">Why these questions were drawn</summary>
            <ul className="mt-2 grid gap-1 text-muted-foreground">
              {p.reproduction.explanation.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </details>
        </section>
      )}

      <ol className="grid gap-6">
        {p.items.map((it) => {
          const { Renderer } = getQuestionTypeUi(it.type);
          return (
            <li key={it.id} className="grid gap-4 rounded-lg border p-5 print:break-inside-avoid">
              <div className="flex items-center gap-2">
                <Badge>Question {it.position + 1}</Badge>
                {it.gradedBy === "user" && <Badge tone="signal">marked by hand</Badge>}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="mb-1 text-xs font-medium text-muted-foreground">Student&apos;s answer</h3>
                  <Renderer instance={it.redacted} value={it.response} readOnly />
                </div>
                <div>
                  <h3 className="mb-1 text-xs font-medium text-muted-foreground">Answer key</h3>
                  <Renderer instance={it.redacted} value={it.key} readOnly />
                </div>
              </div>
              <GradeLines result={{ score: it.score ?? 0, max: it.max ?? 0, lines: it.lines }} />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
