import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ReviewQueue } from "@/components/review/review-queue";
import { requireRole } from "@/server/auth";
import { loadReviewQueue } from "@/server/review";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ReviewPage({ params, searchParams }: PageProps<"/admin/review/[examId]">) {
  const user = await requireRole("admin", "instructor");
  const { examId } = await params;
  if (!z.uuid().safeParse(examId).success) notFound();
  const sp = await searchParams;
  const reveal = first(sp.names) === "1";
  const queue = await loadReviewQueue(user.orgId, examId, first(sp.q), reveal);

  const link = (q: string | undefined, names: boolean) => `/admin/review/${examId}?${q ? `q=${q}&` : ""}${names ? "names=1" : ""}`;

  return (
    <>
      <div className="mb-6 flex items-center gap-4">
        <Link href="/admin/review" className="text-sm text-muted-foreground hover:text-foreground">
          ← Marking queue
        </Link>
        <Link href={link(queue.current, !reveal)} className="ml-auto text-sm underline">
          {reveal ? "Hide student names" : "Show student names"}
        </Link>
      </div>
      {queue.questions.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Nothing left to mark for this exam.</div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
          <nav aria-label="Questions to mark" className="grid content-start gap-1 text-sm">
            {queue.questions.map((q) => (
              <Link
                key={q.questionId}
                href={link(q.questionId, reveal)}
                aria-current={q.questionId === queue.current ? "page" : undefined}
                className="rounded-md border px-3 py-2 hover:bg-muted/40 aria-[current=page]:border-foreground"
              >
                <span className="line-clamp-2">{q.label}</span>
                <span className="text-xs text-muted-foreground">{q.count} to mark</span>
              </Link>
            ))}
          </nav>
          <ReviewQueue key={queue.current} items={queue.items} />
        </div>
      )}
    </>
  );
}
