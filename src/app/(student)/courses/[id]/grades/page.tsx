import type { Metadata } from "next";
import { GradeBreakdown } from "@/components/academics/grade-breakdown";
import { STATUS_LABEL } from "@/server/student/academics";
import { courseForPage } from "@/server/student/pages";

export const metadata: Metadata = { title: "Course grades" };

export default async function CourseGrades({ params }: PageProps<"/courses/[id]/grades">) {
  const { id } = await params;
  const { course, exams, assignments } = await courseForPage(id);
  const exam = new Map(exams.map((e) => [e.id, e]));
  const work = new Map(assignments.map((a) => [a.id, a]));
  return (
    <GradeBreakdown
      grade={course.grade}
      items={course.gradeItems}
      hrefFor={(i) => (i.kind === "exam" ? `/exams/${i.id}` : `/assignments/${i.id}`)}
      statusFor={(i) => {
        if (i.kind === "assignment") {
          const a = work.get(i.id);
          return a && !a.released && a.submission ? "Not released yet" : a ? STATUS_LABEL[a.status] : "";
        }
        const e = exam.get(i.id);
        if (!e) return "";
        if (e.attempts.length === 0) return e.state === "scheduled" ? "Not open yet" : "Not taken";
        return e.resultsVisible ? "Being marked" : "Not released yet";
      }}
    />
  );
}
