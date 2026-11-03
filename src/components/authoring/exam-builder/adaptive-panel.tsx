"use client";

import { useMemo, useState } from "react";
import { Select } from "@/components/ui/select";
import { type AdaptiveCandidate, simulateAdaptive } from "@/engine/adaptive";
import { difficultyLabel } from "@/engine/authoring/summary";
import { createRng } from "@/engine/rng";

const PATTERNS = {
  right: { label: "Gets everything right", answer: () => true },
  wrong: { label: "Gets everything wrong", answer: () => false },
  alternate: { label: "Right, wrong, right, wrong…", answer: (i: number) => i % 2 === 0 },
  mixed: { label: "Mostly right (about 70%)", answer: null },
} as const;
type Pattern = keyof typeof PATTERNS;

/**
 * Shows how adaptive difficulty stepping would walk through this exam's pool
 * for a pretend student. A preview of the rules only: live attempts still use
 * the normal fixed draw.
 */
export function AdaptivePanel({
  pool,
  count,
  questionNames,
}: {
  pool: readonly AdaptiveCandidate[];
  count: number;
  questionNames: Record<string, string>;
}) {
  const [pattern, setPattern] = useState<Pattern>("right");

  const steps = useMemo(() => {
    const p = PATTERNS[pattern];
    const rng = createRng("adaptive-preview");
    const answer = p.answer ?? ((i: number) => rng.fork(`a${i}`).next() < 0.7);
    return simulateAdaptive(pool, count || 5, answer, "adaptive-preview");
  }, [pool, count, pattern]);

  if (pool.length === 0) return <p className="text-sm text-muted-foreground">Add a section with questions to preview adaptive stepping.</p>;

  return (
    <div className="grid gap-4">
      <label className="grid max-w-xs gap-1.5 text-sm">
        <span className="font-medium">Pretend the student…</span>
        <Select value={pattern} onChange={(e) => setPattern(e.target.value as Pattern)}>
          {Object.entries(PATTERNS).map(([id, p]) => (
            <option key={id} value={id}>
              {p.label}
            </option>
          ))}
        </Select>
      </label>
      <ol className="divide-y rounded-lg border text-sm">
        {steps.map((s) => (
          <li key={s.index} className="grid gap-0.5 px-4 py-2.5">
            <div className="flex items-baseline gap-3">
              <span className="w-5 text-muted-foreground tabular-nums">{s.index + 1}.</span>
              <span className="flex-1">{questionNames[s.questionId] ?? s.questionId}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{difficultyLabel(s.level)}</span>
            </div>
            <p className="ml-8 text-xs text-muted-foreground">{s.reason}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
