"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { TextVars } from "@/engine/generate";

const EMPTY: TextVars = { table: [], lists: [] };

/** Column order: as first typed, across all rows. */
function columnsOf(tv: TextVars) {
  return [...new Set(tv.table.flatMap((r) => Object.keys(r)))];
}

function nextName(taken: string[], base: string) {
  for (let i = 1; ; i++) {
    const n = i === 1 ? base : `${base}${i}`;
    if (!taken.includes(n)) return n;
  }
}

/**
 * Wording variants for any question type: a table where each student gets one
 * row (so a name and its pronoun stay together), and lists drawn on their own.
 * Written into the question as [[name]].
 */
export function WordingVariants({ value, onChange }: { value: TextVars | null; onChange: (tv: TextVars | null) => void }) {
  const tv = value ?? EMPTY;
  const cols = columnsOf(tv);
  const set = (next: TextVars) => onChange(next.table.length || next.lists.length ? next : null);

  const setCell = (r: number, col: string, v: string) => set({ ...tv, table: tv.table.map((row, i) => (i === r ? { ...row, [col]: v } : row)) });
  const renameCol = (from: string, to: string) =>
    set({ ...tv, table: tv.table.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k === from ? to : k, v]))) });
  const addCol = () => {
    const name = nextName([...cols, ...tv.lists.map((l) => l.name)], "name");
    const table = tv.table.length ? tv.table : [{}];
    set({ ...tv, table: table.map((row) => ({ ...row, [name]: "" })) });
  };
  const removeCol = (col: string) => {
    const table = tv.table.map((row) => Object.fromEntries(Object.entries(row).filter(([k]) => k !== col)));
    set({ ...tv, table: table.some((r) => Object.keys(r).length) ? table : [] });
  };
  const addRow = () => set({ ...tv, table: [...tv.table, Object.fromEntries(cols.map((c) => [c, ""]))] });
  const removeRow = (r: number) => set({ ...tv, table: tv.table.filter((_, i) => i !== r) });

  const setList = (i: number, patch: Partial<TextVars["lists"][number]>) => set({ ...tv, lists: tv.lists.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const addList = () => set({ ...tv, lists: [...tv.lists, { name: nextName([...cols, ...tv.lists.map((l) => l.name)], "word"), options: [] }] });

  return (
    <details className="rounded-lg border p-4" open={value !== null}>
      <summary className="cursor-pointer text-sm font-medium">Wording variants (optional)</summary>
      <p className="mt-2 text-xs text-muted-foreground">
        Give each student different names, places or contexts. Write <code>[[name]]</code> anywhere in the question
        (stem, options, answers) and it is replaced per student. Each student gets one row of the table, so values on a
        row stay together; each list is drawn on its own. The variant explorer shows them side by side.
      </p>

      <div className="mt-4 grid gap-2">
        <span className="text-sm font-medium">Table</span>
        {cols.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-sm">
              <thead>
                <tr>
                  {cols.map((c) => (
                    <th key={c} className="min-w-32 font-normal">
                      <div className="flex items-center gap-1">
                        <Input value={c} aria-label={`Name of column ${c}`} className="font-mono" onChange={(e) => renameCol(c, e.target.value.replace(/[^A-Za-z0-9_]/g, ""))} />
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove column ${c}`} onClick={() => removeCol(c)}>
                          <X />
                        </Button>
                      </div>
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {tv.table.map((row, r) => (
                  <tr key={r}>
                    {cols.map((c) => (
                      <td key={c}>
                        <Input value={row[c] ?? ""} aria-label={`Row ${r + 1}, ${c}`} onChange={(e) => setCell(r, c, e.target.value)} />
                      </td>
                    ))}
                    <td>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove row ${r + 1}`} onClick={() => removeRow(r)}>
                        <X />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addCol}>
            <Plus /> Column
          </Button>
          {cols.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              <Plus /> Row
            </Button>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        <span className="text-sm font-medium">Lists</span>
        {tv.lists.map((l, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
            <Input value={l.name} aria-label={`List ${i + 1} name`} className="font-mono" onChange={(e) => setList(i, { name: e.target.value.replace(/[^A-Za-z0-9_]/g, "") })} />
            <Textarea
              rows={2}
              value={l.options.join("\n")}
              aria-label={`List ${l.name} options, one per line`}
              placeholder="One option per line"
              onChange={(e) => setList(i, { options: e.target.value.split("\n") })}
            />
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove list ${l.name}`} onClick={() => set({ ...tv, lists: tv.lists.filter((_, j) => j !== i) })}>
              <X />
            </Button>
          </div>
        ))}
        <div>
          <Button type="button" variant="outline" size="sm" onClick={addList}>
            <Plus /> List
          </Button>
        </div>
      </div>
    </details>
  );
}
