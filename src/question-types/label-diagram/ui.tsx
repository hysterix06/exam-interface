"use client";

import { Plus, X } from "lucide-react";
import { AssetPicker } from "@/components/assets/asset-picker";
import { HAIRLINE, ImageCanvas } from "@/components/assets/image-canvas";
import { ChipBoard } from "@/components/dnd/chip-board";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Prose } from "@/components/ui/prose";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AssetRef } from "@/engine/asset";
import { nextOptionId } from "../choice-ui";
import { withFormatHint } from "../hints";
import type { QuestionTypeUi } from "../ui-types";
import type { LabelDiagramDef, LabelDiagramResponse } from "./core";

type StudentInstance = { stem: string; image: AssetRef | null; pins: { id: string; x: number; y: number }[]; labels: { id: string; text: string }[] };

function Pins({ pins }: { pins: { id: string; x: number; y: number }[] }) {
  return (
    <>
      {pins.map((p, i) => (
        <g key={p.id}>
          <circle cx={p.x} cy={p.y} r={0.022} className="fill-background stroke-foreground" {...HAIRLINE} />
          <text x={p.x} y={p.y} dy="0.012" textAnchor="middle" fontSize="0.026" className="fill-foreground font-semibold">
            {i + 1}
          </text>
        </g>
      ))}
    </>
  );
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export const labelDiagramUi: QuestionTypeUi<LabelDiagramDef, StudentInstance, LabelDiagramResponse> = {
  id: "label-diagram",
  description: "Drag labels onto numbered pins on a diagram. Wrong labels can be mixed in.",

  newDef: () => ({ stem: "", image: null, pins: [], labels: [], penalty: 0 }),

  Editor({ def, onChange }) {
    const set = (patch: Partial<LabelDiagramDef>) => onChange({ ...def, ...patch });
    const addLabel = () => set({ labels: [...def.labels, { id: nextOptionId(def.labels), text: "" }] });
    return (
      <div className="grid gap-5">
        <Field label="Question" hint={withFormatHint("e.g. “Drag each label to the right part of the cell.”")}>
          <Textarea value={def.stem} onChange={(e) => set({ stem: e.target.value })} />
        </Field>
        <AssetPicker value={def.image} onChange={(image) => set({ image })} />
        {def.image && (
          <div className="grid gap-2">
            <p className="text-xs text-muted-foreground">Click the image to drop a numbered pin.</p>
            <ImageCanvas
              image={def.image}
              label="Image with numbered pins"
              onPoint={(p) => set({ pins: [...def.pins, { id: nextOptionId(def.pins.map((x) => ({ id: x.id, text: "" }))), x: round(p.x), y: round(p.y), labelId: def.labels[0]?.id ?? "" }] })}
            >
              <Pins pins={def.pins} />
            </ImageCanvas>
          </div>
        )}
        <div className="grid gap-2">
          <span className="text-sm font-medium">Labels</span>
          <p className="text-xs text-muted-foreground">Every label students can drag. Ones no pin uses are distractors.</p>
          {def.labels.map((l, i) => (
            <div key={l.id} className="flex items-center gap-2">
              <Input placeholder={`Label ${i + 1}`} aria-label={`Label ${i + 1}`} value={l.text} onChange={(e) => set({ labels: def.labels.map((x) => (x.id === l.id ? { ...x, text: e.target.value } : x)) })} />
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove label ${i + 1}`} onClick={() => set({ labels: def.labels.filter((x) => x.id !== l.id) })}>
                <X />
              </Button>
            </div>
          ))}
          <div>
            <Button type="button" variant="outline" size="sm" onClick={addLabel}>
              <Plus /> Add label
            </Button>
          </div>
        </div>
        {def.pins.length > 0 && (
          <div className="grid gap-2">
            <span className="text-sm font-medium">Pins</span>
            {def.pins.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2 text-sm">
                <span className="w-12">Pin {i + 1}</span>
                <Select className="flex-1" aria-label={`Correct label for pin ${i + 1}`} value={p.labelId} onChange={(e) => set({ pins: def.pins.map((x) => (x.id === p.id ? { ...x, labelId: e.target.value } : x)) })}>
                  <option value="">Choose…</option>
                  {def.labels.map((l, j) => (
                    <option key={l.id} value={l.id}>
                      {l.text.trim() || `Label ${j + 1}`}
                    </option>
                  ))}
                </Select>
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove pin ${i + 1}`} onClick={() => set({ pins: def.pins.filter((x) => x.id !== p.id) })}>
                  <X />
                </Button>
              </div>
            ))}
          </div>
        )}
        <Field label="Wrong-label penalty (%)" hint="Share of a pin's points lost for a wrong label. 0 = none; never below 0 in total.">
          <Input type="number" min={0} max={100} value={Math.round(def.penalty * 100)} onChange={(e) => set({ penalty: Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100 })} />
        </Field>
      </div>
    );
  },

  Renderer({ instance, value, onChange, readOnly }) {
    return (
      <div className="grid gap-4">
        <Prose className="text-base">{instance.stem}</Prose>
        <div className="grid gap-4 lg:grid-cols-2">
          {instance.image && (
            <ImageCanvas image={instance.image}>
              <Pins pins={instance.pins} />
            </ImageCanvas>
          )}
          <ChipBoard
            chips={instance.labels}
            containers={instance.pins.map((p, i) => ({ id: p.id, name: `pin ${i + 1}`, capacity: 1, label: <span className="font-medium">Pin {i + 1}</span> }))}
            placement={Object.fromEntries(Object.entries(value?.placement ?? {}).filter(([, l]) => l).map(([p, l]) => [l, p]))}
            readOnly={readOnly}
            bankLabel="Labels"
            onChange={(next) => onChange?.({ placement: Object.fromEntries(Object.entries(next).map(([l, p]) => [p, l])) })}
          />
        </div>
      </div>
    );
  },
};
