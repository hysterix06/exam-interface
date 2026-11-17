import { LinkTabs } from "@/components/ui/link-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { workspaceCourse } from "@/server/teach/course";

/** One course, one place: its exams and topics, homepage details, calendar, grading and people. */
export default async function TeachCourseLayout({ children, params }: LayoutProps<"/teach/courses/[id]">) {
  const { id } = await params;
  const { course, user } = await workspaceCourse(id);
  const base = `/teach/courses/${id}`;
  return (
    <>
      <PageHeader
        title={course.title}
        description={[course.code, course.term].filter(Boolean).join(" · ") || undefined}
        back={user.role === "admin" ? { href: `/admin/courses/${id}`, label: "Course settings" } : { href: "/teach/courses", label: "Courses" }}
        className="mb-6"
      />
      <LinkTabs
        label="Course"
        tabs={[
          { href: base, label: "Overview", exact: true },
          { href: `${base}/details`, label: "Homepage" },
          { href: `${base}/calendar`, label: "Calendar" },
          { href: `${base}/grading`, label: "Grading" },
          { href: `${base}/people`, label: "People" },
        ]}
      />
      {children}
    </>
  );
}
