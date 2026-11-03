import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ExamBuilder } from "@/components/authoring/exam-builder/exam-builder";
import { db } from "@/db/client";
import { courses, topics } from "@/db/schema";
import { examSettingsSchema } from "@/engine/exam";
import { blueprintSchema } from "@/engine/selection/types";
import { requireRole } from "@/server/auth";
import { getExam, loadPool } from "@/server/authoring/data";

export default async function ExamPage({ params }: PageProps<"/author/exams/[id]">) {
  const user = await requireRole("admin", "instructor");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const exam = await getExam(user.orgId, id);
  if (!exam) notFound();

  const [[course], courseTopics, fullPool] = await Promise.all([
    db.select({ title: courses.title }).from(courses).where(eq(courses.id, exam.courseId)).limit(1),
    db
      .select({ id: topics.id, name: topics.name })
      .from(topics)
      .where(and(eq(topics.courseId, exam.courseId), eq(topics.orgId, user.orgId)))
      .orderBy(asc(topics.position), asc(topics.name)),
    loadPool(user.orgId),
  ]);
  const topicIds = new Set(courseTopics.map((t) => t.id));

  return (
    <>
      <h1 className="sr-only">Exam builder</h1>
      <ExamBuilder
        // Remount on republish/save so local state matches the server.
        key={`${exam.id}:${exam.updatedAt.getTime()}`}
        exam={{
          id: exam.id,
          title: exam.title,
          description: exam.description ?? "",
          state: exam.state,
          courseTitle: course?.title ?? "",
          blueprint: blueprintSchema.parse({ sections: [], shuffleQuestions: true, ...(exam.blueprint as object) }),
          settings: examSettingsSchema.parse(exam.settings),
          lockedCount: exam.lockedVersions ? Object.keys(exam.lockedVersions).length : 0,
        }}
        topics={courseTopics}
        pool={fullPool.filter((q) => topicIds.has(q.topicId))}
      />
    </>
  );
}
