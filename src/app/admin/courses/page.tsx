import type { Metadata } from "next";
import Link from "next/link";
import { NewCourse } from "@/components/admin/course-forms";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { requireAdmin } from "@/server/access";
import { listAllCourses } from "@/server/admin/courses";

export const metadata: Metadata = { title: "Courses" };

export default async function AdminCoursesPage({ searchParams }: PageProps<"/admin/courses">) {
  const { user } = await requireAdmin();
  const sp = await searchParams;
  const showArchived = sp.archived === "1";
  const courses = await listAllCourses(user.orgId, showArchived);

  return (
    <>
      <PageHeader
        title="Courses"
        description="Who teaches what, and who’s enrolled."
        actions={<NewCourse defaultOpen={sp.new === "1"} />}
      />
      {courses.length === 0 ? (
        <EmptyState>No courses yet. Create one, then assign a teacher and enrol students.</EmptyState>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Course</TH>
              <TH>Teachers</TH>
              <TH className="text-right">Students</TH>
              <TH className="text-right">Exams</TH>
            </tr>
          </THead>
          <tbody>
            {courses.map((c) => (
              <TR key={c.id} className={c.archivedAt ? "text-muted-foreground" : undefined}>
                <TD>
                  <Link href={`/admin/courses/${c.id}`} className="font-medium hover:underline">
                    {c.title}
                  </Link>
                  {c.code && <span className="ml-2 text-xs text-muted-foreground">{c.code}</span>}
                  {c.archivedAt && (
                    <Badge className="ml-2" tone="neutral">
                      Archived
                    </Badge>
                  )}
                </TD>
                <TD className={c.teachers.length ? undefined : "text-warning"}>{c.teachers.join(", ") || "None assigned"}</TD>
                <TD className="text-right tabular-nums">{c.students}</TD>
                <TD className="text-right tabular-nums">{c.exams}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
      <p className="mt-4 text-sm">
        <Link href={showArchived ? "/admin/courses" : "/admin/courses?archived=1"} className="text-muted-foreground hover:text-foreground">
          {showArchived ? "Hide archived courses" : "Show archived courses"}
        </Link>
      </p>
    </>
  );
}
