import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AttemptView } from "@/components/admin/attempt-view";
import { getQuestionType } from "@/question-types/registry";
import { requireRole } from "@/server/auth";
import { loadAttemptDetail } from "@/server/admin/data";

export default async function AttemptDetailPage({ params }: PageProps<"/admin/exams/[id]/attempts/[attemptId]">) {
  const user = await requireRole("admin", "instructor");
  const { id, attemptId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(attemptId).success) notFound();
  const d = await loadAttemptDetail(user.orgId, id, attemptId);
  if (!d) notFound();

  return (
    <>
      <Link href={`/admin/exams/${id}`} className="text-sm text-muted-foreground hover:text-foreground print:hidden">
        ← {d.exam.title}
      </Link>
      <div className="mt-3">
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
      </div>
    </>
  );
}
