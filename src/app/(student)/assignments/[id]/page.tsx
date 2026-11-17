import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { HandInForm } from "@/components/assignments/hand-in-form";
import { SubmissionView } from "@/components/assignments/submission-view";
import { WorkStatus } from "@/components/academics/work-list";
import { GradeLines } from "@/components/authoring/grade-lines";
import { LocalTime } from "@/components/ui/local-time";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { Prose } from "@/components/ui/prose";
import { Section } from "@/components/ui/section";
import { describeDueLatePolicy } from "@/engine/assignments/late";
import { canSubmit } from "@/engine/assignments/state";
import { fmtNum } from "@/engine/grading/format";
import { requireRole } from "@/server/auth";
import { studentAcademics, workItems } from "@/server/student/academics";

export const metadata: Metadata = { title: "Assignment" };

export default async function AssignmentPage({ params }: PageProps<"/assignments/[id]">) {
  const user = await requireRole("student");
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const all = await studentAcademics(user);
  const a = all.assignments.find((x) => x.id === id);
  if (!a) notFound();
  const item = workItems([], [a], new Map())[0];
  const open = canSubmit(a.state);
  const total = a.rubric.reduce((s, c) => s + c.points, 0) || 1;

  return (
    <>
      <PageHeader back={{ href: `/courses/${a.courseId}/work`, label: a.courseLabel }} title={a.title} meta={<WorkStatus item={item} />} />

      <dl className="mb-10 grid grid-cols-2 gap-x-8 gap-y-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Due</dt>
          <dd className="mt-1">{a.dueAt ? <LocalTime iso={a.dueAt} /> : "No due date"}{a.extended && <span className="block text-xs text-muted-foreground">Your extended date</span>}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Worth</dt>
          <dd className="mt-1">{fmtNum(a.points)} points</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">Late work</dt>
          <dd className="mt-1">{describeDueLatePolicy(a.settings.late)}</dd>
        </div>
      </dl>

      {a.grade && (
        <Section title="Your grade">
          <div className="grid gap-6">
            {a.grade.excused ? <p>Excused: this doesn’t count towards your course grade.</p> : <GradeLines result={a.grade} />}
            {a.grade.feedback && (
              <div>
                <h3 className="mb-2 text-sm font-medium">Feedback</h3>
                <div className="rounded-md border p-4">
                  <Prose>{a.grade.feedback}</Prose>
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      <Section title="Instructions">{a.instructions ? <Prose className="max-w-prose">{a.instructions}</Prose> : <p className="text-sm text-muted-foreground">No written instructions.</p>}</Section>

      {a.rubric.length > 0 && (
        <Section title="How it’s marked">
          <ul className="grid gap-1.5 text-sm">
            {a.rubric.map((c) => (
              <li key={c.id} className="flex justify-between gap-4 border-b pb-1.5">
                <span>{c.text}</span>
                <span className="text-muted-foreground tabular-nums">{fmtNum(Math.round(((a.points * c.points) / total) * 100) / 100)} pts</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {a.submission && (
        <Section title="What you handed in">
          <SubmissionView submission={a.submission} />
          {a.submission && !a.released && <p className="mt-4 text-sm text-muted-foreground">Your grade appears here once your teacher releases it.</p>}
        </Section>
      )}

      {open && (!a.submission || (a.settings.resubmit && !a.released)) ? (
        <Section title={a.submission ? "Hand in again" : "Hand in"} description={a.submission ? "Your newest version is the one that gets marked." : undefined}>
          <HandInForm assignmentId={a.id} settings={a.settings} late={a.state === "late"} again={!!a.submission} />
        </Section>
      ) : a.state === "scheduled" ? (
        <Notice>
          This opens {a.opensAt ? <LocalTime iso={a.opensAt} /> : "soon"}.
        </Notice>
      ) : !a.submission && a.state === "closed" ? (
        <Notice>Hand-ins have closed. If something got in your way, <Link href={`/courses/${a.courseId}`} className="underline">contact your teacher</Link>.</Notice>
      ) : null}
    </>
  );
}
