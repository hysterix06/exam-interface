import type { Metadata } from "next";
import { ExamBuilder } from "@/components/authoring/exam-builder/exam-builder";
import { loadPool } from "@/server/authoring/data";
import { workspaceExam } from "@/server/teach/exam";

export const metadata: Metadata = { title: "Build exam" };

export default async function BuildPage({ params }: PageProps<"/teach/exams/[id]">) {
  const { id } = await params;
  const { exam, course, topics, blueprint, settings } = await workspaceExam(id);
  const pool = await loadPool(exam.orgId, exam.courseId);

  return (
    <ExamBuilder
      // Remount when the exam is published or unpublished, not on every autosave.
      key={`${exam.id}:${exam.state}`}
      exam={{
        id: exam.id,
        title: exam.title,
        description: exam.description ?? "",
        state: exam.state,
        courseTitle: course?.title ?? "",
        blueprint,
        settings,
        lockedCount: exam.lockedVersions ? Object.keys(exam.lockedVersions).length : 0,
      }}
      topics={topics}
      pool={pool}
    />
  );
}
