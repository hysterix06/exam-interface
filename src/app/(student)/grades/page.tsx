import type { Metadata } from "next";
import Link from "next/link";
import { WorkList } from "@/components/academics/work-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Stat, StatGrid } from "@/components/ui/stat";
import { courseGradeExplanation } from "@/engine/gradebook/course-grade";
import { fmtNum } from "@/engine/grading/format";
import { requireRole } from "@/server/auth";
import { studentAcademics, workItems } from "@/server/student/academics";

export const metadata: Metadata = { title: "Grades" };

export default async function StudentGrades() {
  const user = await requireRole("student");
  const all = await studentAcademics(user);
  const labels = new Map(all.courses.map((c) => [c.id, c.label]));
  const done = workItems(all.exams, all.assignments, labels).filter((w) => w.group === "done");

  return (
    <>
      <PageHeader title="Grades" description="Your grade in each course so far, and everything you’ve handed in. Scores appear once your teacher releases them." />
      {all.courses.length === 0 ? (
        <EmptyState>You’re not enrolled in any course yet.</EmptyState>
      ) : (
        <>
          <StatGrid>
            {all.courses.map((c) => (
              <div key={c.id}>
                <Stat
                  label={c.label}
                  value={c.grade.percent === null ? "—" : `${fmtNum(Math.round(c.grade.percent * 10) / 10)}%`}
                  explain={courseGradeExplanation(c.grade)}
                />
                <Link href={`/courses/${c.id}/grades`} className="mt-2 inline-block text-xs text-muted-foreground hover:text-foreground">
                  Breakdown →
                </Link>
              </div>
            ))}
          </StatGrid>
          <Section title="Handed in and finished">
            <WorkList items={done} empty="Nothing finished yet." />
          </Section>
        </>
      )}
    </>
  );
}
