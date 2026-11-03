"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { addExtensionAction, liveAction } from "@/app/admin/exams/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { fmtNum } from "@/engine/grading/format";
import type { loadLive } from "@/server/admin/data";

type Live = NonNullable<Awaited<ReturnType<typeof loadLive>>>;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const ago = (iso: string | null, now: number) => {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
};

/** Who is in the exam right now. Polls every few seconds; the server is the source of truth. */
export function LiveBoard({ initial }: { initial: Live }) {
  const [data, setData] = useState(initial);
  const [now, setNow] = useState(() => Date.parse(initial.now));
  const offset = useRef(0);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    offset.current = Date.parse(initial.now) - Date.now();
    const tick = setInterval(() => setNow(Date.now() + offset.current), 1000);
    const poll = setInterval(async () => {
      const fresh = await liveAction(initial.exam.id);
      if (fresh) {
        setData(fresh);
        offset.current = Date.parse(fresh.now) - Date.now();
      }
    }, 5000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [initial]);

  const inProgress = data.attempts.filter((a) => a.state === "in_progress");

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        {inProgress.length} in progress · {data.attempts.length - inProgress.length} finished · updates every 5 seconds
      </p>
      {data.attempts.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">No one has started yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Student</th>
                <th className="px-3 py-2 font-medium">Progress</th>
                <th className="px-3 py-2 font-medium">Time left</th>
                <th className="px-3 py-2 font-medium">Last saved</th>
                <th className="px-3 py-2 font-medium" title="Tab switches and pastes. Signals only: nothing is enforced.">
                  Signals
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.attempts.map((a) => {
                const left = a.deadlineAt ? Math.max(0, Math.round((Date.parse(a.deadlineAt) - now) / 1000)) : null;
                return (
                  <tr key={a.id} className="border-t align-top">
                    <td className="px-3 py-2">
                      {a.name ?? a.email}
                      {a.state !== "in_progress" && (
                        <Badge className="ml-2" tone="neutral">
                          {a.state === "graded" ? `${fmtNum(a.score ?? 0)}/${fmtNum(a.maxScore ?? 0)}` : a.state}
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 rounded-full bg-muted" role="img" aria-label={`${a.answered} of ${a.total} answered`}>
                          <div className="h-full rounded-full bg-foreground/70" style={{ width: `${a.total ? (a.answered / a.total) * 100 : 0}%` }} />
                        </div>
                        <span className="tabular-nums text-muted-foreground">
                          {a.answered}/{a.total}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 tabular-nums">{a.state === "in_progress" ? (left === null ? "untimed" : clock(left)) : "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{a.state === "in_progress" ? ago(a.lastSaved, now) : ""}</td>
                    <td className="px-3 py-2 text-muted-foreground tabular-nums">
                      {a.blurs} blur · {a.pastes} paste
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="xs" onClick={() => setOpen(open === a.id ? null : a.id)}>
                        Add time
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {open && (
        <ExtensionForm
          key={open}
          examId={data.exam.id}
          attempt={data.attempts.find((a) => a.id === open)!}
          onDone={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function ExtensionForm({
  examId,
  attempt,
  onDone,
}: {
  examId: string;
  attempt: Live["attempts"][number];
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<"multiplier" | "minutes">("minutes");
  const [value, setValue] = useState("10");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[auto_8rem_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addExtensionAction({ examId, userId: attempt.userId, kind, value: Number(value), reason });
          if (!r.ok) return setError(r.error);
          onDone();
        });
      }}
    >
      <p className="text-sm font-medium sm:col-span-4">Extra time for {attempt.name ?? attempt.email}</p>
      <Select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Kind">
        <option value="minutes">Extra minutes</option>
        <option value="multiplier">Time multiplier (e.g. 1.25)</option>
      </Select>
      <Input type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Amount" />
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (recorded in the audit log)" aria-label="Reason" />
      <Button type="submit" disabled={pending}>
        Grant
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive sm:col-span-4">
          {error}
        </p>
      )}
    </form>
  );
}
