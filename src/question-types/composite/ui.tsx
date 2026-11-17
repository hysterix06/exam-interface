"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { useState } from "react";
import { AssetPicker } from "@/components/assets/asset-picker";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Prose } from "@/components/ui/prose";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type AssetRef, assetUrl } from "@/engine/asset";
import { withFormatHint } from "../hints";
import { questionTypes } from "../registry";
import type { AnyQuestionTypeUi, QuestionTypeUi } from "../ui-types";
import { COMPOSITE_ID, type CompositeDef, type CompositeResponse, partLetter } from "./core";

type StudentInstance = {
  stem: string;
  stimulus: string;
  stimulusImage?: AssetRef;
  parts: { id: string; type: string; label?: string; instance: unknown }[];
};

/** Built with a lookup (like the core) so the UI registry can include it without a cycle. */
export function makeCompositeUi(lookup: (id: string) => AnyQuestionTypeUi): QuestionTypeUi<CompositeDef, StudentInstance, CompositeResponse> {
  const partTypes = () => [...questionTypes.values()].filter((t) => t.id !== COMPOSITE_ID);
  return {
    id: COMPOSITE_ID,
    description: "One passage, table or data set with several questions of any type about it.",

    newDef: () => ({ stem: "", stimulus: "", shuffleParts: false, parts: [] }),

    Editor({ def, onChange }) {
      const [adding, setAdding] = useState("mcq");
      const set = (patch: Partial<CompositeDef>) => onChange({ ...def, ...patch });
      const setPart = (i: number, patch: Partial<CompositeDef["parts"][number]>) => set({ parts: def.parts.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
      const move = (i: number, to: number) => {
        const parts = [...def.parts];
        const [p] = parts.splice(i, 1);
        parts.splice(to, 0, p);
        set({ parts });
      };
      const nextId = () => {
        for (let n = def.parts.length + 1; ; n++) if (!def.parts.some((p) => p.id === `p${n}`)) return `p${n}`;
      };
      const total = def.parts.reduce((s, p) => s + p.weight, 0) || 1;
      return (
        <div className="grid gap-5">
          <Field label="Passage" hint={withFormatHint("The shared material every part refers to: a text, a table, a data set.")}>
            <Textarea className="min-h-32" value={def.stimulus} onChange={(e) => set({ stimulus: e.target.value })} />
          </Field>
          <AssetPicker label="Figure (optional)" value={def.stimulusImage ?? null} onChange={(img) => set({ stimulusImage: img ?? undefined })} />
          <Field label="Instructions" hint="Shown above the parts, e.g. “Read the field notes, then answer each part.”">
            <Input value={def.stem} onChange={(e) => set({ stem: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-foreground" checked={def.shuffleParts} onChange={(e) => set({ shuffleParts: e.target.checked })} />
            Shuffle the order of parts for each student
          </label>

          <div className="grid gap-4">
            {def.parts.map((p, i) => {
              const ui = lookup(p.type);
              return (
                <fieldset key={p.id} className="grid gap-4 rounded-lg border p-4">
                  <legend className="px-1 text-sm font-medium">
                    Part {partLetter(i)} · {questionTypes.get(p.type)?.label ?? p.type}
                  </legend>
                  <div className="flex flex-wrap items-end gap-2">
                    <Field label="Heading (optional)" className="min-w-48 flex-1">
                      <Input value={p.label ?? ""} onChange={(e) => setPart(i, { label: e.target.value || undefined })} />
                    </Field>
                    <Field label="Weight" hint={`${Math.round((p.weight / total) * 100)}% of the points`}>
                      <Input type="number" min={0.1} step="any" className="w-24" value={p.weight} onChange={(e) => setPart(i, { weight: Math.max(0.1, Number(e.target.value) || 1) })} />
                    </Field>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move part ${partLetter(i)} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                      <ArrowUp />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Move part ${partLetter(i)} down`} disabled={i === def.parts.length - 1} onClick={() => move(i, i + 1)}>
                      <ArrowDown />
                    </Button>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove part ${partLetter(i)}`} onClick={() => set({ parts: def.parts.filter((_, j) => j !== i) })}>
                      <X />
                    </Button>
                  </div>
                  <ui.Editor def={p.def} onChange={(d) => setPart(i, { def: d })} />
                </fieldset>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Type of the new part" className="w-auto">
              {partTypes().map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
            <Button type="button" variant="outline" size="sm" onClick={() => set({ parts: [...def.parts, { id: nextId(), type: adding, weight: 1, def: lookup(adding).newDef() }] })}>
              <Plus /> Add part
            </Button>
          </div>
        </div>
      );
    },

    Renderer({ instance, value, onChange, readOnly }) {
      const parts = value?.parts ?? {};
      return (
        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-label="Passage" className="grid gap-3 lg:sticky lg:top-6 lg:self-start">
            {instance.stimulusImage && (
              // eslint-disable-next-line @next/next/no-img-element -- access-checked redirect, not a static asset
              <img src={assetUrl(instance.stimulusImage.assetId)} alt={instance.stimulusImage.alt} width={instance.stimulusImage.width} height={instance.stimulusImage.height} className="h-auto w-full rounded-lg border" />
            )}
            {instance.stimulus.trim() && <Prose className="rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed">{instance.stimulus}</Prose>}
          </section>
          <div className="grid content-start gap-6">
            {instance.stem.trim() && <Prose className="text-base">{instance.stem}</Prose>}
            {instance.parts.map((p, i) => {
              const { Renderer } = lookup(p.type);
              return (
                <section key={p.id} aria-label={`Part ${partLetter(i)}`} className="grid gap-2 border-t pt-4 first:border-t-0 first:pt-0">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    Part {partLetter(i)}
                    {p.label ? ` · ${p.label}` : ""}
                  </h3>
                  <Renderer
                    instance={p.instance}
                    value={parts[p.id] ?? null}
                    readOnly={readOnly}
                    onChange={(v) => onChange?.({ parts: { ...parts, [p.id]: v } })}
                  />
                </section>
              );
            })}
          </div>
        </div>
      );
    },
  };
}
