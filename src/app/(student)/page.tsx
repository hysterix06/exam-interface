import type { Metadata } from "next";
import { RefreshOnChange } from "@/components/exam/refresh-on-change";
import Link from "next/link";
import { redirect } from "next/navigation";
import { examMeta } from "@/components/exam/exam-meta";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LocalTime } from "@/components/ui/local-time";
import { Row, RowList } from "@/components/ui/row-list";
import { Section } from "@/components/ui/section";
import { WorkList } from "@/components/academics/work-list";
import { AgendaList } from "@/components/calendar/calendar-view";
import { agenda } from "@/engine/calendar";
import { fmtNum } from "@/engine/grading/format";
import { homeFor } from "@/lib/auth/roles";
import { requireRole } from "@/server/auth";
import type { StudentExam } from "@/server/attempts/student";
import { studentAcademics, workItems, type StudentAssignment } from "@/server/student/academics";

export const metadata: Metadata = { title: "Home" };

function ExamCard({ e }: { e: StudentExam }) {
  const resume = e.inProgressId !== null;
  return (
    <li className="rounded-xl border p-6 sm:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{e.courseTitle}</p>
          <h2 className="mt-0.5 text-xl font-semibold tracking-tight">
            <Link href={`/exams/${e.id}`} className="hover:underline">
              {e.title}
            </Link>
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {resume && e.deadlineAt ? (
              <>
                In progress · time runs out <LocalTime iso={e.deadlineAt} format="relative" />
              </>
            ) : resume ? (
              "In progress · your answers are saved"
            ) : (
              <>
                {examMeta(e)}
                {e.closesAt && (
                  <>
                    {" · closes "}
                    <LocalTime iso={e.closesAt} format="relative" />
                  </>
                )}
              </>
            )}
          </p>
        </div>
        <Button asChild size="lg" className="w-full bg-brand text-brand-foreground hover:bg-brand/90 sm:w-auto">
          <Link href={`/exams/${e.id}`}>{resume ? "Resume" : "Start"}</Link>
        </Button>
      </div>
    </li>
  );
}

function AssignmentCard({ a }: { a: StudentAssignment }) {
  return (
    <li className="rounded-xl border p-6 sm:p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{a.courseLabel} · Assignment</p>
          <h2 className="mt-0.5 text-xl font-semibold tracking-tight">
            <Link href={`/assignments/${a.id}`} className="hover:underline">
              {a.title}
            </Link>
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {a.status === "overdue" ? (
              <span className="text-warning">Overdue · still accepted with a penalty</span>
            ) : a.dueAt ? (
              <>
                Due <LocalTime iso={a.dueAt} format="relative" /> · <LocalTime iso={a.dueAt} />
              </>
            ) : (
              "No due date"
            )}
            {` · ${fmtNum(a.points)} points`}
          </p>
        </div>
        <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
          <Link href={`/assignments/${a.id}`}>Open</Link>
        </Button>
      </div>
    </li>
  );
}

const DAY = 86_400_000;

/**
 * The student's day at a glance: what to do now, the week ahead across every
 * course, where each course stands, and what's just been graded.
 */
export default async function StudentHome() {
  const user = await requireRole();
  if (user.role !== "student") redirect(homeFor(user.role));
  const all = await studentAcademics(user);
  const now = new Date(all.now);
  const labels = new Map(all.courses.map((c) => [c.id, c.label]));

  const exams = all.exams.filter((e) => e.inProgressId || (e.state === "open" && e.attemptsLeft > 0));
  const work = all.assignments
    .filter((a) => a.status === "overdue" || (a.status === "to-do" && (!a.dueAt || Date.parse(a.dueAt) - now.getTime() <= 2 * DAY)))
    .sort((a, b) => (a.dueAt ?? "9").localeCompare(b.dueAt ?? "9"));
  const week = agenda(all.calendar, now, new Date(now.getTime() + 7 * DAY));
  const items = workItems(all.exams, all.assignments, labels);
  const graded = items
    .filter((w) => w.group === "done" && /\d/.test(w.status))
    .slice(0, 5);
  const first = user.fullName?.split(" ")[0];

  return (
    <>
      <RefreshOnChange
        boundaries={[...all.exams.flatMap((e) => [e.opensAt, e.closesAt]), ...all.assignments.flatMap((a) => [a.opensAt, a.dueAt])]}
        assignments
      />
      <h1 className="mb-12 font-serif text-[1.875rem] leading-tight font-semibold tracking-tight">{first ? `Hi, ${first}` : "Home"}</h1>

      {all.courses.length === 0 ? (
        <EmptyState>You’re not enrolled in any course yet. Once your teacher or school adds you, your courses, work and grades appear here.</EmptyState>
      ) : (
        <>
          {exams.length + work.length > 0 ? (
            <Section title="Ready for you">
              <ul className="grid gap-4">
                {exams.map((e) => (
                  <ExamCard key={e.id} e={e} />
                ))}
                {work.map((a) => (
                  <AssignmentCard key={a.id} a={a} />
                ))}
              </ul>
            </Section>
          ) : (
            <p className="mb-10 text-muted-foreground">Nothing due right now.</p>
          )}

          <Section
            title="This week"
            actions={
              <Link href="/calendar" className="text-sm text-muted-foreground hover:text-foreground">
                Calendar →
              </Link>
            }
          >
            <AgendaList items={week} empty="Nothing on the calendar in the next seven days." />
          </Section>

          <Section title="Your courses">
            <RowList>
              {all.courses.map((c) => {
                const next = items.find((w) => w.courseId === c.id && w.group !== "done");
                return (
                  <Row
                    key={c.id}
                    href={`/courses/${c.id}`}
                    title={c.label}
                    detail={
                      next ? (
                        <>
                          Next: {next.title}
                          {next.when && (
                            <>
                              {" · "}
                              {next.when.label.toLowerCase()} <LocalTime iso={next.when.iso} />
                            </>
                          )}
                        </>
                      ) : (
                        c.teachers.map((t) => t.name).join(", ") || "Nothing coming up"
                      )
                    }
                    aside={
                      <span className="tabular-nums">
                        {c.grade.percent === null ? <span className="text-muted-foreground">No grade yet</span> : `${fmtNum(Math.round(c.grade.percent * 10) / 10)}%`}
                      </span>
                    }
                  />
                );
              })}
            </RowList>
          </Section>

          {graded.length > 0 && (
            <Section
              title="Recently graded"
              actions={
                <Link href="/grades" className="text-sm text-muted-foreground hover:text-foreground">
                  All grades →
                </Link>
              }
            >
              <WorkList items={graded} />
            </Section>
          )}
        </>
      )}
    </>
  );
}
