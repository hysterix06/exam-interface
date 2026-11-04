import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { NewExamForm } from "@/components/authoring/new-exam-form";
import { TopicsManager } from "@/components/authoring/topics-manager";
import { ExamStateBadge } from "@/components/teach/exam-state-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Row, RowList } from "@/components/ui/row-list";
import { Section } from "@/components/ui/section";
import { Stat, StatGrid } from "@/components/ui/stat";
import { effectiveState } from "@/engine/exam-state";
import { plural } from "@/lib/format";
import { requireStaff } from "@/server/access";
import { getCourseWithMembers } from "@/server/admin/courses";
import { getCourse, listExams, listTopics } from "@/server/authoring/data";

export const metadata: Metadata = { title: "Course" };

export default async function TeachCoursePage({ params }: PageProps<"/teach/courses/[id]">) {
  const { scope, user } = await requireStaff();
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const course = await getCourse(scope, id);
  if (!course) notFound();

  const [topics, exams, roster] = await Promise.all([listTopics(scope, id), listExams(scope, id), getCourseWithMembers(scope.orgId, id)]);
  const students = roster?.members.filter((m) => m.role === "student") ?? [];
  const teachers = roster?.members.filter((m) => m.role === "teacher") ?? [];
  const questionCount = topics.reduce((s, t) => s + t.questionCount, 0);
  const now = new Date();

  return (
    <>
      <PageHeader
        title={course.title}
        description={[course.code, teachers.length ? `Taught by ${teachers.map((t) => t.name ?? t.email).join(", ")}` : null].filter(Boolean).join(" · ")}
        back={user.role === "admin" ? { href: `/admin/courses/${id}`, label: "Course settings" } : undefined}
      />

      <StatGrid className="mb-10">
        <Stat label="Students" value={students.length} href="#students" />
        <Stat label="Exams" value={exams.length} href="#exams" />
        <Stat label="Topics" value={topics.length} href="#topics" />
        <Stat label="Questions" value={questionCount} href={`/teach/questions?course=${id}`} />
      </StatGrid>

      <Section id="exams" title="Exams">
        <div className="mb-4">
          <NewExamForm courses={[{ id: course.id, title: course.title }]} />
        </div>
        {exams.length === 0 ? (
          <EmptyState>No exams in this course yet.</EmptyState>
        ) : (
          <RowList>
            {exams.map((e) => (
              <Row key={e.id} href={`/teach/exams/${e.id}`} title={e.title} aside={<ExamStateBadge state={effectiveState(e, now)} />} />
            ))}
          </RowList>
        )}
      </Section>

      <Section id="topics" title="Topics" description="Questions are grouped by topic, and exams draw from topics.">
        <TopicsManager courseId={course.id} topics={topics} />
        {topics.length > 0 && (
          <div className="mt-3">
            <Button asChild variant="ghost" size="sm">
              <Link href="/teach/questions/new">Write a question →</Link>
            </Button>
          </div>
        )}
      </Section>

      <Section
        id="students"
        title="Students"
        description={user.role === "admin" ? undefined : "Enrolment is managed by your administrator."}
        actions={
          user.role === "admin" ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/courses/${id}`}>Manage enrolment</Link>
            </Button>
          ) : null
        }
      >
        {students.length === 0 ? (
          <EmptyState>No students are enrolled yet.</EmptyState>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">{plural(students.length, "student")} enrolled.</p>
            <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              {students.map((s) => (
                <li key={s.userId} className="flex min-w-0 items-baseline gap-2">
                  <span className="truncate">{s.name ?? s.email}</span>
                  {s.name && <span className="truncate text-xs text-muted-foreground">{s.email}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>
    </>
  );
}
