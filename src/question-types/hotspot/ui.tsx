"use client";

import { Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { AssetPicker } from "@/components/assets/asset-picker";
import { HAIRLINE, ImageCanvas } from "@/components/assets/image-canvas";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Prose } from "@/components/ui/prose";
import { Textarea } from "@/components/ui/textarea";
import type { AssetRef } from "@/engine/asset";
import type { Point, Shape } from "@/engine/geometry";
import { nextOptionId } from "../choice-ui";
import { withFormatHint } from "../hints";
import type { QuestionTypeUi } from "../ui-types";
import type { HotspotDef, HotspotResponse } from "./core";

type StudentInstance = { stem: string; image: AssetRef | null; multiple: boolean };

function ShapeView({ shape, className }: { shape: Shape; className?: string }) {
  const style = { ...HAIRLINE, className };
  if (shape.kind === "rect") return <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} {...style} />;
  if (shape.kind === "circle") return <ellipse cx={shape.cx} cy={shape.cy} rx={shape.r} ry={shape.r} {...style} />;
  return <polygon points={shape.points.map((p) => p.join(",")).join(" ")} {...style} />;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export const hotspotUi: QuestionTypeUi<HotspotDef, StudentInstance, HotspotResponse> = {
  id: "hotspot",
  description: "Click the right place on an image: a part of a diagram, a map, a photo.",

  newDef: () => ({ stem: "", image: null, regions: [], multiple: false, penalty: 0 }),

  Editor({ def, onChange }) {
    const set = (patch: Partial<HotspotDef>) => onChange({ ...def, ...patch });
    const [tool, setTool] = useState<"rect" | "circle">("rect");
    const [drag, setDrag] = useState<{ from: Point; to: Point } | null>(null);
    const add = (shape: Shape) =>
      set({ regions: [...def.regions, { id: nextOptionId(def.regions.map((r) => ({ id: r.id, text: r.label }))), label: "", shape, correct: def.regions.length === 0 }] });
    const finish = () => {
      if (!drag) return;
      const { from, to } = drag;
      setDrag(null);
      if (tool === "circle") {
        const r = Math.max(0.02, Math.hypot(to.x - from.x, to.y - from.y));
        add({ kind: "circle", cx: round(from.x), cy: round(from.y), r: round(Math.min(r, 1)) });
      } else {
        const w = Math.abs(to.x - from.x);
        const h = Math.abs(to.y - from.y);
        if (w < 0.01 || h < 0.01) return;
        add({ kind: "rect", x: round(Math.min(from.x, to.x)), y: round(Math.min(from.y, to.y)), w: round(w), h: round(h) });
      }
    };
    return (
      <div className="grid gap-5">
        <Field label="Question" hint={withFormatHint("Say what to click, e.g. “Click the left ventricle.”")}>
          <Textarea value={def.stem} onChange={(e) => set({ stem: e.target.value })} />
        </Field>
        <AssetPicker value={def.image} onChange={(image) => set({ image })} />
        {def.image && (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-medium">Draw regions:</span>
              {(["rect", "circle"] as const).map((t) => (
                <label key={t} className="flex items-center gap-1">
                  <input type="radio" name="hotspot-tool" className="accent-foreground" checked={tool === t} onChange={() => setTool(t)} />
                  {t === "rect" ? "Rectangle (drag)" : "Circle (drag from the centre)"}
                </label>
              ))}
            </div>
            <ImageCanvas
              image={def.image}
              label="Image with answer regions"
              onPointerDown={(p) => setDrag({ from: p, to: p })}
              onPointerMove={(p) => drag && setDrag({ ...drag, to: p })}
              onPointerUp={finish}
            >
              {def.regions.map((r) => (
                <ShapeView key={r.id} shape={r.shape} className={r.correct ? "fill-success/25 stroke-success" : "fill-foreground/10 stroke-foreground"} />
              ))}
              {drag && tool === "rect" && (
                <rect x={Math.min(drag.from.x, drag.to.x)} y={Math.min(drag.from.y, drag.to.y)} width={Math.abs(drag.to.x - drag.from.x)} height={Math.abs(drag.to.y - drag.from.y)} className="fill-brand/20 stroke-brand" {...HAIRLINE} />
              )}
              {drag && tool === "circle" && <ellipse cx={drag.from.x} cy={drag.from.y} rx={Math.hypot(drag.to.x - drag.from.x, drag.to.y - drag.from.y)} ry={Math.hypot(drag.to.x - drag.from.x, drag.to.y - drag.from.y)} className="fill-brand/20 stroke-brand" {...HAIRLINE} />}
            </ImageCanvas>
            <p className="text-xs text-muted-foreground">Green regions are correct. For an irregular outline, add a polygon below as x,y pairs between 0 and 1.</p>
          </div>
        )}

        <div className="grid gap-2">
          <span className="text-sm font-medium">Regions</span>
          {def.regions.map((r, i) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2">
              <input
                type="checkbox"
                className="accent-foreground"
                aria-label={`Region ${i + 1} is correct`}
                checked={r.correct}
                onChange={(e) => set({ regions: def.regions.map((x) => (x.id === r.id ? { ...x, correct: e.target.checked } : x)) })}
              />
              <Input className="min-w-40 flex-1" placeholder={`Region ${i + 1} name`} aria-label={`Region ${i + 1} name`} value={r.label} onChange={(e) => set({ regions: def.regions.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x)) })} />
              <span className="text-xs text-muted-foreground">{r.shape.kind}</span>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove region ${i + 1}`} onClick={() => set({ regions: def.regions.filter((x) => x.id !== r.id) })}>
                <X />
              </Button>
            </div>
          ))}
          <PolygonAdder onAdd={add} />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-foreground" checked={def.multiple} onChange={(e) => set({ multiple: e.target.checked })} />
          Students mark every correct region (one click each)
        </label>
        <Field label="Wrong-click penalty (%)" hint="Share of the points (or of one region's share) lost for each wrong click. 0 = none; never below 0 in total.">
          <Input type="number" min={0} max={100} value={Math.round(def.penalty * 100)} onChange={(e) => set({ penalty: Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100 })} />
        </Field>
      </div>
    );
  },

  Renderer({ instance, value, onChange, readOnly }) {
    const stemId = useId();
    const clicks = value?.points ?? [];
    const [cursor, setCursor] = useState<Point>({ x: 0.5, y: 0.5 });
    const place = (p: Point) => {
      if (readOnly) return;
      const pt = { x: round(p.x), y: round(p.y) };
      onChange?.({ points: instance.multiple ? [...clicks, pt].slice(-20) : [pt] });
    };
    if (!instance.image) return <Prose className="text-base">{instance.stem}</Prose>;
    return (
      <div className="grid gap-3">
        <Prose id={stemId} className="text-base">{instance.stem}</Prose>
        <div
          tabIndex={readOnly ? undefined : 0}
          role={readOnly ? undefined : "application"}
          aria-labelledby={stemId}
          aria-describedby={readOnly ? undefined : `${stemId}-keys`}
          className="w-fit max-w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onKeyDown={(e) => {
            if (readOnly) return;
            const step = e.shiftKey ? 0.1 : 0.02;
            const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
            if (moves[e.key]) {
              e.preventDefault();
              setCursor((c) => ({ x: Math.min(1, Math.max(0, c.x + moves[e.key][0])), y: Math.min(1, Math.max(0, c.y + moves[e.key][1])) }));
            } else if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              place(cursor);
            }
          }}
        >
          <ImageCanvas image={instance.image} onPoint={readOnly ? undefined : place}>
            {!readOnly && <circle cx={cursor.x} cy={cursor.y} r={0.012} className="fill-none stroke-brand" {...HAIRLINE} aria-hidden />}
            {clicks.map((c, i) => (
              <g key={i} aria-hidden>
                <circle cx={c.x} cy={c.y} r={0.018} className="fill-brand/40 stroke-brand" {...HAIRLINE} />
              </g>
            ))}
          </ImageCanvas>
        </div>
        {!readOnly && (
          <p id={`${stemId}-keys`} className="text-xs text-muted-foreground">
            Click the image{instance.multiple ? " once for each place" : ""}. With a keyboard: arrow keys move the ring (Shift for bigger steps), Enter marks it.
            {clicks.length > 0 && (
              <>
                {" "}
                <button type="button" className="underline underline-offset-2" onClick={() => onChange?.({ points: instance.multiple ? clicks.slice(0, -1) : [] })}>
                  Undo last mark
                </button>
              </>
            )}
          </p>
        )}
        <p className="sr-only" role="status" aria-live="polite">
          {clicks.length ? `${clicks.length} ${clicks.length === 1 ? "mark" : "marks"} placed, last at ${Math.round(clicks.at(-1)!.x * 100)}% across and ${Math.round(clicks.at(-1)!.y * 100)}% down.` : ""}
        </p>
      </div>
    );
  },
};

function PolygonAdder({ onAdd }: { onAdd: (s: Shape) => void }) {
  const [text, setText] = useState("");
  const pts = text
    .split(/[\s;]+/)
    .map((pair) => pair.split(",").map(Number))
    .filter((p) => p.length === 2 && p.every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) as [number, number][];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input className="min-w-60 flex-1 font-mono" placeholder="Polygon: 0.1,0.1 0.4,0.1 0.3,0.4" aria-label="Polygon points" value={text} onChange={(e) => setText(e.target.value)} />
      <Button type="button" variant="outline" size="sm" disabled={pts.length < 3} onClick={() => { onAdd({ kind: "polygon", points: pts }); setText(""); }}>
        <Plus /> Add polygon
      </Button>
    </div>
  );
}
