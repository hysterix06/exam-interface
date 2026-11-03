import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { fmtNum } from "@/engine/grading/format";
import { requireRole } from "@/server/auth";
import { loadAnalysis } from "@/server/admin/analysis";

export default async function AnalysisPage({ params }: PageProps<"/admin/exams/[id]/analysis">) {
  const user = await requireRole("admin", "instructor");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const a = await loadAnalysis(user.orgId, id);
  if (!a) notFound();

  return (
    <>
      <Link href={`/admin/exams/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
        ← Exam
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Item analysis</h1>
      <p className="mt-2 mb-6 max-w-prose text-sm text-muted-foreground">
        How each question performed across {a.students} graded {a.students === 1 ? "student" : "students"}. Questions that may need attention come first.
      </p>

      {a.questions.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">No graded attempts yet.</div>
      ) : (
        <ul className="grid gap-4">
          {a.questions.map((q) => (
            <li key={q.questionId} className="rounded-lg border p-4">
              <p className="font-medium">{q.label}</p>
              <dl className="mt-2 flex flex-wrap gap-x-8 gap-y-1 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground" title="Average share of the available points earned">Percent correct</dt>
                  <dd className="tabular-nums">{Math.round(q.difficulty * 100)}%</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground" title="Correlation with the rest of the exam, −1 to 1. Above 0.3 is good.">Discrimination</dt>
                  <dd className="tabular-nums">{q.discrimination === null ? "n/a" : fmtNum(q.discrimination)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Answered</dt>
                  <dd className="tabular-nums">{q.n}</dd>
                </div>
              </dl>
              {q.flags.length > 0 && (
                <ul className="mt-3 grid gap-1 text-sm">
                  {q.flags.map((f) => (
                    <li key={f.code} className="flex items-start gap-2">
                      <Badge tone={f.code === "small-sample" ? "neutral" : f.code === "negative-discrimination" ? "danger" : "warning"}>{f.code.replace(/-/g, " ")}</Badge>
                      <span>{f.message}</span>
                    </li>
                  ))}
                </ul>
              )}
              {q.distractors.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium">Which options students chose</summary>
                  <table className="mt-2 w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="py-1 font-medium">Option</th>
                        <th className="py-1 text-right font-medium">All</th>
                        <th className="py-1 text-right font-medium">Top 27%</th>
                        <th className="py-1 text-right font-medium">Bottom 27%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {q.distractors.map((d) => (
                        <tr key={d.optionId} className="border-t">
                          <td className="py-1">
                            {q.optionText[d.optionId] ?? d.optionId}
                            {q.keyIds.includes(d.optionId) && <Badge tone="success" className="ml-2">correct</Badge>}
                          </td>
                          <td className="py-1 text-right tabular-nums">{Math.round(d.share * 100)}%</td>
                          <td className="py-1 text-right tabular-nums">{Math.round(d.upperShare * 100)}%</td>
                          <td className="py-1 text-right tabular-nums">{Math.round(d.lowerShare * 100)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
