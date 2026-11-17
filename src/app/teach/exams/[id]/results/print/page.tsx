import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AttemptView } from "@/components/run/attempt-view";
import { attemptViewProps } from "@/components/run/attempt-view-props";
import { PrintButton } from "@/components/run/print-button";
import { EmptyState } from "@/components/ui/empty-state";
import { listExamAttempts, loadAttemptDetail } from "@/server/run/data";
import { workspaceExam } from "@/server/teach/exam";

export const metadata: Metadata = { title: "Print all attempts" };

/** Attempts per printed batch: enough for a class, small enough to render quickly. */
const PER_PAGE = 100;
/** Detail loads in flight at once, so a big class doesn't swamp the database. */
const CONCURRENCY = 8;

async function inBatches<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < xs.length; i += n) out.push(...(await Promise.all(xs.slice(i, i + n).map(f))));
  return out;
}

export default async function PrintAllPage({ params, searchParams }: PageProps<"/teach/exams/[id]/results/print">) {
  const { id } = await params;
  const sp = await searchParams;
  const { scope, exam } = await workspaceExam(id);
  if (exam.state === "draft") redirect(`/teach/exams/${id}/verify`);

  const rows = (await listExamAttempts(scope, id)).filter((r) => r.state !== "in_progress");
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const page = Math.min(pages, Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1));
  const slice = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const details = (await inBatches(slice, CONCURRENCY, (r) => loadAttemptDetail(scope, id, r.id, { reproduce: false }))).filter((d) => d !== null);
  const base = `/teach/exams/${id}/results`;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3 print:hidden">
        <Link href={base} className="text-sm text-muted-foreground hover:text-foreground">
          ← Results
        </Link>
        <p className="text-sm text-muted-foreground">
          {details.length === 0
            ? "Nothing to print yet."
            : `${details.length} finished ${details.length === 1 ? "attempt" : "attempts"}${pages > 1 ? ` (batch ${page} of ${pages})` : ""}, one per printed page.`}
        </p>
        {details.length > 0 && (
          <span className="ml-auto">
            <PrintButton label="Print all / save as PDF" />
          </span>
        )}
      </div>
      {pages > 1 && (
        <nav aria-label="Batches" className="mb-6 flex flex-wrap gap-2 text-sm print:hidden">
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <Link key={n} href={`${base}/print?page=${n}`} aria-current={n === page ? "page" : undefined} className={n === page ? "font-semibold" : "text-brand hover:underline"}>
              Batch {n}
            </Link>
          ))}
        </nav>
      )}
      {details.length === 0 ? (
        <EmptyState>No student has finished this exam yet.</EmptyState>
      ) : (
        <div className="grid gap-16 print:gap-0">
          {details.map((d) => (
            <AttemptView key={d.attempt.id} {...attemptViewProps(d)} printMode />
          ))}
        </div>
      )}
    </>
  );
}
