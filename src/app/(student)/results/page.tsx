import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { LocalTime } from "@/components/ui/local-time";
import { PageHeader } from "@/components/ui/page-header";
import { Row, RowList } from "@/components/ui/row-list";
import { fmtNum } from "@/engine/grading/format";
import { homeFor } from "@/lib/auth/roles";
import { percent } from "@/lib/format";
import { requireRole } from "@/server/auth";
import { listStudentExams } from "@/server/attempts/student";

export const metadata: Metadata = { title: "Results" };

export default async function ResultsIndex() {
  const user = await requireRole();
  if (user.role !== "student") redirect(homeFor(user.role));
  const exams = await listStudentExams(user);
  const attempts = exams
    .flatMap((e) => e.attempts.filter((a) => a.state !== "in_progress").map((a) => ({ ...a, exam: e })))
    .sort((a, b) => Date.parse(b.submittedAt ?? b.startedAt) - Date.parse(a.submittedAt ?? a.startedAt));

  return (
    <>
      <PageHeader title="Results" description="Every exam you’ve submitted. Scores appear once your instructor releases them." />
      {attempts.length === 0 ? (
        <EmptyState>You haven’t submitted any exams yet.</EmptyState>
      ) : (
        <RowList>
          {attempts.map((a) => {
            const pct = percent(a.score, a.maxScore);
            return (
              <Row
                key={a.id}
                href={`/exams/${a.exam.id}/results/${a.id}`}
                title={a.exam.title}
                detail={
                  <>
                    {a.exam.courseTitle} · submitted <LocalTime iso={a.submittedAt ?? a.startedAt} format="date" />
                  </>
                }
                aside={
                  pct !== null ? (
                    <span className="tabular-nums">
                      {fmtNum(a.score!)} / {fmtNum(a.maxScore!)} <span className="text-muted-foreground">· {pct}%</span>
                    </span>
                  ) : a.exam.resultsVisible ? (
                    <span className="text-muted-foreground">Being marked</span>
                  ) : (
                    <span className="text-muted-foreground">Not released yet</span>
                  )
                }
              />
            );
          })}
        </RowList>
      )}
    </>
  );
}
