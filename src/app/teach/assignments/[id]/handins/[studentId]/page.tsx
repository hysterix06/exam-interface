import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarkingForm } from "@/components/assignments/marking-form";
import { SubmissionView } from "@/components/assignments/submission-view";
import { GradeLines } from "@/components/authoring/grade-lines";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Section } from "@/components/ui/section";
import { workspaceAssignment } from "@/server/assignments/authoring";
import { loadMarking } from "@/server/assignments/marking";

export const metadata: Metadata = { title: "Mark hand-in" };

export default async function MarkHandIn({ params, searchParams }: PageProps<"/teach/assignments/[id]/handins/[studentId]">) {
  const { id, studentId } = await params;
  const { v } = await searchParams;
  const { assignment: a } = await workspaceAssignment(id);
  const m = await loadMarking(a, studentId);
  if (!m) notFound();
  const base = `/teach/assignments/${id}/handins`;
  const shown = m.versions.find((x) => String(x.version) === v) ?? m.versions[0];
  const latest = m.versions[0];

  return (
    <>
      <div className="mb-8 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold tracking-tight">
          {m.row.student.name} <span className="text-sm font-normal text-muted-foreground">{m.row.student.email}</span>
        </h2>
        <Button asChild variant="ghost" size="sm">
          <Link href={base}>All hand-ins</Link>
        </Button>
        {m.prev && (
          <Button asChild variant="ghost" size="sm">
            <Link href={`${base}/${m.prev}`}>← Previous</Link>
          </Button>
        )}
        {m.next && (
          <Button asChild variant="ghost" size="sm">
            <Link href={`${base}/${m.next}`}>Next →</Link>
          </Button>
        )}
      </div>
      {!shown ? (
        <EmptyState>Nothing handed in yet.</EmptyState>
      ) : (
        <div className="grid gap-10 lg:grid-cols-[1fr_22rem]">
          <div className="min-w-0">
            {m.versions.length > 1 && (
              <nav aria-label="Versions" className="mb-4 flex flex-wrap gap-1 text-sm">
                {m.versions.map((x) => (
                  <Link
                    key={x.id}
                    href={`${base}/${studentId}?v=${x.version}`}
                    aria-current={x.id === shown.id ? "page" : undefined}
                    className="rounded-md px-2.5 py-1 text-muted-foreground hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
                  >
                    v{x.version}
                    {x.id === latest.id ? " (latest)" : ""}
                  </Link>
                ))}
              </nav>
            )}
            <SubmissionView preview submission={{ ...shown, submittedAt: shown.submittedAt.toISOString() }} />
          </div>
          <aside className="min-w-0">
            {shown.id === latest.id ? (
              <MarkingForm
                key={latest.id + (latest.grade?.gradedAt.toISOString() ?? "")}
                assignmentId={id}
                submissionId={latest.id}
                rubric={a.rubric}
                points={a.points}
                lateMinutes={latest.lateMinutes}
                late={a.settings.late}
                initial={latest.grade ? { ticked: latest.grade.ticked, score: latest.grade.score, feedback: latest.grade.feedback, excused: latest.grade.excused, overrideReason: latest.grade.overrideReason } : null}
                nextHref={m.nextUnmarked ? `${base}/${m.nextUnmarked}` : null}
              />
            ) : shown.grade ? (
              <Section title="Marked earlier">
                <GradeLines result={shown.grade} />
              </Section>
            ) : (
              <p className="text-sm text-muted-foreground">An earlier version. Only the latest is marked.</p>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
