import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AttemptView } from "@/components/run/attempt-view";
import { getQuestionType } from "@/question-types/registry";
import { loadAttemptDetail } from "@/server/run/data";
import { workspaceExam } from "@/server/teach/exam";

export const metadata: Metadata = { title: "Attempt" };

export default async function AttemptDetailPage({ params }: PageProps<"/teach/exams/[id]/results/[attemptId]">) {
  const { id, attemptId } = await params;
  const { scope } = await workspaceExam(id);
  if (!z.guid().safeParse(attemptId).success) notFound();
  const d = await loadAttemptDetail(scope, id, attemptId);
  if (!d) notFound();

  return (
    <>
      <Link href={`/teach/exams/${id}/results`} className="mb-4 inline-block text-sm text-muted-foreground hover:text-foreground print:hidden">
        ← Results
      </Link>
      <AttemptView
        student={d.student}
        examTitle={d.exam.title}
        seed={d.attempt.seed}
        state={d.attempt.state}
        score={d.attempt.score}
        maxScore={d.attempt.maxScore}
        isPreview={d.attempt.isPreview}
        signals={d.signals}
        reproduction={d.reproduction}
        items={d.items.map((i) => ({
          id: i.id,
          position: i.position,
          type: i.type,
          label: i.label,
          redacted: getQuestionType(i.type).redact(i.instance),
          response: i.response ?? null,
          key: i.key,
          score: i.score,
          max: i.max,
          lines: (i.lines ?? []) as never,
          gradedBy: i.gradedBy,
        }))}
      />
    </>
  );
}
