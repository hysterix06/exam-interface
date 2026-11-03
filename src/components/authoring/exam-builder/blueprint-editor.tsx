"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { difficultyLabel } from "@/engine/authoring/summary";
import type { Blueprint, BlueprintSection, PoolItem } from "@/engine/selection/types";
import type { BuilderTopic } from "./types";

const LEVELS = [1, 2, 3];

export function BlueprintEditor({
  blueprint,
  onChange,
  topics,
  pool,
  disabled,
}: {
  blueprint: Blueprint;
  onChange: (b: Blueprint) => void;
  topics: BuilderTopic[];
  pool: readonly PoolItem[];
  disabled: boolean;
}) {
  const setSection = (i: number, patch: Partial<BlueprintSection>) =>
    onChange({
      ...blueprint,
      sections: blueprint.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)),
    });

  return (
    <div className="grid gap-3">
      {blueprint.sections.map((s, i) => {
        const drawable = pool.filter((q) => q.topicId === s.topicId && q.weight > 0);
        const mix = s.difficultyMix;
        return (
          <fieldset key={i} disabled={disabled} className="grid gap-3 rounded-lg border p-4">
            <legend className="sr-only">Section {i + 1}</legend>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                min={1}
                className="w-20"
                aria-label={`Section ${i + 1} question count`}
                value={mix ? Object.values(mix).reduce((a, b) => a + b, 0) : s.count}
                readOnly={Boolean(mix)}
                onChange={(e) => setSection(i, { count: Math.max(1, Math.floor(Number(e.target.value)) || 1) })}
              />
              <span className="text-sm">from</span>
              <Select
                className="w-auto min-w-48 flex-1"
                aria-label={`Section ${i + 1} topic`}
                value={s.topicId}
                onChange={(e) => setSection(i, { topicId: e.target.value })}
              >
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
              <span className="text-sm text-muted-foreground">
                {drawable.length} active {drawable.length === 1 ? "question" : "questions"} available
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove section ${i + 1}`}
                className="ml-auto"
                onClick={() => onChange({ ...blueprint, sections: blueprint.sections.filter((_, j) => j !== i) })}
              >
                <X />
              </Button>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-foreground"
                checked={Boolean(mix)}
                onChange={(e) =>
                  setSection(
                    i,
                    e.target.checked
                      ? { difficultyMix: { "1": 0, "2": s.count, "3": 0 } }
                      : { difficultyMix: undefined },
                  )
                }
              />
              Control the difficulty mix
            </label>

            {mix && (
              <div className="flex flex-wrap gap-4">
                {LEVELS.map((level) => {
                  const available = drawable.filter((q) => q.difficulty === level).length;
                  return (
                    <label key={level} className="grid gap-1 text-xs text-muted-foreground">
                      <span>
                        {difficultyLabel(level)} ({available} available)
                      </span>
                      <Input
                        type="number"
                        min={0}
                        className="w-24"
                        value={mix[String(level)] ?? 0}
                        onChange={(e) => {
                          const next = { ...mix, [String(level)]: Math.max(0, Math.floor(Number(e.target.value)) || 0) };
                          const total = Object.values(next).reduce((a, b) => a + b, 0);
                          setSection(i, { difficultyMix: next, count: Math.max(1, total) });
                        }}
                      />
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>
        );
      })}

      <div className="flex flex-wrap items-center gap-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || topics.length === 0}
          onClick={() =>
            onChange({
              ...blueprint,
              sections: [...blueprint.sections, { topicId: topics[0].id, count: 1 }],
            })
          }
        >
          <Plus /> Add section
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-foreground"
            disabled={disabled}
            checked={blueprint.shuffleQuestions}
            onChange={(e) => onChange({ ...blueprint, shuffleQuestions: e.target.checked })}
          />
          Shuffle question order for each student
        </label>
      </div>
      {topics.length === 0 && (
        <p className="text-sm text-muted-foreground">This course has no topics yet. Add some on the Topics tab.</p>
      )}
    </div>
  );
}
