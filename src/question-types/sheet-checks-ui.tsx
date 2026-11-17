"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SheetCheck } from "@/engine/sheet-checks";

/** The graded cells of a spreadsheet or uploaded-workbook task. */
export function SheetChecksEditor({
  checks,
  onChange,
  defaultCell,
  children,
}: {
  checks: SheetCheck[];
  onChange: (checks: SheetCheck[]) => void;
  defaultCell: string;
  /** Extra buttons beside "Add check". */
  children?: React.ReactNode;
}) {
  const setCheck = (id: string, patch: Partial<SheetCheck>) => onChange(checks.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">What is graded</span>
      <p className="text-xs text-muted-foreground">
        Each check compares one cell with the same cell under your model solution. Tick “must be a formula” to reject a number typed in by hand, and name functions (e.g. SUM) the formula has to use.
      </p>
      {checks.map((c, i) => (
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
          <Input
            className="w-36 font-mono uppercase"
            aria-label={`Check ${i + 1} required functions`}
            title="Functions the formula must use, separated by commas"
            placeholder="must use, e.g. SUM"
            value={(c.functions ?? []).join(", ")}
            onChange={(e) => {
              const v = e.target.value.toUpperCase();
              // Empty entries are kept while typing ("SUM, ") and ignored when grading.
              setCheck(c.id, { functions: v.trim() === "" ? undefined : v.split(",").map((f) => f.trim()) });
            }}
          />
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove check ${i + 1}`} onClick={() => onChange(checks.filter((x) => x.id !== c.id))}>
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
            let n = checks.length + 1;
            const taken = new Set(checks.map((c) => c.id));
            while (taken.has(`k${n}`)) n++;
            onChange([...checks, { id: `k${n}`, cell: defaultCell, label: "", requireFormula: false }]);
          }}
        >
          <Plus /> Add check
        </Button>
        {children}
      </div>
    </div>
  );
}
