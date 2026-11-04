import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Row, RowList } from "@/components/ui/row-list";
import { requireStaff } from "@/server/access";
import { listCourses } from "@/server/authoring/data";

export const metadata: Metadata = { title: "Courses" };

export default async function TeachCoursesPage() {
  const { scope, user } = await requireStaff();
  const courses = await listCourses(scope);
  return (
    <>
      <PageHeader title={user.role === "admin" ? "All courses" : "Your courses"} />
      {courses.length === 0 ? (
        <EmptyState>You aren’t teaching any courses yet. An administrator adds you to a course, and it appears here.</EmptyState>
      ) : (
        <RowList>
          {courses.map((c) => (
            <Row key={c.id} href={`/teach/courses/${c.id}`} title={c.title} detail={c.code ?? undefined} />
          ))}
        </RowList>
      )}
    </>
  );
}
