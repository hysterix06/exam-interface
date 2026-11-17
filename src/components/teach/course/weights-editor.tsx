"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveCategoriesAction, setItemCategoryAction } from "@/app/teach/courses/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusText } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtNum } from "@/engine/grading/format";

type Row = { id?: string; name: string; weight: string; dropLowest: string };

/** The course's grade categories and their weights; the total is checked as you type. */
export function WeightsEditor({ courseId, initial }: { courseId: string; initial: { id: string; name: string; weight: number; dropLowest: number }[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initial.map((c) => ({ id: c.id, name: c.name, weight: String(c.weight), dropLowest: String(c.dropLowest) })));
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const total = rows.reduce((s, r) => s + (Number(r.weight) || 0), 0);
  const edit = (i: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setMsg(null);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveCategoriesAction(
            courseId,
            rows.map((x) => ({ id: x.id, name: x.name, weight: Number(x.weight), dropLowest: Number(x.dropLowest) || 0 })),
          );
          setMsg(r.ok ? { ok: true, text: "Saved. Course grades use the new weights now." } : { ok: false, text: r.error });
          if (r.ok) router.refresh();
        });
      }}
    >
      <Table>
        <THead>
          <TR>
            <TH>Category</TH>
            <TH className="w-28">Weight %</TH>
            <TH className="w-28">Drop lowest</TH>
            <TH className="w-12">
              <span className="sr-only">Remove</span>
            </TH>
          </TR>
        </THead>
        <tbody>
          {rows.map((r, i) => (
            <TR key={r.id ?? `new-${i}`}>
              <TD>
                <Input aria-label="Category name" value={r.name} onChange={(e) => edit(i, { name: e.target.value })} placeholder="Homework" />
              </TD>
              <TD>
                <Input aria-label="Weight" inputMode="decimal" value={r.weight} onChange={(e) => edit(i, { weight: e.target.value })} />
              </TD>
              <TD>
                <Input aria-label="Drop lowest" inputMode="numeric" value={r.dropLowest} onChange={(e) => edit(i, { dropLowest: e.target.value })} />
              </TD>
              <TD>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${r.name || "category"}`} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                  <X />
                </Button>
              </TD>
            </TR>
          ))}
          <TR>
            <TD className="font-medium">Total</TD>
            <TD className={total === 100 ? "tabular-nums" : "text-warning tabular-nums"}>{fmtNum(total)}%</TD>
            <TD colSpan={2} className="text-xs text-muted-foreground">
              {rows.length === 0 ? "No categories: every graded item counts by its points." : total === 100 ? "Adds up to 100%." : "Doesn’t add up to 100%: weights are used relative to each other."}
            </TD>
          </TR>
        </tbody>
      </Table>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, { name: "", weight: "0", dropLowest: "0" }])}>
          <Plus /> Add category
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save weights"}
        </Button>
        {msg && <StatusText ok={msg.ok}>{msg.text}</StatusText>}
      </div>
    </form>
  );
}

/** Which category an exam or assignment counts in; saves on change. */
export function CategoryPicker({
  item,
  categories,
}: {
  item: { kind: "exam" | "assignment"; id: string; title: string; categoryId: string | null };
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(item.categoryId ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <Select
        aria-label={`Category for ${item.title}`}
        value={value}
        disabled={pending}
        className="w-48"
        onChange={(e) => {
          const next = e.target.value;
          const prev = value;
          setValue(next);
          start(async () => {
            const r = await setItemCategoryAction({ kind: item.kind, id: item.id, categoryId: next || null });
            if (!r.ok) {
              setValue(prev);
              setError(r.error);
            } else {
              setError(null);
              router.refresh();
            }
          });
        }}
      >
        <option value="">Not counted</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
      {error && <StatusText ok={false}>{error}</StatusText>}
    </div>
  );
}
