import type { Metadata } from "next";
import Link from "next/link";
import { CategoryPicker, WeightsEditor } from "@/components/teach/course/weights-editor";
import { EmptyState } from "@/components/ui/empty-state";
import { Row, RowList } from "@/components/ui/row-list";
import { Section } from "@/components/ui/section";
import { listCategories, listGradedItems, workspaceCourse } from "@/server/teach/course";

export const metadata: Metadata = { title: "Grading" };

export default async function CourseGradingPage({ params }: PageProps<"/teach/courses/[id]/grading">) {
  const { id } = await params;
  await workspaceCourse(id);
  const [categories, items] = await Promise.all([listCategories(id), listGradedItems(id)]);
  return (
    <>
      <Section
        title="Weights"
        description="Each category counts for its share of the course grade. Inside a category, scores add up by points. Categories with nothing graded yet are left out and the rest scaled up, so a student's grade so far is always meaningful."
      >
        <WeightsEditor courseId={id} initial={categories} />
      </Section>
      <Section title="What counts where" description="Put every exam and assignment in a category. Anything not counted is left out of the course grade.">
        {items.length === 0 ? (
          <EmptyState>No exams or assignments yet.</EmptyState>
        ) : (
          <RowList>
            {items.map((i) => (
              <Row
                key={`${i.kind}:${i.id}`}
                title={
                  <Link href={i.kind === "exam" ? `/teach/exams/${i.id}` : `/teach/assignments/${i.id}`} className="hover:underline">
                    {i.title}
                  </Link>
                }
                detail={`${i.kind === "exam" ? "Exam" : "Assignment"}${i.state === "draft" ? " · Draft" : ""}`}
                aside={<CategoryPicker item={i} categories={categories} />}
              />
            ))}
          </RowList>
        )}
      </Section>
    </>
  );
}
