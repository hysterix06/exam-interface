import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { STATE_LABELS } from "@/engine/exam-state";
import { requireRole } from "@/server/auth";
import { listStudentExams } from "@/server/attempts/student";

export default async function ExamsPage() {
  const user = await requireRole();
  const exams = await listStudentExams(user);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Your exams</h1>
      {exams.length === 0 ? (
        <p className="mt-6 max-w-prose text-sm text-muted-foreground">
          {user.role === "student"
            ? "Nothing here yet. Exams appear once your instructor publishes them."
            : "Staff aren't enrolled in courses. Open an exam in the builder and choose “Take it as a student”."}
        </p>
      ) : (
        <ul className="mt-6 grid gap-3">
          {exams.map((e) => (
            <li key={e.id}>
              <Link href={`/exams/${e.id}`} className="block rounded-lg border p-4 hover:bg-muted/40">
                <div className="flex items-center gap-3">
                  <span className="font-medium">{e.title}</span>
                  <Badge tone={e.state === "open" ? "success" : "neutral"}>{STATE_LABELS[e.state]}</Badge>
                  {e.inProgressId && <Badge tone="warning">In progress</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {e.courseTitle} · {e.questionCount} questions
                  {e.settings.timeLimitMinutes ? ` · ${e.settings.timeLimitMinutes} min` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
