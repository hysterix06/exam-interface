import type { Metadata } from "next";
import Link from "next/link";
import { NewExamForm } from "@/components/authoring/new-exam-form";
import { TopicsManager } from "@/components/authoring/topics-manager";
import { ExamStateBadge } from "@/components/teach/exam-state-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Row, RowList } from "@/components/ui/row-list";
import { Section } from "@/components/ui/section";
import { Stat, StatGrid } from "@/components/ui/stat";
import { effectiveState } from "@/engine/exam-state";
import { getCourseWithMembers } from "@/server/admin/courses";
import { listExams, listTopics } from "@/server/authoring/data";
import { workspaceCourse } from "@/server/teach/course";

export const metadata: Metadata = { title: "Course" };

export default async function TeachCoursePage({ params }: PageProps<"/teach/courses/[id]">) {
  const { id } = await params;
  const { scope, course } = await workspaceCourse(id);

  const [topics, exams, roster] = await Promise.all([listTopics(scope, id), listExams(scope, id), getCourseWithMembers(scope.orgId, id)]);
  const students = roster?.members.filter((m) => m.role === "student") ?? [];
  const questionCount = topics.reduce((s, t) => s + t.questionCount, 0);
  const now = new Date();

  return (
    <>
      <StatGrid className="mb-10">
        <Stat label="Students" value={students.length} href={`/teach/courses/${id}/people`} />
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

    </>
  );
}
