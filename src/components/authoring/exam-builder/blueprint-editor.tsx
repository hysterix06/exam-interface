"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { difficultyLabel } from "@/engine/authoring/summary";
import { type Blueprint, type BlueprintSection, type PoolItem, sectionTopics } from "@/engine/selection/types";
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
        const ids = sectionTopics(s);
        const drawable = pool.filter((q) => ids.includes(q.topicId) && q.weight > 0);
        const mix = s.difficultyMix;
        const others = topics.filter((t) => t.id !== s.topicId);
        const toggleExtra = (topicId: string, on: boolean) => {
          const extra = (s.extraTopicIds ?? []).filter((t) => t !== topicId);
          const next = on ? [...extra, topicId] : extra;
          const limits = s.limits ? Object.fromEntries(Object.entries(s.limits).filter(([t]) => t === s.topicId || next.includes(t))) : undefined;
          setSection(i, { extraTopicIds: next.length ? next : undefined, limits: next.length && limits && Object.keys(limits).length ? limits : undefined });
        };
        const setLimit = (topicId: string, key: "min" | "max", raw: string) => {
          const value = raw === "" ? undefined : Math.max(0, Math.floor(Number(raw)) || 0);
          const current = { ...(s.limits?.[topicId] ?? {}), [key]: value };
          const limits = { ...(s.limits ?? {}), [topicId]: current };
          if (current.min === undefined && current.max === undefined) delete limits[topicId];
          setSection(i, { limits: Object.keys(limits).length ? limits : undefined });
        };
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
                onChange={(e) =>
                  setSection(i, {
                    topicId: e.target.value,
                    extraTopicIds: s.extraTopicIds?.filter((t) => t !== e.target.value).length ? s.extraTopicIds.filter((t) => t !== e.target.value) : undefined,
                    limits: undefined,
                  })
                }
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

            {others.length > 0 && (
              <details open={Boolean(s.extraTopicIds?.length)}>
                <summary className="cursor-pointer text-sm">Also draw from other topics{s.extraTopicIds?.length ? ` (${s.extraTopicIds.length})` : ""}</summary>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {others.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" className="accent-foreground" checked={s.extraTopicIds?.includes(t.id) ?? false} onChange={(e) => toggleExtra(t.id, e.target.checked)} />
                      {t.name}
                    </label>
                  ))}
                </div>
                {ids.length > 1 && !mix && (
                  <div className="mt-3 grid gap-2">
                    <p className="text-xs text-muted-foreground">
                      One lottery across these topics. Optionally make sure each topic gets at least, or no more than, a number of
                      questions. Minimums are drawn first, then the rest by rank.
                    </p>
                    {ids.map((t) => {
                      const name = topics.find((x) => x.id === t)?.name ?? t;
                      const available = drawable.filter((q) => q.topicId === t).length;
                      return (
                        <div key={t} className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="min-w-40">
                            {name} <span className="text-xs text-muted-foreground">({available} available)</span>
                          </span>
                          <Input type="number" min={0} className="w-20" placeholder="min" aria-label={`At least this many from ${name}`} value={s.limits?.[t]?.min ?? ""} onChange={(e) => setLimit(t, "min", e.target.value)} />
                          <Input type="number" min={0} className="w-20" placeholder="max" aria-label={`At most this many from ${name}`} value={s.limits?.[t]?.max ?? ""} onChange={(e) => setLimit(t, "max", e.target.value)} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </details>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-foreground"
                disabled={Boolean(s.limits)}
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
