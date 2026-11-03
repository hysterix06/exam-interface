import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { STATE_LABELS } from "@/engine/exam-state";
import { requireRole } from "@/server/auth";
import { listAdminExams } from "@/server/admin/data";

export default async function AdminExamsPage() {
  const user = await requireRole("admin", "instructor");
  const exams = await listAdminExams(user.orgId);
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Run exams</h1>
      <p className="mt-2 mb-6 max-w-prose text-sm text-muted-foreground">Published exams. Open one to watch it live, grant extra time, regrade, or export results.</p>
      {exams.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Nothing published yet. Publish an exam from the builder.</div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {exams.map((e) => (
            <li key={e.id}>
              <Link href={`/admin/exams/${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                <span className="flex-1 font-medium">{e.title}</span>
                <span className="text-sm text-muted-foreground">
                  {e.attempts} {e.attempts === 1 ? "attempt" : "attempts"}
                  {e.inProgress > 0 ? `, ${e.inProgress} in progress` : ""}
                </span>
                <Badge tone={e.state === "open" ? "success" : "neutral"}>{STATE_LABELS[e.state]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
