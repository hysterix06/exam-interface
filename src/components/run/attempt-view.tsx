"use client";

import { Printer } from "lucide-react";
import { GradeLines } from "@/components/authoring/grade-lines";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fmtDuration } from "@/engine/dwell";
import { fmtNum } from "@/engine/grading/format";
import type { GradeLine } from "@/engine/types";
import { getQuestionTypeUi } from "@/question-types/ui-registry";
import { TopicBreakdown } from "@/components/exam/topic-breakdown";
import type { TopicMastery } from "@/engine/mastery";
import { OverrideScore } from "./override-score";

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
  overrideReason: string | null;
  /** Variable values this student's version was generated with. */
  vars: Record<string, string | number | boolean>;
  /** Approximate time on screen, from the event log (null for older attempts). */
  seconds?: number | null;
  /** Adaptive attempts: why this question was chosen at this step. */
  why?: string | null;
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
  reproduction: { identical: boolean; differences: string[]; notes: string[]; explanation: string[] } | null;
  mastery: { topics: TopicMastery[]; weakest: string | null };
  /** Scores can be changed once the student has finished. */
  canOverride: boolean;
  items: AttemptViewItem[];
  /** One of many on a print page: no buttons, and a page break after it. */
  printMode?: boolean;
  latePenalty?: { explanation: string; points: number } | null;
}

/**
 * The full record for disputes: exactly what this student saw, what they
 * answered, the key, and how each point was awarded. Prints cleanly.
 */
export function AttemptView(p: AttemptViewProps) {
  return (
    <div className={p.printMode ? "grid gap-8 break-after-page" : "grid gap-8"}>
      <header className="grid gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-[1.875rem] leading-tight font-semibold tracking-tight">{p.student}</h1>
          <Badge>{p.state.replace("_", " ")}</Badge>
          {p.isPreview && <Badge tone="brand">Preview</Badge>}
          {!p.printMode && (
            <Button variant="outline" size="sm" className="ml-auto print:hidden" onClick={() => window.print()}>
              <Printer /> Print / save as PDF
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {p.examTitle} · seed <code className="font-mono">{p.seed}</code>
        </p>
        {p.score !== null && (
          <p className="text-lg font-semibold tabular-nums">
            {fmtNum(p.score)} / {fmtNum(p.maxScore ?? 0)}
          </p>
        )}
        {p.latePenalty && <p className="text-sm text-warning">{p.latePenalty.explanation}</p>}
        {Object.keys(p.signals).length > 0 && (
          <p className="text-xs text-muted-foreground">
            Signals (never enforced): {Object.entries(p.signals).map(([k, n]) => `${n} ${k}`).join(", ")}
          </p>
        )}
      </header>

      <TopicBreakdown topics={p.mastery.topics} weakest={null} />

      {p.reproduction && (
        <section className="rounded-lg border p-4 text-sm print:break-inside-avoid">
          <h2 className="mb-1 font-medium">Reproduce from seed</h2>
          {p.reproduction.identical ? (
            <>
              <p className="text-success">Rebuilding this exam from its seed gives exactly what the student saw.</p>
              {p.reproduction.notes.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  {p.reproduction.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              )}
            </>
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
                {it.seconds != null && <span className="text-xs text-muted-foreground" title="Time on screen, from the event log; tab switches and idle time left out">about {fmtDuration(it.seconds)}</span>}
                {it.gradedBy === "user" && <Badge tone="brand">{it.overrideReason ? "score changed by hand" : "marked by hand"}</Badge>}
                {p.canOverride && !p.printMode && it.score !== null && it.max !== null && (
                  <span className="ml-auto">
                    <OverrideScore attemptItemId={it.id} position={it.position} score={it.score} max={it.max} />
                  </span>
                )}
              </div>
              {it.why && <p className="-mt-2 text-xs text-muted-foreground">Why this question: {it.why}</p>}
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="mb-1 text-xs font-medium text-muted-foreground">Student&apos;s answer</h3>
                  <Renderer instance={it.redacted} value={it.response} readOnly />
                </div>
                <div className="grid content-start gap-3">
                  <div>
                    <h3 className="mb-1 text-xs font-medium text-muted-foreground">Answer key</h3>
                    <Renderer instance={it.redacted} value={it.key} readOnly />
                  </div>
                  {Object.keys(it.vars).length > 0 && (
                    <section>
                      <h3 className="mb-1 text-xs font-medium text-muted-foreground">Variables in this student&apos;s version</h3>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-4 font-mono text-xs">
                        {Object.entries(it.vars).map(([k, v]) => (
                          <div key={k} className="contents">
                            <dt className="text-muted-foreground">{k}</dt>
                            <dd>{String(v)}</dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  )}
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
