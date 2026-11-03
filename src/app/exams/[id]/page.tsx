import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { EnterForm } from "@/components/exam/enter-form";
import { Badge } from "@/components/ui/badge";
import { RELEASE_LABELS } from "@/engine/exam";
import { STATE_LABELS } from "@/engine/exam-state";
import { requireRole } from "@/server/auth";
import { getStudentExam } from "@/server/attempts/student";

export default async function ExamInfoPage({ params }: PageProps<"/exams/[id]">) {
  const user = await requireRole();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const exam = await getStudentExam(user, id);
  if (!exam) notFound();

  const s = exam.settings;
  const rules = [
    ["Questions", String(exam.questionCount)],
    ["Time", s.timeLimitMinutes ? `${s.timeLimitMinutes} minutes` : "No time limit"],
    ["Attempts", `${s.attemptsAllowed} allowed, ${exam.attemptsLeft} left`],
    ["Navigation", s.oneWayNavigation ? "One way: you can't go back" : "Move freely between questions"],
    ["Access code", s.requireCode ? "Required" : "Not needed"],
    ["After release you see", RELEASE_LABELS[s.release]],
  ];

  return (
    <>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{exam.title}</h1>
        <Badge tone={exam.state === "open" ? "success" : "neutral"}>{STATE_LABELS[exam.state]}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{exam.courseTitle}</p>
      {exam.description && <p className="mt-4 max-w-prose">{exam.description}</p>}

      <dl className="mt-6 grid max-w-md grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        {rules.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        {exam.topics.length > 0 && (
          <>
            <dt className="text-muted-foreground">Topics</dt>
            <dd>{exam.topics.join(", ")}</dd>
          </>
        )}
      </dl>

      <section className="mt-8">
        {user.role !== "student" ? (
          <p className="text-sm text-muted-foreground">Staff take exams through “Take it as a student” in the builder.</p>
        ) : exam.inProgressId ? (
          <EnterForm examId={exam.id} requireCode={s.requireCode} resume />
        ) : exam.state === "open" && exam.attemptsLeft > 0 ? (
          <EnterForm examId={exam.id} requireCode={s.requireCode} resume={false} />
        ) : exam.state === "open" ? (
          <p className="text-sm text-muted-foreground">You’ve used all your attempts.</p>
        ) : exam.state === "scheduled" ? (
          <p className="text-sm text-muted-foreground">This exam isn’t open yet. Check back when your instructor opens it.</p>
        ) : null}
      </section>

      {exam.attempts.some((a) => a.state !== "in_progress") && (
        <section className="mt-10">
          <h2 className="mb-2 font-medium">Your attempts</h2>
          <ul className="divide-y rounded-lg border text-sm">
            {exam.attempts
              .filter((a) => a.state !== "in_progress")
              .map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-2">
                  <time dateTime={a.startedAt}>{new Date(a.startedAt).toLocaleString()}</time>
                  <Link href={`/exams/${exam.id}/results/${a.id}`} className="ml-auto underline">
                    View results
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      )}
    </>
  );
}
