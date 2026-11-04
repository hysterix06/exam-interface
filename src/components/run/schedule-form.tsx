"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setScheduleAction } from "@/app/teach/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// <input type="datetime-local"> works in local time without a zone.
const toLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function ScheduleForm({ examId, opensAt, closesAt }: { examId: string; opensAt: string | null; closesAt: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [opens, setOpens] = useState(toLocal(opensAt));
  const [closes, setCloses] = useState(toLocal(closesAt));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <form
      className="grid max-w-2xl gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await setScheduleAction({
            examId,
            opensAt: opens ? new Date(opens).toISOString() : null,
            closesAt: closes ? new Date(closes).toISOString() : null,
          });
          setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
          if (r.ok) router.refresh();
        });
      }}
    >
      <Field label="Opens">
        <Input type="datetime-local" value={opens} onChange={(e) => setOpens(e.target.value)} />
      </Field>
      <Field label="Closes">
        <Input type="datetime-local" value={closes} onChange={(e) => setCloses(e.target.value)} />
      </Field>
      <Button type="submit" variant="outline" disabled={pending}>
        Save window
      </Button>
      <p className="text-xs text-muted-foreground sm:col-span-3">
        At the close, anyone still in the exam is submitted with what they’ve saved.
        {msg && (
          <span role="status" className={`ml-2 ${msg.ok ? "text-muted-foreground" : "text-destructive"}`}>
            {msg.text}
          </span>
        )}
      </p>
    </form>
  );
}
