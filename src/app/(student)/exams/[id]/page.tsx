import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { EnterForm } from "@/components/exam/enter-form";
import { Badge } from "@/components/ui/badge";
import { LocalTime } from "@/components/ui/local-time";
import { PageHeader } from "@/components/ui/page-header";
import { Row, RowList } from "@/components/ui/row-list";
import { Section } from "@/components/ui/section";
import { RELEASE_LABELS } from "@/engine/exam";
import { fmtNum } from "@/engine/grading/format";
import { homeFor } from "@/lib/auth/roles";
import { percent, plural } from "@/lib/format";
import { requireRole } from "@/server/auth";
import { getStudentExam } from "@/server/attempts/student";

export const metadata: Metadata = { title: "Exam" };

export default async function ExamInfoPage({ params }: PageProps<"/exams/[id]">) {
  const user = await requireRole();
  if (user.role !== "student") redirect(homeFor(user.role));
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const exam = await getStudentExam(user, id);
  if (!exam) notFound();

  const s = exam.settings;
  const finished = exam.attempts.filter((a) => a.state !== "in_progress");
  const rules: [string, React.ReactNode][] = [
    ["Questions", exam.questionCount],
    ["Time", s.timeLimitMinutes ? `${s.timeLimitMinutes} minutes, from when you start` : "No time limit"],
    ["Attempts", s.attemptsAllowed === 1 ? "One" : `${s.attemptsAllowed} (${exam.attemptsLeft} left)`],
    ["Moving around", s.oneWayNavigation ? "One way: you can’t go back to a question" : "Go back and change answers any time"],
    ["Afterwards you’ll see", RELEASE_LABELS[s.release]],
  ];
  if (exam.opensAt) rules.push(["Opens", <LocalTime key="o" iso={exam.opensAt} />]);
  if (exam.closesAt) rules.push(["Closes", <LocalTime key="c" iso={exam.closesAt} />]);
  if (exam.topics.length) rules.push(["Covers", exam.topics.join(", ")]);

  const canStart = exam.state === "open" && exam.attemptsLeft > 0;

  return (
    <>
      <PageHeader
        back={{ href: "/", label: "Exams" }}
        title={exam.title}
        meta={exam.state === "open" ? <Badge tone="success">Open</Badge> : undefined}
        description={exam.courseTitle}
      />
      {exam.description && <p className="-mt-4 mb-8 max-w-prose text-pretty">{exam.description}</p>}

      <dl className="grid grid-cols-[auto_1fr] gap-x-8 gap-y-2.5 text-sm sm:max-w-lg">
        {rules.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      <Section className="rounded-lg border p-5">
        {exam.inProgressId ? (
          <>
            <p className="mb-4 text-sm">You’ve started this exam. Everything you’ve answered is saved{exam.deadlineAt ? <>, and time runs out <LocalTime iso={exam.deadlineAt} format="relative" /></> : null}.</p>
            <EnterForm examId={exam.id} requireCode={s.requireCode} resume />
          </>
        ) : canStart ? (
          <>
            <ul className="mb-5 grid gap-1 text-sm text-muted-foreground">
              <li>Your answers save as you go. If you lose connection, come back and pick up where you left off.</li>
              {s.timeLimitMinutes ? <li>The clock starts when you press Start, and keeps running if you leave.</li> : null}
              {s.requireCode ? <li>You’ll need the access code from your instructor.</li> : null}
            </ul>
            <EnterForm examId={exam.id} requireCode={s.requireCode} resume={false} />
          </>
        ) : exam.state === "open" ? (
          <p className="text-sm">You’ve used all your attempts.</p>
        ) : exam.state === "scheduled" ? (
          <p className="text-sm">
            {exam.opensAt ? (
              <>
                This exam opens <LocalTime iso={exam.opensAt} />. Come back then.
              </>
            ) : (
              "This exam isn’t open yet. Your instructor will open it."
            )}
          </p>
        ) : exam.state === "released" ? (
          <p className="text-sm">This exam is over and results are out.</p>
        ) : (
          <p className="text-sm">This exam is closed. {finished.length ? "Results appear here when your instructor releases them." : ""}</p>
        )}
      </Section>

      {finished.length > 0 && (
        <Section title="Your attempts">
          <RowList>
            {finished.map((a, i) => {
              const pct = percent(a.score, a.maxScore);
              return (
                <Row
                  key={a.id}
                  href={`/exams/${exam.id}/results/${a.id}`}
                  title={finished.length > 1 ? `Attempt ${finished.length - i}` : "Your attempt"}
                  detail={<LocalTime iso={a.submittedAt ?? a.startedAt} />}
                  aside={
                    pct !== null ? (
                      <span className="tabular-nums">
                        {fmtNum(a.score!)} / {fmtNum(a.maxScore!)} <span className="text-muted-foreground">· {pct}%</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{exam.resultsVisible ? "Being marked" : "Not released yet"}</span>
                    )
                  }
                />
              );
            })}
          </RowList>
          {exam.attemptsLeft > 0 && exam.state === "open" && !exam.inProgressId && (
            <p className="mt-2 text-sm text-muted-foreground">{plural(exam.attemptsLeft, "attempt")} left.</p>
          )}
        </Section>
      )}
    </>
  );
}
