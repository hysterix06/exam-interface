import Link from "next/link";
import { QuestionEditor } from "@/components/authoring/question-editor";
import { TypePicker } from "@/components/authoring/type-picker";
import { requireRole } from "@/server/auth";
import { listTopics } from "@/server/authoring/data";
import { questionTypes } from "@/question-types/registry";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function NewQuestionPage({ searchParams }: PageProps<"/author/questions/new">) {
  const user = await requireRole("admin", "instructor");
  const sp = await searchParams;
  const topics = await listTopics(user.orgId);

  if (topics.length === 0) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">New question</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Questions live in topics. <Link href="/author/topics" className="underline">Create a topic</Link> first.
        </p>
      </>
    );
  }

  const typeId = first(sp.type);
  const type = typeId ? questionTypes.get(typeId) : undefined;
  if (!type) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">New question</h1>
        <p className="mt-2 mb-6 text-sm text-muted-foreground">Choose a type. You can’t change it later.</p>
        <TypePicker topicId={first(sp.topic)} />
      </>
    );
  }

  const topicId = topics.find((t) => t.id === first(sp.topic))?.id ?? topics[0].id;

  return (
    <>
      <h1 className="mb-8 text-2xl font-semibold tracking-tight">New {type.label.toLowerCase()} question</h1>
      <QuestionEditor
        typeId={type.id}
        topics={topics.map((t) => ({ id: t.id, name: t.name, courseTitle: t.courseTitle }))}
        initial={{
          topicId,
          weight: 1,
          difficulty: 2,
          points: 1,
          tags: [],
          groupKey: null,
          status: "draft",
        }}
      />
    </>
  );
}
