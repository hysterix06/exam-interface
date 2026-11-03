"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { initMessage, parseWidgetMessage, WIDGETS, widgetById } from "@/engine/widget";
import type { QuestionTypeUi } from "../ui-types";
import type { WidgetDef, WidgetResponse } from "./core";

type StudentInstance = Pick<WidgetDef, "stem" | "widget" | "config">;

/**
 * Hosts a widget in a sandboxed iframe. The sandbox has no same-origin
 * access, so the widget can run its own scripts but cannot touch the exam
 * page, its cookies or storage; it can only post the messages we accept.
 */
function WidgetFrame({
  id,
  config,
  state,
  readOnly,
  onState,
}: {
  id: string;
  config: unknown;
  state: unknown;
  readOnly: boolean;
  onState?: (s: unknown) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const info = widgetById(id);
  const latest = useRef({ config, state, readOnly, onState });
  useEffect(() => {
    latest.current = { config, state, readOnly, onState };
  });

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      const m = parseWidgetMessage(e.data);
      if (!m) return;
      if (m.type === "exam:ready") setReady(true);
      else if (!latest.current.readOnly) latest.current.onState?.(m.state);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Send the saved state once the widget says it is ready (and again if we're reviewing a different state).
  const stateKey = JSON.stringify(readOnly ? state : null);
  useEffect(() => {
    if (!ready) return;
    const { config: c, state: s, readOnly: ro } = latest.current;
    frame.current?.contentWindow?.postMessage(initMessage(s, c, ro), "*");
    // Only re-init on readiness or when a read-only view's state changes, never on the student's own edits.
  }, [ready, stateKey]);

  if (!info) return <p className="text-sm text-destructive">Unknown widget “{id}”.</p>;
  return (
    <iframe
      ref={frame}
      title={info.label}
      src={info.src}
      sandbox="allow-scripts"
      className="h-96 w-full rounded-lg border bg-background"
    />
  );
}

export const widgetUi: QuestionTypeUi<WidgetDef, StudentInstance, WidgetResponse> = {
  id: "widget",
  description: "An embedded interactive tool, like a till or a simulator. Graded on what it reports.",

  newDef: () => ({
    stem: "",
    widget: WIDGETS[0].id,
    config: {},
    checks: [],
    solution: {},
  }),

  Editor({ def, onChange }) {
    const set = (patch: Partial<WidgetDef>) => onChange({ ...def, ...patch });
    const setCheck = (id: string, patch: Record<string, unknown>) =>
      set({ checks: def.checks.map((c) => (c.id === id ? ({ ...c, ...patch } as typeof c) : c)) });
    const [configText, setConfigText] = useState(JSON.stringify(def.config, null, 2));
    const [solutionText, setSolutionText] = useState(JSON.stringify(def.solution, null, 2));
    const [configErr, setConfigErr] = useState(false);
    const [solutionErr, setSolutionErr] = useState(false);
    const info = widgetById(def.widget);

    return (
      <div className="grid gap-5">
        <Field label="Task">
          <Textarea value={def.stem} onChange={(e) => set({ stem: e.target.value })} />
        </Field>
        <Field label="Widget" hint={info?.description}>
          <Select value={def.widget} onChange={(e) => set({ widget: e.target.value })}>
            {WIDGETS.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Scenario (JSON)" hint="Passed to the widget when it starts, e.g. a menu or starting data.">
          <Textarea
            className="min-h-28 font-mono text-xs"
            aria-invalid={configErr}
            value={configText}
            onChange={(e) => {
              setConfigText(e.target.value);
              try {
                set({ config: JSON.parse(e.target.value) });
                setConfigErr(false);
              } catch {
                setConfigErr(true);
              }
            }}
          />
        </Field>
        <Field label="State of a perfect run (JSON)" hint="Do the task yourself in the preview, then paste what the widget reports. The checks below must pass against it.">
          <Textarea
            className="min-h-28 font-mono text-xs"
            aria-invalid={solutionErr}
            value={solutionText}
            onChange={(e) => {
              setSolutionText(e.target.value);
              try {
                set({ solution: JSON.parse(e.target.value) });
                setSolutionErr(false);
              } catch {
                setSolutionErr(true);
              }
            }}
          />
        </Field>

        <div className="grid gap-2">
          <span className="text-sm font-medium">What is graded</span>
          <p className="text-xs text-muted-foreground">
            Each check reads one value from the state the widget reports, e.g. <code>total</code> or <code>order.length</code>.
          </p>
          {def.checks.map((c, i) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2">
              <Input className="min-w-36 flex-1" placeholder="Label" aria-label={`Check ${i + 1} label`} value={c.label} onChange={(e) => setCheck(c.id, { label: e.target.value })} />
              <Input className="w-32 font-mono" placeholder="path" aria-label={`Check ${i + 1} path`} value={c.path} onChange={(e) => setCheck(c.id, { path: e.target.value })} />
              <Select className="w-24" aria-label={`Check ${i + 1} kind`} value={c.kind} onChange={(e) => setCheck(c.id, e.target.value === "number" ? { kind: "number", expected: 0, abs: 0 } : { kind: "text", expected: "" })}>
                <option value="number">number</option>
                <option value="text">text</option>
              </Select>
              {c.kind === "number" ? (
                <>
                  <Input className="w-24" type="number" step="any" aria-label={`Check ${i + 1} expected`} value={c.expected} onChange={(e) => setCheck(c.id, { expected: Number(e.target.value) })} />
                  <Input className="w-20" type="number" step="any" min={0} aria-label={`Check ${i + 1} allowed error`} title="Allowed error" value={c.abs} onChange={(e) => setCheck(c.id, { abs: Number(e.target.value) || 0 })} />
                </>
              ) : (
                <Input className="w-32" aria-label={`Check ${i + 1} expected`} value={c.expected} onChange={(e) => setCheck(c.id, { expected: e.target.value })} />
              )}
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove check ${i + 1}`} onClick={() => set({ checks: def.checks.filter((x) => x.id !== c.id) })}>
                <X />
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                let n = def.checks.length + 1;
                const taken = new Set(def.checks.map((c) => c.id));
                while (taken.has(`k${n}`)) n++;
                set({ checks: [...def.checks, { kind: "number", id: `k${n}`, label: "", path: "", expected: 0, abs: 0 }] });
              }}
            >
              <Plus /> Add check
            </Button>
          </div>
        </div>
      </div>
    );
  },

  Renderer({ instance, value, onChange, readOnly }) {
    return (
      <div className="grid gap-4">
        <p className="whitespace-pre-wrap text-base">{instance.stem}</p>
        <WidgetFrame
          id={instance.widget}
          config={instance.config}
          state={value?.state ?? null}
          readOnly={Boolean(readOnly)}
          onState={(state) => onChange?.({ state })}
        />
      </div>
    );
  },
};
