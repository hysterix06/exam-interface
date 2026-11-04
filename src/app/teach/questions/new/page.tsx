import type { Metadata } from "next";
import Link from "next/link";
import { QuestionEditor } from "@/components/authoring/question-editor";
import { TypePicker } from "@/components/authoring/type-picker";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { questionTypes } from "@/question-types/registry";
import { requireStaff } from "@/server/access";
import { listCourses, listTopics } from "@/server/authoring/data";

export const metadata: Metadata = { title: "New question" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function NewQuestionPage({ searchParams }: PageProps<"/teach/questions/new">) {
  const { scope } = await requireStaff();
  const sp = await searchParams;
  const topics = await listTopics(scope);
  const back = { href: "/teach/questions", label: "Question bank" };

  if (topics.length === 0) {
    const [course] = await listCourses(scope);
    return (
      <>
        <PageHeader title="New question" back={back} />
        <EmptyState
          action={
            course ? (
              <Button asChild variant="outline">
                <Link href={`/teach/courses/${course.id}`}>Add a topic</Link>
              </Button>
            ) : undefined
          }
        >
          Questions live in topics. Add one to your course first.
        </EmptyState>
      </>
    );
  }

  const typeId = first(sp.type);
  const type = typeId ? questionTypes.get(typeId) : undefined;
  if (!type) {
    return (
      <>
        <PageHeader title="New question" description="Choose a type. It can’t be changed later." back={back} />
        <TypePicker topicId={first(sp.topic)} />
      </>
    );
  }

  const topicId = topics.find((t) => t.id === first(sp.topic))?.id ?? topics[0].id;

  return (
    <>
      <PageHeader title={`New ${type.label.toLowerCase()} question`} back={{ href: `/teach/questions/new${first(sp.topic) ? `?topic=${first(sp.topic)}` : ""}`, label: "Choose another type" }} />
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
