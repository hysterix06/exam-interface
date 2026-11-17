import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Section } from "@/components/ui/section";
import { plural } from "@/lib/format";
import { getCourseWithMembers } from "@/server/admin/courses";
import { workspaceCourse } from "@/server/teach/course";

export const metadata: Metadata = { title: "People" };

function People({ people }: { people: { userId: string; name: string | null; email: string }[] }) {
  return (
    <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      {people.map((s) => (
        <li key={s.userId} className="flex min-w-0 items-baseline gap-2">
          <span className="truncate">{s.name ?? s.email}</span>
          {s.name && <span className="truncate text-xs text-muted-foreground">{s.email}</span>}
        </li>
      ))}
    </ul>
  );
}

export default async function CoursePeoplePage({ params }: PageProps<"/teach/courses/[id]/people">) {
  const { id } = await params;
  const { scope, user } = await workspaceCourse(id);
  const roster = await getCourseWithMembers(scope.orgId, id);
  const students = roster?.members.filter((m) => m.role === "student") ?? [];
  const teachers = roster?.members.filter((m) => m.role === "teacher") ?? [];
  return (
    <>
      <Section title="Teachers">{teachers.length === 0 ? <EmptyState>No teacher assigned yet.</EmptyState> : <People people={teachers} />}</Section>
      <Section
        title="Students"
        description={user.role === "admin" ? undefined : "Enrolment is managed by your administrator."}
        actions={
          user.role === "admin" ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/courses/${id}`}>Manage enrolment</Link>
            </Button>
          ) : null
        }
      >
        {students.length === 0 ? (
          <EmptyState>No students are enrolled yet.</EmptyState>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">{plural(students.length, "student")} enrolled.</p>
            <People people={students} />
          </>
        )}
      </Section>
    </>
  );
}
