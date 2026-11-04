import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ReviewQueue } from "@/components/review/review-queue";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireStaff } from "@/server/access";
import { getExam } from "@/server/authoring/data";
import { loadReviewQueue } from "@/server/review";

export const metadata: Metadata = { title: "Marking" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function MarkExamPage({ params, searchParams }: PageProps<"/teach/marking/[examId]">) {
  const { scope } = await requireStaff();
  const { examId } = await params;
  if (!z.guid().safeParse(examId).success) notFound();
  const exam = await getExam(scope, examId);
  if (!exam) notFound();
  const sp = await searchParams;
  const reveal = first(sp.names) === "1";
  const queue = await loadReviewQueue(scope, examId, first(sp.q), reveal);

  const link = (q: string | undefined, names: boolean) => `/teach/marking/${examId}?${q ? `q=${q}&` : ""}${names ? "names=1" : ""}`;

  return (
    <>
      <PageHeader
        back={{ href: "/teach/marking", label: "Marking" }}
        title={exam.title}
        actions={
          queue.questions.length > 0 ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={link(queue.current, !reveal)}>{reveal ? "Hide names" : "Show names"}</Link>
            </Button>
          ) : null
        }
      />
      {queue.questions.length === 0 ? (
        <EmptyState
          action={
            <Button asChild variant="outline">
              <Link href={`/teach/exams/${examId}/run`}>Go to the exam</Link>
            </Button>
          }
        >
          Everything in this exam is marked. Release results from the exam’s Run tab when you’re ready.
        </EmptyState>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[15rem_1fr]">
          <nav aria-label="Questions to mark" className="grid content-start gap-1 text-sm">
            {queue.questions.map((q) => (
              <Link
                key={q.questionId}
                href={link(q.questionId, reveal)}
                aria-current={q.questionId === queue.current ? "page" : undefined}
                className="rounded-md px-3 py-2 text-muted-foreground hover:bg-muted aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
              >
                <span className="line-clamp-2">{q.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{q.count} to mark</span>
              </Link>
            ))}
          </nav>
          <ReviewQueue key={queue.current} items={queue.items} />
        </div>
      )}
    </>
  );
}
