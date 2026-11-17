import Link from "next/link";
import { AssignmentControls } from "@/components/assignments/assignment-controls";
import { AssignmentStateBadge } from "@/components/assignments/assignment-state-badge";
import { LinkTabs } from "@/components/ui/link-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { assignmentState } from "@/engine/assignments/state";
import { assignmentIssues, listSubmissionsForStaff, workspaceAssignment } from "@/server/assignments/authoring";

/** One assignment, one place: write it, then collect and mark the hand-ins. */
export default async function AssignmentWorkspaceLayout({ children, params }: LayoutProps<"/teach/assignments/[id]">) {
  const { id } = await params;
  const { assignment: a } = await workspaceAssignment(id);
  const [issues, roster] = await Promise.all([assignmentIssues(a), listSubmissionsForStaff(a)]);
  const now = new Date();
  const state = assignmentState({ state: a.state, opensAt: a.opensAt, dueAt: a.dueAt, late: a.settings.late }, now);
  const released = !!a.releasedAt && a.releasedAt <= now;
  const handedIn = roster.filter((r) => r.submission).length;
  const toMark = roster.filter((r) => r.submission && !r.grade).length;
  const base = `/teach/assignments/${id}`;
  const course = a.course.code ? `${a.course.code} · ${a.course.title}` : a.course.title;
  return (
    <>
      <PageHeader
        back={{ href: `/teach/courses/${a.courseId}/assignments`, label: "Assignments" }}
        title={a.title}
        meta={<AssignmentStateBadge state={state} released={released} />}
        description={
          <Link href={`/teach/courses/${a.courseId}`} className="hover:text-foreground">
            {course}
          </Link>
        }
        actions={<AssignmentControls id={id} state={a.state} released={released} handedIn={handedIn} blocking={issues.some((i) => i.severity === "blocking")} />}
        className="mb-6"
      />
      <LinkTabs
        label="Assignment"
        tabs={[
          { href: base, label: "Edit", exact: true },
          { href: `${base}/handins`, label: "Hand-ins", count: toMark || undefined, disabledReason: a.state === "draft" ? "Publish the assignment first" : undefined },
        ]}
      />
      {children}
    </>
  );
}
