"use client";

import { Eraser, Highlighter, Pen, Undo2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { AssetPicker } from "@/components/assets/asset-picker";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Prose } from "@/components/ui/prose";
import { Textarea } from "@/components/ui/textarea";
import { type AssetRef, assetUrl } from "@/engine/asset";
import { simplifyStroke } from "@/engine/geometry";
import { withFormatHint } from "../hints";
import { RubricEditor } from "../rubric-ui";
import type { QuestionTypeUi } from "../ui-types";
import { MAX_STROKES, type WhiteboardDef, type WhiteboardResponse } from "./core";

type StudentInstance = { stem: string; background: AssetRef | null };
type Stroke = WhiteboardResponse["strokes"][number];

const WIDTH: Record<Stroke["tool"], number> = { pen: 2.5, marker: 10, eraser: 16 };
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function StrokePath({ s }: { s: Stroke }) {
  if (s.tool === "eraser") return null;
  const d = s.points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  return (
    <path
      d={s.points.length === 1 ? `${d} l0.0001 0` : d}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
      strokeWidth={WIDTH[s.tool]}
      className={s.tool === "marker" ? "stroke-brand/35" : "stroke-foreground"}
    />
  );
}

export const whiteboardUi: QuestionTypeUi<WhiteboardDef, StudentInstance, WhiteboardResponse> = {
  id: "whiteboard",
  description: "Draw an answer: a sketch, a graph or an annotated diagram. Marked by hand against a rubric.",

  newDef: () => ({ stem: "", background: null, rubric: [{ id: "a", text: "", points: 1 }] }),

  Editor({ def, onChange }) {
    const set = (patch: Partial<WhiteboardDef>) => onChange({ ...def, ...patch });
    return (
      <div className="grid gap-5">
        <Field label="Question" hint={withFormatHint("Say what to draw, e.g. “Sketch the graph of enzyme activity against temperature.”")}>
          <Textarea value={def.stem} onChange={(e) => set({ stem: e.target.value })} />
        </Field>
        <AssetPicker label="Background to draw on (optional)" value={def.background} onChange={(background) => set({ background })} />
        <RubricEditor rubric={def.rubric} onChange={(rubric) => set({ rubric })} />
      </div>
    );
  },

  Renderer({ instance, value, onChange, readOnly }) {
    const stemId = useId();
    const strokes = value?.strokes ?? [];
    const [tool, setTool] = useState<Stroke["tool"]>("pen");
    const [live, setLive] = useState<[number, number][] | null>(null);
    const svg = useRef<SVGSVGElement>(null);
    const bg = instance.background;
    const ratio = bg ? `${bg.width} / ${bg.height}` : "4 / 3";

    const at = (e: React.PointerEvent): [number, number] => {
      const r = svg.current!.getBoundingClientRect();
      return [r3(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))), r3(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)))];
    };
    const commit = () => {
      if (!live) return;
      const points = simplifyStroke(live, 0.002);
      setLive(null);
      if (tool === "eraser") {
        // Remove every stroke the eraser passed near.
        const near = (s: Stroke) => s.points.some(([x, y]) => points.some(([ex, ey]) => Math.hypot(x - ex, y - ey) < 0.02));
        onChange?.({ strokes: strokes.filter((s) => !near(s)) });
      } else if (strokes.length < MAX_STROKES) {
        onChange?.({ strokes: [...strokes, { tool, points }] });
      }
    };

    return (
      <div className="grid gap-3">
        <Prose id={stemId} className="text-base">{instance.stem}</Prose>
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Drawing tools">
            {(
              [
                ["pen", Pen, "Pen"],
                ["marker", Highlighter, "Highlighter"],
                ["eraser", Eraser, "Eraser"],
              ] as const
            ).map(([t, Icon, label]) => (
              <Button key={t} type="button" size="sm" variant={tool === t ? "default" : "ghost"} aria-pressed={tool === t} onClick={() => setTool(t)}>
                <Icon /> {label}
              </Button>
            ))}
            <Button type="button" size="sm" variant="ghost" disabled={strokes.length === 0} onClick={() => onChange?.({ strokes: strokes.slice(0, -1) })}>
              <Undo2 /> Undo
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={strokes.length === 0} onClick={() => onChange?.({ strokes: [] })}>
              Clear
            </Button>
          </div>
        )}
        <div className="relative w-full max-w-2xl overflow-hidden rounded-md border bg-background" style={{ aspectRatio: ratio }}>
          {bg && (
            // eslint-disable-next-line @next/next/no-img-element -- access-checked redirect, not a static asset
            <img src={assetUrl(bg.assetId)} alt={bg.alt} width={bg.width} height={bg.height} className="absolute inset-0 h-full w-full" draggable={false} />
          )}
          <svg
            ref={svg}
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            role="img"
            aria-label={readOnly ? "The student's drawing" : "Drawing area for your answer"}
            aria-describedby={`${stemId}-count`}
            className={`absolute inset-0 h-full w-full touch-none ${readOnly ? "" : "cursor-crosshair"}`}
            onPointerDown={readOnly ? undefined : (e) => { e.currentTarget.setPointerCapture(e.pointerId); setLive([at(e)]); }}
            onPointerMove={readOnly ? undefined : (e) => live && setLive([...live, at(e)])}
            onPointerUp={readOnly ? undefined : commit}
            onPointerCancel={readOnly ? undefined : () => setLive(null)}
          >
            {strokes.map((s, i) => (
              <StrokePath key={i} s={s} />
            ))}
            {live && <StrokePath s={{ tool: tool === "eraser" ? "marker" : tool, points: live }} />}
          </svg>
        </div>
        <p id={`${stemId}-count`} className="text-xs text-muted-foreground">
          {strokes.length} {strokes.length === 1 ? "stroke" : "strokes"}
          {!readOnly && " · Draw with a mouse, pen or finger. Saved as you go. If you can't draw, tell your instructor: this question is marked by hand."}
        </p>
      </div>
    );
  },
};
