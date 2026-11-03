"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { QuestionTypeUi } from "../ui-types";
import type { NumericDef, NumericInstance, NumericResponse } from "./core";

type StudentInstance = Pick<NumericInstance, "stem">;
type Variable = NumericDef["variables"][number];

const num = (v: string, fallback: number) => (v.trim() === "" || Number.isNaN(Number(v)) ? fallback : Number(v));

function blank(kind: Variable["kind"], name: string): Variable {
  if (kind === "int") return { kind, name, min: 1, max: 9 };
  if (kind === "float") return { kind, name, min: 1, max: 10, decimals: 1 };
  return { kind, name, options: ["", ""] };
}

export const numericUi: QuestionTypeUi<NumericDef, StudentInstance, NumericResponse> = {
  id: "numeric",
  description: "A number question with random values per student. The answer is a formula, graded within a tolerance.",

  newDef: () => ({
    stem: "",
    variables: [blank("int", "a"), blank("int", "b")],
    constraints: [],
    answer: "",
    tolerance: {},
  }),

  Editor({ def, onChange }) {
    const set = (patch: Partial<NumericDef>) => onChange({ ...def, ...patch });
    const setVar = (i: number, v: Variable) => set({ variables: def.variables.map((x, j) => (j === i ? v : x)) });

    return (
      <div className="grid gap-5">
        <Field label="Question" hint="Use {name} where a variable's value should appear, e.g. “{n} notebooks at ${price} each”.">
          <Textarea value={def.stem} onChange={(e) => set({ stem: e.target.value })} />
        </Field>

        <div className="grid gap-2">
          <span className="text-sm font-medium">Variables</span>
          <p className="text-xs text-muted-foreground">Each student gets their own random values. The Variants tab shows 20 of them.</p>
          {def.variables.map((v, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
              <Input className="w-20 font-mono" value={v.name} aria-label={`Variable ${i + 1} name`} onChange={(e) => setVar(i, { ...v, name: e.target.value })} />
              <Select
                className="w-32"
                aria-label={`Variable ${i + 1} type`}
                value={v.kind}
                onChange={(e) => setVar(i, blank(e.target.value as Variable["kind"], v.name))}
              >
                <option value="int">Whole number</option>
                <option value="float">Decimal</option>
                <option value="pick">Pick from list</option>
              </Select>
              {v.kind !== "pick" ? (
                <>
                  <Input className="w-20" type="number" aria-label="Minimum" value={v.min} onChange={(e) => setVar(i, { ...v, min: num(e.target.value, v.min) })} />
                  <span className="text-sm text-muted-foreground">to</span>
                  <Input className="w-20" type="number" aria-label="Maximum" value={v.max} onChange={(e) => setVar(i, { ...v, max: num(e.target.value, v.max) })} />
                  {v.kind === "float" && (
                    <Input
                      className="w-24"
                      type="number"
                      min={0}
                      max={8}
                      aria-label="Decimal places"
                      title="Decimal places"
                      value={v.decimals}
                      onChange={(e) => setVar(i, { ...v, decimals: Math.min(8, Math.max(0, Math.floor(num(e.target.value, v.decimals)))) })}
                    />
                  )}
                </>
              ) : (
                <Input
                  className="min-w-48 flex-1"
                  aria-label="Options, comma-separated"
                  placeholder="Options, comma-separated"
                  value={v.options.join(", ")}
                  onChange={(e) => setVar(i, { ...v, options: e.target.value.split(",").map((o) => o.trim()) })}
                />
              )}
              <Button type="button" variant="ghost" size="icon-sm" className="ml-auto" aria-label={`Remove variable ${i + 1}`} onClick={() => set({ variables: def.variables.filter((_, j) => j !== i) })}>
                <X />
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => set({ variables: [...def.variables, blank("int", String.fromCharCode(97 + def.variables.length))] })}
            >
              <Plus /> Add variable
            </Button>
          </div>
        </div>

        <Field label="Answer formula" hint="Use the variable names, e.g. n * price or sqrt(a^2 + b^2). Functions like round(), sqrt() and abs() work.">
          <Input className="font-mono" value={def.answer} onChange={(e) => set({ answer: e.target.value })} />
        </Field>

        <Field
          label="Constraints (optional)"
          hint={
            <>
              One per line. Draws that break any of them are thrown away. Examples: <code>b != a</code>, <code>a * b &lt; 100</code>,{" "}
              <code>answer == round(answer)</code> (answer must be whole).
            </>
          }
        >
          <Textarea
            className="min-h-16 font-mono"
            value={def.constraints.join("\n")}
            onChange={(e) => set({ constraints: e.target.value === "" ? [] : e.target.value.split("\n") })}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Allowed error (absolute)" hint="Blank = exact.">
            <Input
              type="number"
              step="any"
              min={0}
              value={def.tolerance.abs ?? ""}
              onChange={(e) => set({ tolerance: { ...def.tolerance, abs: e.target.value === "" ? undefined : Number(e.target.value) } })}
            />
          </Field>
          <Field label="Allowed error (%)">
            <Input
              type="number"
              step="any"
              min={0}
              value={def.tolerance.rel === undefined ? "" : def.tolerance.rel * 100}
              onChange={(e) => set({ tolerance: { ...def.tolerance, rel: e.target.value === "" ? undefined : Number(e.target.value) / 100 } })}
            />
          </Field>
          <Field label="Units (optional)" hint="Comma-separated. Students must include one.">
            <Input
              value={(def.units ?? []).join(", ")}
              onChange={(e) => {
                const units = e.target.value.split(",").map((u) => u.trim()).filter(Boolean);
                set({ units: units.length ? units : undefined });
              }}
            />
          </Field>
        </div>
      </div>
    );
  },

  Renderer({ instance, value, onChange, readOnly }) {
    return (
      <div className="grid gap-4">
        <p className="whitespace-pre-wrap text-base">{instance.stem}</p>
        <Input
          aria-label="Your answer"
          autoComplete="off"
          inputMode="decimal"
          placeholder="Type your answer"
          value={value?.text ?? ""}
          readOnly={readOnly}
          onChange={(e) => onChange?.({ text: e.target.value })}
        />
      </div>
    );
  },
};
