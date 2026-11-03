"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { applyRegradeAction, previewRegradeAction } from "@/app/admin/exams/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { fmtNum } from "@/engine/grading/format";
import type { RegradePreview } from "@/server/admin/regrade";

interface Q {
  questionId: string;
  label: string;
  currentVersion: number;
  versions: { version: number; label: string }[];
}

/** Preview first, apply second: nothing is written until you have seen who changes. */
export function RegradeTool({ examId, questions, names }: { examId: string; questions: Q[]; names: Record<string, string> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [questionId, setQuestionId] = useState(questions[0]?.questionId ?? "");
  const q = questions.find((x) => x.questionId === questionId);
  const [version, setVersion] = useState(String(q?.currentVersion ?? ""));
  const [preview, setPreview] = useState<RegradePreview | null>(null);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  if (questions.length === 0) {
    return <p className="text-sm text-muted-foreground">No machine-graded answers to regrade yet.</p>;
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Question</span>
          <Select
            value={questionId}
            onChange={(e) => {
              setQuestionId(e.target.value);
              setVersion(String(questions.find((x) => x.questionId === e.target.value)?.currentVersion ?? ""));
              setPreview(null);
            }}
          >
            {questions.map((x) => (
              <option key={x.questionId} value={x.questionId}>
                {x.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Regrade against version</span>
          <Select
            value={version}
            onChange={(e) => {
              setVersion(e.target.value);
              setPreview(null);
            }}
          >
            {q?.versions.map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version}
                {v.version === q.currentVersion ? " (current)" : ""} · {v.label}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <p className="-mt-3 text-xs text-muted-foreground">
        Each student keeps the options and values they were shown. Their saved answer is graded against the chosen version&apos;s key.
      </p>

      <div>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setMsg(null);
              setPreview(await previewRegradeAction(examId, questionId, Number(version)));
            })
          }
        >
          Preview changes
        </Button>
      </div>

      {preview && !preview.ok && (
        <p role="alert" className="text-sm text-destructive">
          {preview.error}
        </p>
      )}

      {preview?.ok && (
        <section className="grid gap-4">
          <p className="text-sm">
            {preview.changed === 0
              ? `No scores would change (${preview.total} answers checked).`
              : `${preview.changed} of ${preview.total} scores would change.`}
          </p>
          {preview.changed > 0 && (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Student</th>
                    <th className="px-3 py-2 text-right font-medium">Now</th>
                    <th className="px-3 py-2 text-right font-medium">After</th>
                    <th className="px-3 py-2 text-right font-medium">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.diffs
                    .filter((d) => d.delta !== 0)
                    .map((d) => (
                      <tr key={d.attemptId} className="border-t">
                        <td className="px-3 py-2">{names[d.attemptId]}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(d.oldScore)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtNum(d.newScore)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${d.delta > 0 ? "text-success" : "text-destructive"}`}>
                          {d.delta > 0 ? "+" : ""}
                          {fmtNum(d.delta)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
          {preview.changed > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Input className="max-w-sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (recorded in the audit log)" aria-label="Reason" />
              <Button
                disabled={pending || !reason.trim()}
                onClick={() =>
                  start(async () => {
                    const r = await applyRegradeAction({ examId, questionId, targetVersion: Number(version), reason });
                    setMsg(r.ok ? { ok: true, text: `Regraded. ${r.changed} scores updated.` } : { ok: false, text: r.error });
                    if (r.ok) {
                      setPreview(null);
                      setReason("");
                      router.refresh();
                    }
                  })
                }
              >
                Apply regrade
              </Button>
            </div>
          )}
        </section>
      )}
      {msg && (
        <p role="status" className={`text-sm ${msg.ok ? "text-success" : "text-destructive"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
