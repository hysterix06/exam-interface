import type { Metadata } from "next";
import Link from "next/link";
import { NewExamForm } from "@/components/authoring/new-exam-form";
import { ExamStateBadge } from "@/components/teach/exam-state-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LocalTime } from "@/components/ui/local-time";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { effectiveState, type ExamStateName } from "@/engine/exam-state";
import { blueprintSchema } from "@/engine/selection/types";
import { requireStaff } from "@/server/access";
import { listCourses, listExams } from "@/server/authoring/data";
import { examActivity } from "@/server/teach/home";

export const metadata: Metadata = { title: "Exams" };

const GROUPS: { label: string; states: ExamStateName[] }[] = [
  { label: "Open now", states: ["open"] },
  { label: "Drafts and upcoming", states: ["draft", "scheduled"] },
  { label: "Finished", states: ["closed", "graded", "released"] },
];

export default async function ExamsPage({ searchParams }: PageProps<"/teach/exams">) {
  const { scope } = await requireStaff();
  const sp = await searchParams;
  const [exams, courses] = await Promise.all([listExams(scope), listCourses(scope)]);
  const { activity, marking } = await examActivity(exams.map((e) => e.id));
  const now = new Date();
  const rows = exams.map((e) => {
    const bp = blueprintSchema.safeParse(e.blueprint);
    return {
      ...e,
      effective: effectiveState(e, now),
      questions: bp.success ? bp.data.sections.reduce((s, x) => s + x.count, 0) : 0,
      attempts: (activity.find((a) => a.examId === e.id)?.finished ?? 0) + (activity.find((a) => a.examId === e.id)?.live ?? 0),
      toMark: marking.find((m) => m.examId === e.id)?.n ?? 0,
    };
  });

  return (
    <>
      <PageHeader title="Exams" />

      <Section className="mb-10">
        {courses.length === 0 ? (
          <p className="text-sm text-muted-foreground">You need a course before you can create an exam.</p>
        ) : (
          <NewExamForm courses={courses.map((c) => ({ id: c.id, title: c.title }))} autoFocus={sp.new === "1"} />
        )}
      </Section>

      {rows.length === 0 ? (
        <EmptyState>No exams yet. Name one above to start building it.</EmptyState>
      ) : (
        GROUPS.map((g) => {
          const list = rows.filter((r) => g.states.includes(r.effective));
          if (list.length === 0) return null;
          return (
            <Section key={g.label} title={g.label}>
              <Table>
                <THead>
                  <tr>
                    <TH>Exam</TH>
                    {courses.length > 1 && <TH>Course</TH>}
                    <TH className="text-right">Questions</TH>
                    <TH className="text-right">Attempts</TH>
                    <TH>Status</TH>
                    <TH>Edited</TH>
                  </tr>
                </THead>
                <tbody>
                  {list.map((e) => (
                    <TR key={e.id}>
                      <TD>
                        <Link href={`/teach/exams/${e.id}`} className="font-medium hover:underline">
                          {e.title}
                        </Link>
                        {e.toMark > 0 && (
                          <Link href={`/teach/marking/${e.id}`} className="ml-2 text-xs text-muted-foreground hover:text-foreground">
                            {e.toMark} to mark
                          </Link>
                        )}
                      </TD>
                      {courses.length > 1 && <TD className="text-muted-foreground">{e.courseTitle}</TD>}
                      <TD className="text-right tabular-nums">{e.questions}</TD>
                      <TD className="text-right tabular-nums">{e.attempts}</TD>
                      <TD>
                        <ExamStateBadge state={e.effective} />
                      </TD>
                      <TD className="whitespace-nowrap text-muted-foreground">
                        <LocalTime iso={e.updatedAt.toISOString()} format="date" />
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            </Section>
          );
        })
      )}
    </>
  );
}
