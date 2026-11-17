import type { Metadata } from "next";
import { AssignmentEditor } from "@/components/assignments/assignment-editor";
import { IssueList } from "@/components/authoring/issue-list";
import { Section } from "@/components/ui/section";
import { assignmentIssues, listSubmissionsForStaff, workspaceAssignment } from "@/server/assignments/authoring";

export const metadata: Metadata = { title: "Edit assignment" };

export default async function EditAssignment({ params }: PageProps<"/teach/assignments/[id]">) {
  const { id } = await params;
  const { assignment: a, categories } = await workspaceAssignment(id);
  const [issues, roster] = await Promise.all([assignmentIssues(a), listSubmissionsForStaff(a)]);
  return (
    <>
      <Section title="Before publishing" description="Checked every time you save.">
        <IssueList issues={issues} empty="Ready to publish." />
      </Section>
      <AssignmentEditor
        key={a.updatedAt.toISOString()}
        initial={{
          id: a.id,
          title: a.title,
          instructions: a.instructions,
          opensAt: a.opensAt?.toISOString() ?? null,
          dueAt: a.dueAt?.toISOString() ?? null,
          points: a.points,
          categoryId: a.categoryId,
          settings: a.settings,
          rubric: a.rubric,
        }}
        categories={categories}
        hasMarks={roster.some((r) => r.grade)}
      />
    </>
  );
}
