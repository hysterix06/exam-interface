import type { Metadata } from "next";
import Link from "next/link";
import { AdaptivePanel } from "@/components/authoring/exam-builder/adaptive-panel";
import { VerifyPanel } from "@/components/authoring/exam-builder/verify-panel";
import { PreviewButton, PublishButton } from "@/components/teach/exam-actions";
import { LocalTime } from "@/components/ui/local-time";
import { Notice } from "@/components/ui/notice";
import { Row, RowList } from "@/components/ui/row-list";
import { Section } from "@/components/ui/section";
import { fmtNum } from "@/engine/grading/format";
import { questionLabel } from "@/lib/question-label";
import { lockedPool } from "@/server/attempts/start";
import { loadPool } from "@/server/authoring/data";
import { listMyPreviews, workspaceExam } from "@/server/teach/exam";

export const metadata: Metadata = { title: "Verify exam" };

export default async function VerifyPage({ params }: PageProps<"/teach/exams/[id]/verify">) {
  const { id } = await params;
  const { user, exam, topics, blueprint, settings } = await workspaceExam(id);
  const [pool, previews] = await Promise.all([
    exam.lockedVersions ? lockedPool(exam) : loadPool(exam.orgId, exam.courseId),
    listMyPreviews(exam.id, user.id),
  ]);
  const topicNames = Object.fromEntries(topics.map((t) => [t.id, t.name]));
  const questionNames = Object.fromEntries(pool.map((q) => [q.id, questionLabel(q.def, 80)]));
  const questionCount = blueprint.sections.reduce((s, x) => s + x.count, 0);
  const draft = exam.state === "draft";

  return (
    <>
      {draft ? (
        <Section
          title="Publish"
          description="Publishing locks the questions at their current versions. The exam stays closed to students until you open it or its window starts."
        >
          <PublishButton examId={exam.id} disabled={questionCount === 0} />
        </Section>
      ) : (
        <Notice>This exam is published. These checks ran against the questions it’s locked to.</Notice>
      )}

      <Section title="Checks" description="The same checks run on the server when you publish.">
        <VerifyPanel autoRun blueprint={blueprint} settings={settings} pool={pool} topicNames={topicNames} questionNames={questionNames} />
      </Section>

      <Section title="Try it yourself" description="Sit the exam exactly as a student would. Previews are marked as such and never count.">
        <PreviewButton examId={exam.id} disabled={questionCount === 0} />
        {previews.length > 0 && (
          <RowList className="mt-4">
            {previews.map((p) => (
              <Row
                key={p.id}
                href={p.state === "in_progress" ? `/attempt/${p.id}` : `/exams/${exam.id}/results/${p.id}`}
                title={<LocalTime iso={p.startedAt.toISOString()} />}
                detail={p.state === "in_progress" ? "Not finished" : undefined}
                aside={
                  p.state === "in_progress" ? (
                    <span className="text-muted-foreground">Resume →</span>
                  ) : (
                    <span className="tabular-nums">
                      {fmtNum(p.score ?? 0)} / {fmtNum(p.maxScore ?? 0)}
                    </span>
                  )
                }
              />
            ))}
          </RowList>
        )}
      </Section>

      <Section
        title="Adaptive preview"
        description="How difficulty stepping would behave on this pool. A preview of the rules only: live exams use the fixed draw."
      >
        <AdaptivePanel pool={pool.filter((q) => blueprint.sections.some((s) => s.topicId === q.topicId))} count={questionCount} questionNames={questionNames} />
      </Section>

      {draft && (
        <p className="mt-12 text-sm text-muted-foreground">
          Something to change? <Link href={`/teach/exams/${exam.id}`} className="underline underline-offset-4">Back to Build</Link>.
        </p>
      )}
    </>
  );
}
