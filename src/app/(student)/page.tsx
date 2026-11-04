import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { examMeta } from "@/components/exam/exam-meta";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LocalTime } from "@/components/ui/local-time";
import { Row, RowList } from "@/components/ui/row-list";
import { Section } from "@/components/ui/section";
import { fmtNum } from "@/engine/grading/format";
import { homeFor } from "@/lib/auth/roles";
import { percent } from "@/lib/format";
import { requireRole } from "@/server/auth";
import { listStudentCourses, listStudentExams, type StudentExam } from "@/server/attempts/student";

export const metadata: Metadata = { title: "Exams" };

function NowCard({ e }: { e: StudentExam }) {
  const resume = e.inProgressId !== null;
  return (
    <li className="rounded-lg border p-5 sm:p-6">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{e.courseTitle}</p>
          <h2 className="mt-0.5 text-xl font-semibold tracking-tight">
            <Link href={`/exams/${e.id}`} className="hover:underline">
              {e.title}
            </Link>
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
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
        <Button asChild size="lg" className="bg-brand text-brand-foreground hover:bg-brand/90">
          <Link href={`/exams/${e.id}`}>{resume ? "Resume" : "Start"}</Link>
        </Button>
      </div>
    </li>
  );
}

export default async function StudentHome() {
  const user = await requireRole();
  if (user.role !== "student") redirect(homeFor(user.role));
  const [exams, courses] = await Promise.all([listStudentExams(user), listStudentCourses(user)]);

  const now = exams.filter((e) => e.inProgressId || (e.state === "open" && e.attemptsLeft > 0));
  const upcoming = exams
    .filter((e) => e.state === "scheduled")
    .sort((a, b) => (a.opensAt ? Date.parse(a.opensAt) : Infinity) - (b.opensAt ? Date.parse(b.opensAt) : Infinity));
  const past = exams.filter((e) => !now.includes(e) && !upcoming.includes(e));
  const first = user.fullName?.split(" ")[0];

  return (
    <>
      <h1 className="mb-8 text-2xl font-semibold tracking-tight">{first ? `Hi, ${first}` : "Your exams"}</h1>

      {courses.length === 0 ? (
        <EmptyState>You’re not enrolled in any course yet. Once your instructor or school adds you, your exams appear here.</EmptyState>
      ) : exams.length === 0 ? (
        <EmptyState>No exams yet. They’ll appear here as soon as your instructor publishes one.</EmptyState>
      ) : (
        <>
          {now.length > 0 ? (
            <Section title="Ready for you">
              <ul className="grid gap-3">
                {now.map((e) => (
                  <NowCard key={e.id} e={e} />
                ))}
              </ul>
            </Section>
          ) : (
            <p className="mb-10 text-muted-foreground">Nothing to sit right now.</p>
          )}

          {upcoming.length > 0 && (
            <Section title="Coming up">
              <RowList>
                {upcoming.map((e) => (
                  <Row
                    key={e.id}
                    href={`/exams/${e.id}`}
                    title={e.title}
                    detail={`${e.courseTitle} · ${examMeta(e)}`}
                    aside={
                      <span className="text-muted-foreground">
                        {e.opensAt ? (
                          <>
                            Opens <LocalTime iso={e.opensAt} />
                          </>
                        ) : (
                          "Not open yet"
                        )}
                      </span>
                    }
                  />
                ))}
              </RowList>
            </Section>
          )}

          {past.length > 0 && (
            <Section
              title="Finished"
              actions={
                <Link href="/results" className="text-sm text-muted-foreground hover:text-foreground">
                  All results →
                </Link>
              }
            >
              <RowList>
                {past.map((e) => {
                  const last = e.attempts.find((a) => a.state !== "in_progress");
                  const pct = last ? percent(last.score, last.maxScore) : null;
                  return (
                    <Row
                      key={e.id}
                      href={last ? `/exams/${e.id}/results/${last.id}` : `/exams/${e.id}`}
                      title={e.title}
                      detail={e.courseTitle}
                      aside={
                        !last ? (
                          <span className="text-muted-foreground">Not taken</span>
                        ) : pct !== null ? (
                          <span className="tabular-nums">
                            {fmtNum(last.score!)} / {fmtNum(last.maxScore!)} <span className="text-muted-foreground">· {pct}%</span>
                          </span>
                        ) : e.resultsVisible ? (
                          <span className="text-muted-foreground">Being marked</span>
                        ) : (
                          <span className="text-muted-foreground">Results not out yet</span>
                        )
                      }
                    />
                  );
                })}
              </RowList>
            </Section>
          )}
        </>
      )}
    </>
  );
}
