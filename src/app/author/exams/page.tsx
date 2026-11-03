import Link from "next/link";
import { NewExamForm } from "@/components/authoring/new-exam-form";
import { Badge } from "@/components/ui/badge";
import { blueprintSchema } from "@/engine/selection/types";
import { requireRole } from "@/server/auth";
import { listCourses, listExams } from "@/server/authoring/data";

export default async function ExamsPage() {
  const user = await requireRole("admin", "instructor");
  const [exams, courses] = await Promise.all([listExams(user.orgId), listCourses(user.orgId)]);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Exams</h1>

      <div className="mt-6">
        {courses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Create a course on the <Link href="/author/topics" className="underline">Topics</Link> tab first.
          </p>
        ) : (
          <NewExamForm courses={courses.map((c) => ({ id: c.id, title: c.title }))} />
        )}
      </div>

      {exams.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No exams yet. Name one above, then say how many questions to draw from each topic.
        </div>
      ) : (
        <ul className="mt-8 divide-y rounded-lg border">
          {exams.map((e) => {
            const bp = blueprintSchema.safeParse(e.blueprint);
            const n = bp.success ? bp.data.sections.reduce((s, x) => s + x.count, 0) : 0;
            return (
              <li key={e.id}>
                <Link href={`/author/exams/${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                  <span className="flex-1 font-medium">{e.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {e.courseTitle} · {n} {n === 1 ? "question" : "questions"}
                  </span>
                  <Badge tone={e.state === "draft" ? "neutral" : "signal"}>{e.state}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
