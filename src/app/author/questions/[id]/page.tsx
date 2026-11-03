import { notFound } from "next/navigation";
import { z } from "zod";
import { QuestionEditor } from "@/components/authoring/question-editor";
import { questionLabel } from "@/lib/question-label";
import { questionTypes } from "@/question-types/registry";
import { requireRole } from "@/server/auth";
import { getQuestion, listTopics, listVersions } from "@/server/authoring/data";

export default async function EditQuestionPage({ params }: PageProps<"/author/questions/[id]">) {
  const user = await requireRole("admin", "instructor");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const question = await getQuestion(user.orgId, id);
  if (!question) notFound();
  const type = questionTypes.get(question.type);
  if (!type) notFound();

  const [topics, versions] = await Promise.all([listTopics(user.orgId), listVersions(question.id)]);

  return (
    <>
      <h1 className="mb-8 text-2xl font-semibold tracking-tight">Edit {type.label.toLowerCase()} question</h1>
      <QuestionEditor
        // A new saved version should reset local state to what the server holds.
        key={`${question.id}:${question.version}`}
        typeId={question.type}
        topics={topics.map((t) => ({ id: t.id, name: t.name, courseTitle: t.courseTitle }))}
        initial={{
          id: question.id,
          topicId: question.topicId,
          def: question.def,
          weight: question.weight,
          difficulty: question.difficulty,
          points: question.points,
          tags: question.tags,
          groupKey: question.groupKey,
          status: question.status,
          version: question.version,
        }}
        versions={versions.map((v) => ({
          version: v.version,
          createdAt: v.createdAt.toISOString(),
          label: questionLabel(v.def, 70),
        }))}
      />
    </>
  );
}
