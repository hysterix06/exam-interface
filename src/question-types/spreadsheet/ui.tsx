"use client";

import { ButtonTabs } from "@/components/ui/button-tabs";
import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addr, colName, evaluateSheet, MAX_COLS, MAX_ROWS, showValue } from "@/engine/sheet";
import type { QuestionTypeUi } from "../ui-types";
import type { SpreadsheetDef, SpreadsheetResponse } from "./core";

type StudentInstance = Pick<SpreadsheetDef, "stem" | "rows" | "cols" | "cells" | "inputs">;
type Mode = "given" | "student" | "solution";

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "given", label: "Given data", hint: "Type what students see: labels, numbers, formulas." },
  { id: "student", label: "Student cells", hint: "Click a cell to mark it as one the student fills in." },
  { id: "solution", label: "Model solution", hint: "Type what a perfect student would enter in each student cell." },
];

function Grid({
  rows,
  cols,
  cell,
}: {
  rows: number;
  cols: number;
  cell: (a: string) => React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-8 bg-muted/50" />
            {Array.from({ length: cols }, (_, c) => (
              <th key={c} scope="col" className="min-w-24 border-l bg-muted/50 px-2 py-1 text-xs font-medium text-muted-foreground">
                {colName(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, r) => (
            <tr key={r} className="border-t">
              <th scope="row" className="bg-muted/50 px-2 text-xs font-medium text-muted-foreground">
                {r + 1}
              </th>
              {Array.from({ length: cols }, (_, c) => (
                <td key={c} className="border-l p-0">
                  {cell(addr(r, c))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const cellInput = "h-8 w-full rounded-none border-0 bg-transparent px-2 text-sm outline-none focus:bg-muted/60 focus:ring-0 disabled:opacity-60";

export const spreadsheetUi: QuestionTypeUi<SpreadsheetDef, StudentInstance, SpreadsheetResponse> = {
  id: "spreadsheet",
  description: "A small in-browser spreadsheet. Graded on cell values and, if you want, on whether a formula was used.",

  newDef: () => ({
    stem: "",
    rows: 5,
    cols: 4,
    cells: {},
    inputs: [],
    solution: {},
    checks: [],
  }),

  Editor({ def, onChange }) {
    const [mode, setMode] = useState<Mode>("given");
    const set = (patch: Partial<SpreadsheetDef>) => onChange({ ...def, ...patch });
    const setIn = (rec: Record<string, string>, a: string, v: string) => {
      const next = { ...rec };
      if (v === "") delete next[a];
      else next[a] = v;
      return next;
    };
    const toggleInput = (a: string) => {
      const on = def.inputs.includes(a);
      set({
        inputs: on ? def.inputs.filter((x) => x !== a) : [...def.inputs, a],
        solution: on ? setIn(def.solution, a, "") : def.solution,
      });
    };
    const setCheck = (id: string, patch: Partial<SpreadsheetDef["checks"][number]>) =>
      set({ checks: def.checks.map((c) => (c.id === id ? { ...c, ...patch } : c)) });

    return (
      <div className="grid gap-5">
        <Field label="Question">
          <Textarea value={def.stem} onChange={(e) => set({ stem: e.target.value })} />
        </Field>

        <div className="flex flex-wrap gap-4">
          <Field label="Rows">
            <Input className="w-24" type="number" min={1} max={MAX_ROWS} value={def.rows} onChange={(e) => set({ rows: Math.min(MAX_ROWS, Math.max(1, Math.floor(Number(e.target.value)) || 1)) })} />
          </Field>
          <Field label="Columns">
            <Input className="w-24" type="number" min={1} max={MAX_COLS} value={def.cols} onChange={(e) => set({ cols: Math.min(MAX_COLS, Math.max(1, Math.floor(Number(e.target.value)) || 1)) })} />
          </Field>
        </div>

        <div className="grid gap-2">
          <ButtonTabs label="What you are editing" value={mode} onChange={setMode} options={MODES.map((m) => ({ value: m.id, label: m.label }))} />
          <p className="text-xs text-muted-foreground">{MODES.find((m) => m.id === mode)!.hint}</p>
          <Grid
            rows={def.rows}
            cols={def.cols}
            cell={(a) => {
              const isInput = def.inputs.includes(a);
              if (mode === "student") {
                return (
                  <button
                    type="button"
                    aria-pressed={isInput}
                    aria-label={`${a}${isInput ? ", student cell" : ""}`}
                    onClick={() => toggleInput(a)}
                    className="h-8 w-full truncate px-2 text-left text-sm aria-pressed:bg-muted aria-pressed:font-medium"
                  >
                    {def.cells[a] ?? ""}
                    {isInput && !def.cells[a] ? <span className="text-xs text-brand">student</span> : null}
                  </button>
                );
              }
              if (mode === "solution") {
                return isInput ? (
                  <Input className={`${cellInput} bg-muted font-mono`} aria-label={`Solution for ${a}`} value={def.solution[a] ?? ""} onChange={(e) => set({ solution: setIn(def.solution, a, e.target.value) })} />
                ) : (
                  <span className="block h-8 truncate px-2 py-1.5 text-muted-foreground">{def.cells[a] ?? ""}</span>
                );
              }
              return (
                <Input
                  className={`${cellInput} ${isInput ? "bg-muted" : ""} font-mono`}
                  aria-label={`Given ${a}`}
                  value={def.cells[a] ?? ""}
                  onChange={(e) => set({ cells: setIn(def.cells, a, e.target.value) })}
                />
              );
            }}
          />
        </div>

        <div className="grid gap-2">
          <span className="text-sm font-medium">What is graded</span>
          <p className="text-xs text-muted-foreground">
            Each check compares one cell with the same cell under your model solution. Tick “must be a formula” to reject a number typed in by hand.
          </p>
          {def.checks.map((c, i) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2">
              <Input className="w-20 font-mono uppercase" aria-label={`Check ${i + 1} cell`} value={c.cell} onChange={(e) => setCheck(c.id, { cell: e.target.value.toUpperCase() })} />
              <Input className="min-w-40 flex-1" aria-label={`Check ${i + 1} label`} placeholder="What is this checking?" value={c.label} onChange={(e) => setCheck(c.id, { label: e.target.value })} />
              <Input
                className="w-24"
                type="number"
                step="any"
                min={0}
                aria-label={`Check ${i + 1} allowed error`}
                title="Allowed error"
                placeholder="± error"
                value={c.abs ?? ""}
                onChange={(e) => setCheck(c.id, { abs: e.target.value === "" ? undefined : Number(e.target.value) })}
              />
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" className="accent-foreground" checked={c.requireFormula} onChange={(e) => setCheck(c.id, { requireFormula: e.target.checked })} />
                must be a formula
              </label>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove check ${i + 1}`} onClick={() => set({ checks: def.checks.filter((x) => x.id !== c.id) })}>
                <X />
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                let n = def.checks.length + 1;
                const taken = new Set(def.checks.map((c) => c.id));
                while (taken.has(`k${n}`)) n++;
                set({ checks: [...def.checks, { id: `k${n}`, cell: def.inputs[0] ?? "", label: "", requireFormula: false }] });
              }}
            >
              <Plus /> Add check
            </Button>
            {def.inputs.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  const have = new Set(def.checks.map((c) => c.cell));
                  set({
                    checks: [
                      ...def.checks,
                      ...def.inputs.filter((a) => !have.has(a)).map((a) => ({ id: `k-${a}`, cell: a, label: `Cell ${a}`, requireFormula: false })),
                    ],
                  });
                }}
              >
                Check every student cell
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  },

  Renderer({ instance, value, onChange, readOnly }) {
    const entries = useMemo(() => value?.cells ?? {}, [value]);
    // Given formulas recalculate as the student types, so they see the effect of their work.
    const shown = useMemo(() => {
      const raw: Record<string, string> = { ...instance.cells };
      for (const a of instance.inputs) {
        if ((entries[a] ?? "").trim() === "") delete raw[a];
        else raw[a] = entries[a];
      }
      return evaluateSheet(instance.rows, instance.cols, raw).values;
    }, [instance, entries]);

    return (
      <div className="grid gap-4">
        <p className="whitespace-pre-wrap text-base">{instance.stem}</p>
        <Grid
          rows={instance.rows}
          cols={instance.cols}
          cell={(a) =>
            instance.inputs.includes(a) ? (
              <Input
                className={`${cellInput} bg-muted font-mono`}
                aria-label={`Cell ${a}`}
                autoComplete="off"
                spellCheck={false}
                value={entries[a] ?? ""}
                readOnly={readOnly}
                onChange={(e) => onChange?.({ cells: { ...entries, [a]: e.target.value } })}
              />
            ) : (
              <span className="block h-8 truncate px-2 py-1.5">{a in shown ? showValue(shown[a]) : ""}</span>
            )
          }
        />
        <p className="text-xs text-muted-foreground">Shaded cells are yours to fill in. Start a formula with =.</p>
      </div>
    );
  },
};
