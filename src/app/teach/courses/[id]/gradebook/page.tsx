import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Explain } from "@/components/ui/explain";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { courseGradeExplanation } from "@/engine/gradebook/course-grade";
import { fmtNum } from "@/engine/grading/format";
import { courseGradebook } from "@/server/teach/gradebook";
import { workspaceCourse } from "@/server/teach/course";

export const metadata: Metadata = { title: "Gradebook" };

export default async function GradebookPage({ params }: PageProps<"/teach/courses/[id]/gradebook">) {
  const { id } = await params;
  await workspaceCourse(id);
  const book = await courseGradebook(id);
  if (book.rows.length === 0) return <EmptyState>No students are enrolled yet.</EmptyState>;
  const cat = new Map(book.categories.map((c) => [c.id, c.name]));
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <p className="mr-auto max-w-prose text-sm text-muted-foreground">
          Everything marked so far, released or not. Columns marked † aren’t released yet, so students don’t see those marks (or their effect on the course grade).
        </p>
        <Button asChild variant="outline" size="sm">
          <a href={`/teach/courses/${id}/gradebook/export`}>Download CSV</a>
        </Button>
      </div>
      <Table>
        <THead>
          <TR>
            <TH className="sticky left-0 bg-background">Student</TH>
            <TH className="text-right">Course</TH>
            {book.columns.map((c) => (
              <TH key={c.id} className="text-right">
                <Link href={c.kind === "exam" ? `/teach/exams/${c.id}/results` : `/teach/assignments/${c.id}/handins`} className="hover:underline" title={c.title}>
                  <span className="inline-block max-w-40 truncate align-bottom">{c.title}</span>
                  {!c.released && "†"}
                </Link>
                <span className="block font-normal">{c.categoryId ? cat.get(c.categoryId) : "Not counted"}</span>
              </TH>
            ))}
          </TR>
        </THead>
        <tbody>
          {book.rows.map((r) => (
            <TR key={r.student.id}>
              <TD className="sticky left-0 bg-background font-medium whitespace-nowrap">{r.student.name}</TD>
              <TD className="text-right font-medium tabular-nums">
                {r.grade.percent === null ? "—" : <Explain explanation={courseGradeExplanation(r.grade)}>{fmtNum(Math.round(r.grade.percent * 10) / 10)}%</Explain>}
              </TD>
              {book.columns.map((c) => {
                const cell = r.cells.get(c.id)!;
                return (
                  <TD key={c.id} className={`text-right tabular-nums whitespace-nowrap ${cell.note === "Missing" ? "text-destructive" : ""}`}>
                    {cell.excused ? (
                      <span className="text-muted-foreground">Excused</span>
                    ) : cell.score === null ? (
                      <span className="text-muted-foreground">{cell.note}</span>
                    ) : (
                      <>
                        {fmtNum(cell.score)}
                        <span className="text-muted-foreground">/{fmtNum(cell.max)}</span>
                      </>
                    )}
                  </TD>
                );
              })}
            </TR>
          ))}
        </tbody>
      </Table>
    </>
  );
}
