"use client";

import Link from "next/link";
import { oddsOf, type OddsResult } from "@/engine/authoring/simulate";
import { difficultyLabel } from "@/engine/authoring/summary";
import { fmtNum } from "@/engine/grading/format";
import type { AttemptPoolItem } from "@/engine/attempt";

/**
 * Every question the blueprint can draw, with how likely each is to appear.
 * The percentage comes from running the real selector on fixed seeds; the
 * details element shows the raw count behind it.
 */
export function PoolTable({
  pool,
  topicNames,
  questionNames,
  odds,
}: {
  pool: readonly AttemptPoolItem[];
  topicNames: Record<string, string>;
  questionNames: Record<string, string>;
  odds: OddsResult;
}) {
  if (pool.length === 0) {
    return <p className="text-sm text-muted-foreground">No active questions in the chosen topics yet.</p>;
  }
  const topicWeight: Record<string, number> = {};
  for (const q of pool) topicWeight[q.topicId] = (topicWeight[q.topicId] ?? 0) + q.weight;
  const ok = odds.runs - odds.failures;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Question</th>
            <th className="px-3 py-2 font-medium">Topic</th>
            <th className="px-3 py-2 font-medium">Level</th>
            <th className="px-3 py-2 text-right font-medium">Pts</th>
            <th className="px-3 py-2 text-right font-medium">Weight</th>
            <th className="px-3 py-2 font-medium">Appears on</th>
          </tr>
        </thead>
        <tbody>
          {pool.map((q) => {
            const p = oddsOf(odds, q.id);
            const share = topicWeight[q.topicId] ? q.weight / topicWeight[q.topicId] : 0;
            return (
              <tr key={q.id} className="border-t align-top">
                <td className="max-w-xs px-3 py-2">
                  <Link href={`/teach/questions/${q.id}`} className="hover:underline">
                    {questionNames[q.id]}
                  </Link>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{topicNames[q.topicId]}</td>
                <td className="px-3 py-2 text-muted-foreground">{difficultyLabel(q.difficulty)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtNum(q.points)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {Math.round(share * 100)}%
                  <span className="block text-xs text-muted-foreground">of topic</span>
                </td>
                <td className="px-3 py-2">
                  {q.weight === 0 ? (
                    <span className="text-muted-foreground">never (weight 0)</span>
                  ) : (
                    <details>
                      <summary className="cursor-pointer tabular-nums">
                        about {Math.round(p * 100)}% of exams
                      </summary>
                      <p className="mt-1 max-w-56 text-xs text-muted-foreground">
                        Drawn in {fmtNum(odds.drawn[q.id] ?? 0)} of {fmtNum(ok)} simulated exams. The real selector
                        was run on {fmtNum(odds.runs)} fixed seeds, so this number is reproducible.
                      </p>
                    </details>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
