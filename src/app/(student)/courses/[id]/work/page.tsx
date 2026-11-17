import type { Metadata } from "next";
import { WorkList } from "@/components/academics/work-list";
import { EmptyState } from "@/components/ui/empty-state";
import { Section } from "@/components/ui/section";
import { workItems } from "@/server/student/academics";
import { courseForPage } from "@/server/student/pages";

export const metadata: Metadata = { title: "Course work" };

export default async function CourseWork({ params }: PageProps<"/courses/[id]/work">) {
  const { id } = await params;
  const { course, exams, assignments } = await courseForPage(id);
  const work = workItems(exams, assignments, new Map([[course.id, course.label]]));
  if (work.length === 0) return <EmptyState>No exams or assignments yet. They’ll appear here as soon as your teacher publishes them.</EmptyState>;
  const groups = [
    { key: "now", title: "To do now" },
    { key: "upcoming", title: "Coming up" },
    { key: "done", title: "Done" },
  ] as const;
  return (
    <>
      {groups.map((g) => {
        const items = work.filter((w) => w.group === g.key);
        return items.length ? (
          <Section key={g.key} title={g.title}>
            <WorkList items={items} showCourse={false} />
          </Section>
        ) : null;
      })}
    </>
  );
}
