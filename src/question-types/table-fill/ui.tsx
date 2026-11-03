"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { QuestionTypeUi } from "../ui-types";
import type { TableFillDef, TableFillResponse } from "./core";

type StudentSegment =
  | { kind: "lit"; text: string }
  | { kind: "text" | "num"; id: string }
  | { kind: "select"; id: string; options: string[] };
type StudentInstance = { stem: string; columns: string[]; rows: StudentSegment[][][] };

export const tableFillUi: QuestionTypeUi<TableFillDef, StudentInstance, TableFillResponse> = {
  id: "table-fill",
  description: "A grid where some cells are given and others are blanks. Each blank is graded on its own.",

  newDef: () => ({
    stem: "",
    columns: ["", ""],
    rows: [
      ["", ""],
      ["", ""],
    ],
  }),

  Editor({ def, onChange }) {
    const set = (patch: Partial<TableFillDef>) => onChange({ ...def, ...patch });
    const setCell = (r: number, c: number, v: string) =>
      set({ rows: def.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });

    return (
      <div className="grid gap-5">
        <Field label="Question">
          <Textarea value={def.stem} onChange={(e) => set({ stem: e.target.value })} />
        </Field>

        <div className="grid gap-2">
          <span className="text-sm font-medium">Table</span>
          <p className="text-xs text-muted-foreground">
            Plain text is shown to the student. Make a cell a blank with <code>{"{{num:5}}"}</code>, <code>{"{{text:Paris|paris}}"}</code> or{" "}
            <code>{"{{select:a|b*|c}}"}</code>.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-sm">
              <thead>
                <tr>
                  {def.columns.map((c, j) => (
                    <th key={j} className="font-normal">
                      <div className="flex gap-1">
                        <Input
                          className="font-medium"
                          placeholder={`Column ${j + 1}`}
                          aria-label={`Column ${j + 1} heading`}
                          value={c}
                          onChange={(e) => set({ columns: def.columns.map((x, k) => (k === j ? e.target.value : x)) })}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove column ${j + 1}`}
                          onClick={() => set({ columns: def.columns.filter((_, k) => k !== j), rows: def.rows.map((row) => row.filter((_, k) => k !== j)) })}
                        >
                          <X />
                        </Button>
                      </div>
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {def.rows.map((row, r) => (
                  <tr key={r}>
                    {def.columns.map((_, c) => (
                      <td key={c}>
                        <Input
                          className="font-mono"
                          aria-label={`Row ${r + 1}, column ${c + 1}`}
                          value={row[c] ?? ""}
                          onChange={(e) => setCell(r, c, e.target.value)}
                        />
                      </td>
                    ))}
                    <td>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove row ${r + 1}`} onClick={() => set({ rows: def.rows.filter((_, i) => i !== r) })}>
                        <X />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => set({ rows: [...def.rows, def.columns.map(() => "")] })}>
              <Plus /> Add row
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => set({ columns: [...def.columns, ""], rows: def.rows.map((row) => [...row, ""]) })}>
              <Plus /> Add column
            </Button>
          </div>
        </div>
      </div>
    );
  },

  Renderer({ instance, value, onChange, readOnly }) {
    const blanks = value?.blanks ?? {};
    const set = (id: string, v: string) => onChange?.({ blanks: { ...blanks, [id]: v } });
    return (
      <div className="grid gap-4">
        <p className="whitespace-pre-wrap text-base">{instance.stem}</p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {instance.columns.map((c, j) => (
                  <th key={j} scope="col" className="border-b px-2 py-2 text-left font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {instance.rows.map((row, r) => (
                <tr key={r} className="border-b">
                  {row.map((cell, c) => (
                    <td key={c} className="px-2 py-1.5">
                      {cell.map((s, i) =>
                        s.kind === "lit" ? (
                          <span key={i}>{s.text}</span>
                        ) : s.kind === "select" ? (
                          <Select
                            key={i}
                            aria-label={`Row ${r + 1}, ${instance.columns[c] || `column ${c + 1}`}`}
                            className="inline-block h-8 w-auto min-w-28"
                            value={blanks[s.id] ?? ""}
                            disabled={readOnly}
                            onChange={(e) => set(s.id, e.target.value)}
                          >
                            <option value="" disabled>
                              Choose…
                            </option>
                            {s.options.map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <Input
                            key={i}
                            aria-label={`Row ${r + 1}, ${instance.columns[c] || `column ${c + 1}`}`}
                            autoComplete="off"
                            inputMode={s.kind === "num" ? "decimal" : undefined}
                            className="inline-block h-8 w-28"
                            value={blanks[s.id] ?? ""}
                            readOnly={readOnly}
                            onChange={(e) => set(s.id, e.target.value)}
                          />
                        ),
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  },
};
