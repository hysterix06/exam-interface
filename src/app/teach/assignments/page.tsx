import type { Metadata } from "next";
import { AssignmentStateBadge } from "@/components/assignments/assignment-state-badge";
import { NewAssignmentForm } from "@/components/assignments/new-assignment-form";
import { EmptyState } from "@/components/ui/empty-state";
import { LocalTime } from "@/components/ui/local-time";
import { PageHeader } from "@/components/ui/page-header";
import { Row, RowList } from "@/components/ui/row-list";
import { Section } from "@/components/ui/section";
import { requireStaff } from "@/server/access";
import { listAssignmentsToMark, listCourseAssignments } from "@/server/assignments/authoring";
import { listCourses } from "@/server/authoring/data";

export const metadata: Metadata = { title: "Assignments" };

export default async function AssignmentsIndex() {
  const { scope } = await requireStaff();
  const courses = await listCourses(scope);
  const [perCourse, toMark] = await Promise.all([Promise.all(courses.map((c) => listCourseAssignments(scope, c.id))), listAssignmentsToMark(scope)]);
  return (
    <>
      <PageHeader title="Assignments" description="Homework, lab reports and essays: handed in as text or files, marked against a rubric." />
      {courses.length === 0 ? (
        <EmptyState>You aren’t teaching any courses yet.</EmptyState>
      ) : (
        <>
          <div className="mb-10">
            <NewAssignmentForm courses={courses.map((c) => ({ id: c.id, title: c.title }))} />
          </div>
          {courses.map((c, i) => (
            <Section key={c.id} title={c.code ? `${c.code} · ${c.title}` : c.title}>
              {perCourse[i].length === 0 ? (
                <p className="text-sm text-muted-foreground">No assignments yet.</p>
              ) : (
                <RowList>
                  {perCourse[i].map((a) => {
                    const pending = toMark.find((t) => t.id === a.id)?.pending ?? 0;
                    return (
                      <Row
                        key={a.id}
                        href={`/teach/assignments/${a.id}`}
                        title={a.title}
                        detail={
                          <>
                            {a.dueAt ? (
                              <>
                                Due <LocalTime iso={a.dueAt.toISOString()} />
                              </>
                            ) : (
                              "No due date"
                            )}
                            {pending > 0 && ` · ${pending} to mark`}
                          </>
                        }
                        aside={<AssignmentStateBadge state={a.effective} released={a.released} />}
                      />
                    );
                  })}
                </RowList>
              )}
            </Section>
          ))}
        </>
      )}
    </>
  );
}
