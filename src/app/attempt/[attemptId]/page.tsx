import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { AttemptRunner } from "@/components/exam/attempt-runner";
import { requireRole } from "@/server/auth";
import { loadAttemptForTaking } from "@/server/attempts/take";

export default async function AttemptPage({ params }: PageProps<"/attempt/[attemptId]">) {
  const user = await requireRole();
  const { attemptId } = await params;
  if (!z.guid().safeParse(attemptId).success) notFound();

  const attempt = await loadAttemptForTaking(user, attemptId);
  if (!attempt) notFound();
  if (attempt.finished) redirect(`/exams/${attempt.examId}/results/${attemptId}`);

  return (
    <AttemptRunner
      attemptId={attemptId}
      examId={attempt.examId}
      title={attempt.title}
      isPreview={attempt.isPreview}
      oneWay={attempt.oneWay}
      deadlineAt={attempt.deadlineAt}
      serverNow={attempt.serverNow}
      initialSecondsLeft={attempt.secondsLeft}
      items={attempt.items}
    />
  );
}
