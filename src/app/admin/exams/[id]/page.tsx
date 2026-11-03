import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { RunControls } from "@/components/authoring/exam-builder/run-controls";
import { examSettingsSchema } from "@/engine/exam";
import { ScheduleForm } from "@/components/admin/schedule-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { STATE_LABELS } from "@/engine/exam-state";
import { fmtNum } from "@/engine/grading/format";
import { requireRole } from "@/server/auth";
import { listExamAttempts } from "@/server/admin/data";
import { getExam } from "@/server/authoring/data";

export default async function AdminExamPage({ params }: PageProps<"/admin/exams/[id]">) {
  const user = await requireRole("admin", "instructor");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const exam = await getExam(user.orgId, id);
  if (!exam) notFound();
  const rows = await listExamAttempts(user.orgId, id);

  return (
    <>
      <Link href="/admin/exams" className="text-sm text-muted-foreground hover:text-foreground">
        ← Run exams
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{exam.title}</h1>
        <Badge tone={exam.state === "open" ? "success" : "neutral"}>{STATE_LABELS[exam.state]}</Badge>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href={`/admin/exams/${id}/live`}>Live view</Link></Button>
          <Button asChild variant="outline"><Link href={`/admin/exams/${id}/analysis`}>Item analysis</Link></Button>
          <Button asChild variant="outline"><Link href={`/admin/exams/${id}/regrade`}>Regrade</Link></Button>
          <Button asChild variant="outline"><Link href={`/admin/review/${id}`}>Marking queue</Link></Button>
          <Button asChild variant="outline"><a href={`/admin/exams/${id}/export`}>Export CSV</a></Button>
          <Button asChild variant="outline"><Link href={`/author/exams/${id}`}>Open in builder</Link></Button>
        </div>
      </div>

      <section className="mt-8">
        <h2 className="mb-2 font-medium">Status</h2>
        <RunControls examId={id} state={exam.state} requireCode={examSettingsSchema.parse(exam.settings).requireCode} disabled={false} />
      </section>

      <section className="mt-8">
        <h2 className="mb-2 font-medium">Window</h2>
        <ScheduleForm examId={id} opensAt={exam.opensAt?.toISOString() ?? null} closesAt={exam.closesAt?.toISOString() ?? null} />
      </section>

      <section className="mt-8">
        <h2 className="mb-2 font-medium">Attempts</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No student has started this exam yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Student</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Score</th>
                  <th className="px-4 py-2 font-medium">Started</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-2">{r.name ?? r.email}</td>
                    <td className="px-4 py-2 text-muted-foreground">{r.state.replace("_", " ")}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {r.score !== null ? `${fmtNum(r.score)} / ${fmtNum(r.maxScore ?? 0)}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{r.startedAt.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right">
                      <Link href={`/admin/exams/${id}/attempts/${r.id}`} className="underline">
                        Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
