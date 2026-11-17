import type { loadAttemptDetail } from "@/server/run/data";
import { getQuestionType } from "@/question-types/registry";
import type { AttemptViewProps } from "./attempt-view";

type Detail = NonNullable<Awaited<ReturnType<typeof loadAttemptDetail>>>;

/** Loader output -> AttemptView props. Redacts on the server, so keys never ride along twice. */
export function attemptViewProps(d: Detail): AttemptViewProps {
  return {
    student: d.student,
    examTitle: d.exam.title,
    seed: d.attempt.seed,
    state: d.attempt.state,
    score: d.attempt.score,
    maxScore: d.attempt.maxScore,
    isPreview: d.attempt.isPreview,
    signals: d.signals,
    reproduction: d.reproduction,
    canOverride: d.attempt.state !== "in_progress",
    latePenalty: (d.attempt.latePenalty as { explanation: string; points: number } | null) ?? null,
    mastery: d.mastery,
    items: d.items.map((i) => ({
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
      overrideReason: i.overrideReason,
      vars: i.vars,
      seconds: i.seconds,
      why: (i.selection as { reason?: string } | null)?.reason ?? null,
    })),
  };
}
