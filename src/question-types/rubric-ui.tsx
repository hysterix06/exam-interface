"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RubricCriterion } from "@/engine/grading/rubric";
import { nextOptionId } from "./choice-ui";

/** The marking checklist for hand-marked types (long answer, drawing). */
export function RubricEditor({ rubric, onChange }: { rubric: RubricCriterion[]; onChange: (rubric: RubricCriterion[]) => void }) {
  const setCriterion = (id: string, patch: Partial<RubricCriterion>) => onChange(rubric.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const total = rubric.reduce((s, c) => s + c.points, 0);
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">Rubric</span>
      <p className="text-xs text-muted-foreground">
        What earns marks. A grader ticks each criterion that is met; weights are scaled to the question&apos;s points
        {total > 0 ? ` (${rubric.length} criteria, ${total} rubric points).` : "."}
      </p>
      {rubric.map((c, i) => (
        <div key={c.id} className="flex items-center gap-2">
          <Input value={c.text} placeholder={`Criterion ${i + 1}`} aria-label={`Criterion ${i + 1}`} onChange={(e) => setCriterion(c.id, { text: e.target.value })} />
          <Input
            className="w-20"
            type="number"
            min={0}
            step="any"
            aria-label={`Criterion ${i + 1} weight`}
            title="Weight"
            value={c.points}
            onChange={(e) => setCriterion(c.id, { points: Number(e.target.value) })}
          />
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove criterion ${i + 1}`} onClick={() => onChange(rubric.filter((x) => x.id !== c.id))}>
            <X />
          </Button>
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...rubric, { id: nextOptionId(rubric.map((c) => ({ id: c.id, text: c.text }))), text: "", points: 1 }])}>
          <Plus /> Add criterion
        </Button>
      </div>
    </div>
  );
}
