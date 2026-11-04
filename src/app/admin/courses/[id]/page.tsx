import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AddMembers, CourseDetailsForm, RemoveMember } from "@/components/admin/course-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { plural } from "@/lib/format";
import { requireAdmin } from "@/server/access";
import { getCourseWithMembers } from "@/server/admin/courses";

export const metadata: Metadata = { title: "Course" };

function MemberList({ courseId, members }: { courseId: string; members: { userId: string; name: string | null; email: string; deactivatedAt: Date | null }[] }) {
  if (members.length === 0) return null;
  return (
    <ul className="mb-4 divide-y rounded-lg border text-sm">
      {members.map((m) => (
        <li key={m.userId} className="flex items-center gap-3 px-4 py-2">
          <Link href={`/admin/people/${m.userId}`} className="min-w-0 flex-1 truncate hover:underline">
            {m.name ?? m.email}
            {m.name && <span className="ml-2 text-muted-foreground">{m.email}</span>}
          </Link>
          {m.deactivatedAt && <Badge>Off</Badge>}
          <RemoveMember courseId={courseId} userId={m.userId} name={m.name ?? m.email} />
        </li>
      ))}
    </ul>
  );
}

export default async function AdminCoursePage({ params }: PageProps<"/admin/courses/[id]">) {
  const { user } = await requireAdmin();
  const { id } = await params;
  const found = await getCourseWithMembers(user.orgId, id);
  if (!found) notFound();
  const { course, members } = found;
  const teachers = members.filter((m) => m.role === "teacher");
  const students = members.filter((m) => m.role === "student");

  return (
    <>
      <PageHeader
        back={{ href: "/admin/courses", label: "Courses" }}
        title={course.title}
        meta={course.archivedAt ? <Badge>Archived</Badge> : undefined}
        description={course.code ?? undefined}
        actions={
          <Button asChild variant="outline">
            <Link href={`/teach/courses/${course.id}`}>Open teaching view</Link>
          </Button>
        }
      />

      <Section title="Teachers" description={teachers.length ? undefined : "Nobody teaches this course yet, so no one can build exams for it."}>
        <MemberList courseId={course.id} members={teachers} />
        <AddMembers courseId={course.id} role="teacher" />
      </Section>

      <Section title="Students" description={students.length ? `${plural(students.length, "student")} enrolled.` : "No one is enrolled yet."}>
        <MemberList courseId={course.id} members={students} />
        <AddMembers courseId={course.id} role="student" />
        <p className="mt-2 text-xs text-muted-foreground">
          Only people who already have an account can be enrolled here. To create accounts and enrol in one step, use{" "}
          <Link href="/admin/people" className="underline underline-offset-4">
            Import list
          </Link>{" "}
          on the People page.
        </p>
      </Section>

      <Section title="Details">
        <CourseDetailsForm id={course.id} code={course.code} title={course.title} archived={!!course.archivedAt} />
      </Section>
    </>
  );
}
