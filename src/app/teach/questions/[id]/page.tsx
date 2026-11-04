import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { QuestionEditor } from "@/components/authoring/question-editor";
import { PageHeader } from "@/components/ui/page-header";
import { questionLabel } from "@/lib/question-label";
import { questionTypes } from "@/question-types/registry";
import { requireStaff } from "@/server/access";
import { getQuestion, listTopics, listVersions } from "@/server/authoring/data";

export const metadata: Metadata = { title: "Edit question" };

export default async function EditQuestionPage({ params }: PageProps<"/teach/questions/[id]">) {
  const { scope } = await requireStaff();
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();

  const question = await getQuestion(scope, id);
  if (!question) notFound();
  const type = questionTypes.get(question.type);
  if (!type) notFound();

  const [topics, versions] = await Promise.all([listTopics(scope), listVersions(question.id)]);

  return (
    <>
      <PageHeader
        title={questionLabel(question.def, 80)}
        description={`${type.label} · version ${question.version}`}
        back={{ href: "/teach/questions", label: "Question bank" }}
      />
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
