import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ResultsView } from "@/components/exam/results-view";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/server/auth";
import { loadResults } from "@/server/attempts/results";

export default async function ResultsPage({ params }: PageProps<"/exams/[id]/results/[attemptId]">) {
  const user = await requireRole();
  const { id, attemptId } = await params;
  if (!z.uuid().safeParse(attemptId).success) notFound();

  const results = await loadResults(user, attemptId);
  if (!results || results.examId !== id) notFound();

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{results.title}</h1>
        {results.isPreview && <Badge tone="signal">Preview</Badge>}
      </div>
      {results.hidden ? (
        <div className="max-w-prose rounded-lg border border-dashed p-8">
          <p className="font-medium">Your attempt is submitted.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Results aren’t released yet. You’ll see them here when your instructor releases them.
          </p>
          <Link href="/exams" className="mt-4 inline-block text-sm underline">
            Back to your exams
          </Link>
        </div>
      ) : (
        <ResultsView score={results.score} max={results.max} pendingReview={results.pendingReview} items={results.items} />
      )}
    </>
  );
}
