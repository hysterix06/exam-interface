import Link from "next/link";
import { requireRole } from "@/server/auth";
import { listReviewExams } from "@/server/review";

export default async function ReviewIndexPage() {
  const user = await requireRole("admin", "instructor");
  const exams = await listReviewExams(user.orgId);
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Marking queue</h1>
      <p className="mt-2 mb-6 max-w-prose text-sm text-muted-foreground">
        Written answers waiting for a grader. Students stay anonymous while you mark, one question at a time.
      </p>
      {exams.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Nothing to mark. All caught up.</div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {exams.map((e) => (
            <li key={e.id}>
              <Link href={`/admin/review/${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                <span className="flex-1 font-medium">{e.title}</span>
                <span className="text-sm text-muted-foreground">{e.pending} to mark</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
