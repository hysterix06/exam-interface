import type { Metadata } from "next";
import Link from "next/link";
import { ExtensionDialog } from "@/components/assignments/extension-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { LocalTime } from "@/components/ui/local-time";
import { Stat, StatGrid } from "@/components/ui/stat";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtNum } from "@/engine/grading/format";
import { listSubmissionsForStaff, workspaceAssignment } from "@/server/assignments/authoring";

export const metadata: Metadata = { title: "Hand-ins" };

const TONE: Record<string, string> = { Missing: "text-destructive", Overdue: "text-warning", "Handed in late": "text-warning", "Not handed in": "text-muted-foreground" };

export default async function HandIns({ params }: PageProps<"/teach/assignments/[id]/handins">) {
  const { id } = await params;
  const { assignment: a } = await workspaceAssignment(id);
  const roster = await listSubmissionsForStaff(a);
  if (roster.length === 0) return <EmptyState>No students are enrolled in this course yet.</EmptyState>;
  const handedIn = roster.filter((r) => r.submission);
  const marked = roster.filter((r) => r.grade);
  const firstToMark = handedIn.find((r) => !r.grade);
  return (
    <>
      <StatGrid className="mb-10">
        <Stat label="Handed in" value={`${handedIn.length} of ${roster.length}`} />
        <Stat label="Marked" value={`${marked.length} of ${handedIn.length}`} />
        <Stat label="To mark" value={handedIn.length - marked.length} href={firstToMark ? `/teach/assignments/${id}/handins/${firstToMark.student.id}` : undefined} />
        <Stat label="Extensions" value={roster.filter((r) => r.extension).length} />
      </StatGrid>
      <Table>
        <THead>
          <TR>
            <TH>Student</TH>
            <TH>Status</TH>
            <TH>Handed in</TH>
            <TH className="text-right">Score</TH>
            <TH>
              <span className="sr-only">Extension</span>
            </TH>
          </TR>
        </THead>
        <tbody>
          {roster.map((r) => (
            <TR key={r.student.id}>
              <TD>
                {r.submission ? (
                  <Link href={`/teach/assignments/${id}/handins/${r.student.id}`} className="font-medium hover:underline">
                    {r.student.name}
                  </Link>
                ) : (
                  <span className="font-medium">{r.student.name}</span>
                )}
                {r.extension && (
                  <span className="block text-xs text-muted-foreground">
                    Due <LocalTime iso={r.extension.dueAt.toISOString()} />
                  </span>
                )}
              </TD>
              <TD className={TONE[r.status] ?? ""}>{r.status}</TD>
              <TD className="text-muted-foreground">
                {r.submission ? (
                  <>
                    <LocalTime iso={r.submission.submittedAt.toISOString()} />
                    {r.versions > 1 && ` · v${r.versions}`}
                  </>
                ) : (
                  "—"
                )}
              </TD>
              <TD className="text-right tabular-nums">{r.grade ? (r.grade.excused ? "Excused" : `${fmtNum(r.grade.score)} / ${fmtNum(r.grade.max)}`) : "—"}</TD>
              <TD className="text-right">
                <ExtensionDialog
                  assignmentId={id}
                  student={{ id: r.student.id, name: r.student.name }}
                  current={r.extension ? { dueAt: r.extension.dueAt.toISOString(), reason: r.extension.reason } : null}
                  defaultDue={a.dueAt?.toISOString() ?? null}
                />
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </>
  );
}
