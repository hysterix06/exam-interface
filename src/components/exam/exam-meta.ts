import { plural } from "@/lib/format";
import type { StudentExam } from "@/server/attempts/student";

/** "12 questions · 40 minutes · 2 attempts" */
export function examMeta(e: StudentExam) {
  return [
    plural(e.questionCount, "question"),
    e.settings.timeLimitMinutes ? `${e.settings.timeLimitMinutes} minutes` : "No time limit",
    e.settings.attemptsAllowed > 1 ? plural(e.settings.attemptsAllowed, "attempt") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
