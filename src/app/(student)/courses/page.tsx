import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Row, RowList } from "@/components/ui/row-list";
import { fmtNum } from "@/engine/grading/format";
import { requireRole } from "@/server/auth";
import { studentAcademics } from "@/server/student/academics";

export const metadata: Metadata = { title: "Courses" };

export default async function StudentCourses() {
  const user = await requireRole("student");
  const { courses } = await studentAcademics(user);
  return (
    <>
      <PageHeader title="Courses" />
      {courses.length === 0 ? (
        <EmptyState>You’re not enrolled in any course yet. Once your teacher or school adds you, your courses appear here.</EmptyState>
      ) : (
        <RowList>
          {courses.map((c) => (
            <Row
              key={c.id}
              href={`/courses/${c.id}`}
              title={c.label}
              detail={[c.term, c.teachers.map((t) => t.name).join(", ")].filter(Boolean).join(" · ") || undefined}
              aside={<span className="tabular-nums">{c.grade.percent === null ? <span className="text-muted-foreground">No grade yet</span> : `${fmtNum(Math.round(c.grade.percent * 10) / 10)}%`}</span>}
            />
          ))}
        </RowList>
      )}
    </>
  );
}
