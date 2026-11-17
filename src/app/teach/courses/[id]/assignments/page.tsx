import type { Metadata } from "next";
import { AssignmentStateBadge } from "@/components/assignments/assignment-state-badge";
import { NewAssignmentForm } from "@/components/assignments/new-assignment-form";
import { EmptyState } from "@/components/ui/empty-state";
import { LocalTime } from "@/components/ui/local-time";
import { Row, RowList } from "@/components/ui/row-list";
import { listCourseAssignments } from "@/server/assignments/authoring";
import { workspaceCourse } from "@/server/teach/course";

export const metadata: Metadata = { title: "Assignments" };

export default async function CourseAssignments({ params }: PageProps<"/teach/courses/[id]/assignments">) {
  const { id } = await params;
  const { scope, course } = await workspaceCourse(id);
  const list = await listCourseAssignments(scope, id);
  return (
    <>
      <div className="mb-6">
        <NewAssignmentForm courses={[{ id: course.id, title: course.title }]} />
      </div>
      {list.length === 0 ? (
        <EmptyState>No assignments yet. Homework, lab reports and essays live here: students hand in text or files and you mark them against a rubric.</EmptyState>
      ) : (
        <RowList>
          {list.map((a) => (
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
                  {a.state === "published" && ` · ${a.handedIn} handed in · ${a.handedIn - a.graded} to mark`}
                </>
              }
              aside={<AssignmentStateBadge state={a.effective} released={a.released} />}
            />
          ))}
        </RowList>
      )}
    </>
  );
}
