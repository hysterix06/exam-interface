import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ResultsView } from "@/components/exam/results-view";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/server/auth";
import { loadResults } from "@/server/attempts/results";

export const metadata: Metadata = { title: "Results" };

export default async function ResultsPage({ params }: PageProps<"/exams/[id]/results/[attemptId]">) {
  const user = await requireRole();
  const { id, attemptId } = await params;
  if (!z.guid().safeParse(attemptId).success) notFound();

  const results = await loadResults(user, attemptId);
  if (!results || results.examId !== id) notFound();

  // Staff only ever see their own previews here; send them back to the exam.
  const back = results.isPreview ? { href: `/teach/exams/${id}/verify`, label: "Back to the exam" } : { href: `/exams/${id}`, label: "Exam" };

  return (
    <>
      <PageHeader back={back} title={results.title} meta={results.isPreview ? <Badge tone="brand">Preview</Badge> : undefined} />
      {results.hidden ? (
        <EmptyState
          action={
            <Link href="/" className="text-sm underline underline-offset-4">
              Back to your exams
            </Link>
          }
        >
          <span className="block font-medium text-foreground">Submitted.</span>
          Results aren’t released yet. They’ll appear here, and under Results, when your instructor releases them.
        </EmptyState>
      ) : (
        <ResultsView score={results.score} max={results.max} pendingReview={results.pendingReview} items={results.items} />
      )}
    </>
  );
}
