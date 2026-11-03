"use client";

import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type AttemptPoolItem, buildAttempt } from "@/engine/attempt";
import { fmtNum } from "@/engine/grading/format";
import { explainSelection } from "@/engine/selection/explain";
import type { Blueprint } from "@/engine/selection/types";
import { getQuestionType } from "@/question-types/registry";

/**
 * One student's exam, regenerated from a seed, with the selector's reasoning
 * in plain language. The same seed always gives the same exam.
 */
export function SamplePanel({
  blueprint,
  pool,
  topicNames,
  questionNames,
}: {
  blueprint: Blueprint;
  pool: readonly AttemptPoolItem[];
  topicNames: Record<string, string>;
  questionNames: Record<string, string>;
}) {
  const [seed, setSeed] = useState("student-1");

  const built = useMemo(() => {
    try {
      return { ok: buildAttempt(seed, blueprint, pool) } as const;
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) } as const;
    }
  }, [seed, blueprint, pool]);

  const reroll = () => setSeed(`student-${(Number(/(\d+)$/.exec(seed)?.[1] ?? 0) || 0) + 1}`);

  return (
    <div className="grid gap-4">
      <div className="flex items-end gap-2">
        <label className="grid flex-1 gap-1 text-xs text-muted-foreground">
          Attempt seed
          <Input value={seed} onChange={(e) => setSeed(e.target.value)} className="font-mono" />
        </label>
        <Button type="button" variant="outline" onClick={reroll}>
          <RefreshCw /> Another student
        </Button>
      </div>

      {"error" in built ? (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{built.error}</p>
      ) : (
        <>
          <ol className="divide-y rounded-lg border text-sm">
            {built.ok.items.map((item) => (
              <li key={item.questionId} className="flex items-start gap-3 px-4 py-2.5">
                <span className="w-5 shrink-0 text-muted-foreground tabular-nums">{item.position + 1}.</span>
                <span className="flex-1">{questionNames[item.questionId]}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {getQuestionType(item.type).label} · {fmtNum(item.points)} pt
                </span>
              </li>
            ))}
          </ol>
          <details>
            <summary className="cursor-pointer text-sm font-medium">Why these questions?</summary>
            <ul className="mt-2 grid gap-1.5 text-sm text-muted-foreground">
              {explainSelection(built.ok.trace, blueprint, { topics: topicNames, questions: questionNames }).map(
                (line, i) => (
                  <li key={i}>{line}</li>
                ),
              )}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}
