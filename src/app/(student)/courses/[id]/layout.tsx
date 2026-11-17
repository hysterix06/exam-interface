import { LinkTabs } from "@/components/ui/link-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { courseForPage } from "@/server/student/pages";

/** One course, one place: what's on, the syllabus, the calendar, the work and the grades. */
export default async function StudentCourseLayout({ children, params }: LayoutProps<"/courses/[id]">) {
  const { id } = await params;
  const { course } = await courseForPage(id);
  const base = `/courses/${id}`;
  return (
    <>
      <PageHeader title={course.title} description={[course.code, course.term].filter(Boolean).join(" · ") || undefined} className="mb-6" />
      <LinkTabs
        label="Course"
        tabs={[
          { href: base, label: "Overview", exact: true },
          { href: `${base}/syllabus`, label: "Syllabus" },
          { href: `${base}/calendar`, label: "Calendar" },
          { href: `${base}/work`, label: "Work" },
          { href: `${base}/grades`, label: "Grades" },
        ]}
      />
      {children}
    </>
  );
}
