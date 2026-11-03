import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { exams, questions, topics } from "@/db/schema";
import { requireRole } from "@/server/auth";

export default async function AuthorPage() {
  const user = await requireRole("admin", "instructor");
  const [[t], [q], [e]] = await Promise.all([
    db.select({ n: count() }).from(topics).where(eq(topics.orgId, user.orgId)),
    db.select({ n: count() }).from(questions).where(eq(questions.orgId, user.orgId)),
    db.select({ n: count() }).from(exams).where(eq(exams.orgId, user.orgId)),
  ]);

  const steps = [
    { href: "/author/topics", label: "Add topics", done: t.n > 0, hint: "Group questions by what they test, e.g. Cell Biology." },
    { href: "/author/questions/new", label: "Write questions", done: q.n > 0, hint: "Each one shows a live preview, its answer key and how it will be graded." },
    { href: "/author/exams", label: "Build an exam", done: e.n > 0, hint: "Say how many questions to draw from each topic. The app explains what each student will get." },
  ];

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Authoring</h1>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">
        Build questions, group them by topic, then assemble exams. Nothing is published until pre-flight passes.
      </p>
      <ol className="mt-8 grid gap-3">
        {steps.map((s, i) => (
          <li key={s.href}>
            <Link href={s.href} className="flex items-start gap-4 rounded-lg border p-4 hover:bg-muted/50">
              <span
                className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs data-[done=true]:border-success data-[done=true]:text-success"
                data-done={s.done}
              >
                {s.done ? "✓" : i + 1}
              </span>
              <span>
                <span className="block font-medium">{s.label}</span>
                <span className="text-sm text-muted-foreground">{s.hint}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-sm text-muted-foreground">
        {t.n} topics · {q.n} questions · {e.n} exams
      </p>
    </>
  );
}
