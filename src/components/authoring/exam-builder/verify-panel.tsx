"use client";

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import type { AttemptPoolItem } from "@/engine/attempt";
import { type PreflightReport, preflightExam, type PreflightStatus } from "@/engine/authoring/preflight";
import { simulate, type SimulationResult } from "@/engine/authoring/simulate";
import type { ExamSettings } from "@/engine/exam";
import { fmtNum } from "@/engine/grading/format";
import type { Blueprint } from "@/engine/selection/types";
import { ensureTypesReady } from "@/question-types/registry";

const ICON: Record<PreflightStatus, React.ReactNode> = {
  pass: <CheckCircle2 className="size-4 text-success" aria-label="Passed" />,
  warn: <AlertTriangle className="size-4 text-warning" aria-label="Warning" />,
  fail: <XCircle className="size-4 text-destructive" aria-label="Failed" />,
};

interface Stamped<T> {
  result: T;
  /** The inputs it was computed from, to tell when it has gone stale. */
  stamp: string;
}

export function VerifyPanel({
  blueprint,
  settings,
  pool,
  topicNames,
  questionNames,
  autoRun = false,
}: {
  autoRun?: boolean;
  blueprint: Blueprint;
  settings: ExamSettings;
  pool: readonly AttemptPoolItem[];
  topicNames: Record<string, string>;
  questionNames: Record<string, string>;
}) {
  const topicOf = Object.fromEntries(pool.map((q) => [q.id, q.topicId]));
  const stamp = JSON.stringify({ blueprint, settings, pool: pool.map((q) => q.versionId) });
  const [pending, start] = useTransition();
  const [report, setReport] = useState<Stamped<PreflightReport> | null>(null);
  const [sim, setSim] = useState<Stamped<SimulationResult> | null>(null);

  // Code questions are checked in a sandbox that has to load first.
  const runPreflight = () =>
    start(async () => {
      await ensureTypesReady();
      const result = preflightExam({ blueprint, settings, pool, topicNames, questionNames });
      setReport({ result, stamp });
    });
  // On the Verify tab the inputs are already saved, so run straight away.
  useEffect(() => {
    if (autoRun) runPreflight();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);
  const runSim = () =>
    start(async () => {
      await ensureTypesReady();
      setSim({ result: simulate(blueprint, pool, 200), stamp });
    });

  return (
    <div className="grid gap-8">
      <section>
        <div className="mb-3 flex items-center gap-3">
          <Button variant="outline" onClick={runPreflight} disabled={pending}>
            {report ? "Run checks again" : "Run checks"}
          </Button>
          {report && report.stamp !== stamp && (
            <span className="text-sm text-warning">Out of date: you’ve changed things since this ran.</span>
          )}
        </div>
        {report ? (
          <>
            <p className="mb-3 text-sm">
              {report.result.blocking === 0 ? (
                <span className="text-success">Ready to publish.</span>
              ) : (
                <span className="text-destructive">
                  {report.result.blocking} {report.result.blocking === 1 ? "problem" : "problems"} to fix before
                  publishing.
                </span>
              )}{" "}
              {report.result.warnings > 0 && (
                <span className="text-muted-foreground">
                  {report.result.warnings} {report.result.warnings === 1 ? "note" : "notes"}.
                </span>
              )}
            </p>
            <ul className="divide-y rounded-lg border">
              {report.result.items.map((item) => (
                <li key={item.id} className="flex gap-3 px-4 py-3">
                  <span className="mt-0.5">{ICON[item.status]}</span>
                  <div className="grid gap-1 text-sm">
                    <span className="font-medium">{item.title}</span>
                    <span className="text-muted-foreground">{item.detail}</span>
                    {item.problems.length > 0 && (
                      <ul className="mt-1 list-disc pl-5">
                        {item.problems.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Checks pools, answer keys, 1,000 generations per question, points, and runs a perfect, a blank and an
            all-wrong student through the whole exam.
          </p>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-3">
          <Button variant="outline" onClick={runSim} disabled={pending}>
            Simulate 200 students
          </Button>
          {sim && sim.stamp !== stamp && (
            <span className="text-sm text-warning">Out of date: you’ve changed things since this ran.</span>
          )}
        </div>
        {sim ? <SimulationView sim={sim.result} topicNames={topicNames} questionNames={questionNames} topicOf={topicOf} /> : (
          <p className="text-sm text-muted-foreground">
            Builds 200 fake exams and answers them at random, to show how balanced the topics are and how scores spread.
          </p>
        )}
      </section>
    </div>
  );
}

function SimulationView({
  sim,
  topicNames,
  questionNames,
  topicOf,
}: {
  sim: SimulationResult;
  topicNames: Record<string, string>;
  questionNames: Record<string, string>;
  topicOf: Record<string, string>;
}) {
  if (sim.failures > 0) {
    return (
      <p role="alert" className="rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive">
        {sim.failures} of {sim.runs} fake exams couldn’t be built: {sim.firstFailure}
      </p>
    );
  }
  const peak = Math.max(1, ...sim.histogram);
  return (
    <div className="grid gap-5 text-sm">
      <div>
        <h3 className="mb-2 font-medium">Topic balance</h3>
        <div className="overflow-x-auto">
        <table className="w-full max-w-lg">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Topic</th>
              <th className="py-1 text-right font-medium">Questions per student</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(sim.topicBalance).map(([id, b]) => (
              <tr key={id} className="border-t">
                <td className="py-1.5">{topicNames[id] ?? id}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {b.min === b.max ? fmtNum(b.min) : `${b.min}–${b.max}`} (average {fmtNum(b.mean)})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <DrawTable sim={sim} topicNames={topicNames} questionNames={questionNames} topicOf={topicOf} />

      <div>
        <h3 className="mb-2 font-medium">Score spread with random answers</h3>
        <div className="grid gap-1" role="img" aria-label="Histogram of simulated scores">
          {sim.histogram.map((n, i) => (
            <div key={i} className="grid grid-cols-[4.5rem_1fr_2rem] items-center gap-2 text-xs">
              <span className="text-muted-foreground tabular-nums">
                {i * 10}–{i === 9 ? 100 : i * 10 + 10}%
              </span>
              <span className="h-3 rounded-sm bg-foreground/60" style={{ width: `${(n / peak) * 100}%`, minWidth: n ? 2 : 0 }} />
              <span className="tabular-nums">{n}</span>
            </div>
          ))}
        </div>
        {sim.scores && (
          <p className="mt-2 text-muted-foreground">
            Average {fmtNum(sim.scores.mean)}%, median {fmtNum(sim.scores.median)}%, from {fmtNum(sim.scores.min)}% to{" "}
            {fmtNum(sim.scores.max)}%. Random guessing should land low; if it doesn’t, the exam may be too easy to
            guess.
          </p>
        )}
      </div>
    </div>
  );
}

/** How often each question landed on a fake exam: measured, not predicted. */
function DrawTable({
  sim,
  topicNames,
  questionNames,
  topicOf,
}: {
  sim: SimulationResult;
  topicNames: Record<string, string>;
  questionNames: Record<string, string>;
  topicOf: Record<string, string>;
}) {
  const built = sim.runs - sim.failures;
  const rows = Object.entries(topicOf)
    .map(([id, topic]) => ({ id, topic, n: sim.drawn[id] ?? 0 }))
    .filter((r) => r.topic in sim.topicBalance)
    .sort((a, b) => (topicNames[a.topic] ?? a.topic).localeCompare(topicNames[b.topic] ?? b.topic) || b.n - a.n);
  if (built === 0 || rows.length === 0) return null;
  return (
    <details>
      <summary className="cursor-pointer font-medium">How often each question was drawn</summary>
      <p className="mt-1 text-muted-foreground">
        Counted over the {fmtNum(built)} fake exams. A question that is never drawn may have a weight of 0 or lose to
        its variant group.
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full max-w-2xl">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1 font-medium">Question</th>
              <th className="py-1 font-medium">Topic</th>
              <th className="py-1 text-right font-medium">Drawn</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="max-w-80 truncate py-1.5">{questionNames[r.id] ?? r.id}</td>
                <td className="py-1.5 text-muted-foreground">{topicNames[r.topic] ?? r.topic}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {fmtNum(r.n)} of {fmtNum(built)} ({fmtNum(Math.round((r.n / built) * 100))}%)
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
