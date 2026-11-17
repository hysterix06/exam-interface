import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { MIN_SHARED, RARE_SHARE, TEXT_OVERLAP } from "@/engine/similarity";
import { loadSignals } from "@/server/run/signals";
import { workspaceExam } from "@/server/teach/exam";

export const metadata: Metadata = { title: "Similarity signals" };

export default async function SignalsPage({ params }: PageProps<"/teach/exams/[id]/results/signals">) {
  const { id } = await params;
  const { scope } = await workspaceExam(id);
  const s = await loadSignals(scope, id);
  if (!s) notFound();
  const base = `/teach/exams/${id}/results`;

  return (
    <>
      <PageHeader
        className="mb-6"
        back={{ href: base, label: "Results" }}
        title={<span className="text-xl">Similarity signals</span>}
        description={`Pairs of students whose answers are unusually alike, across ${s.students} finished ${s.students === 1 ? "attempt" : "attempts"}. A signal to look into, never proof and never a penalty.`}
      />
      <p className="mb-6 max-w-prose text-sm text-muted-foreground">
        Everyone gets different numbers and option orders, so matching right answers mean little. What is listed: the same wrong answer on at least {MIN_SHARED} questions where
        no more than {Math.round(RARE_SHARE * 100)}% of the class gave it, or written answers sharing at least {Math.round(TEXT_OVERLAP * 100)}% of their five-word phrases.
      </p>
      {s.pairs.length === 0 ? (
        <EmptyState>No pair of students stands out.</EmptyState>
      ) : (
        <ul className="grid gap-4">
          {s.pairs.map((p) => (
            <li key={`${p.a}-${p.b}`} className="rounded-lg border p-4">
              <p className="font-medium">
                <Link className="text-brand underline-offset-2 hover:underline" href={`${base}/${p.a}`}>
                  {p.nameA}
                </Link>{" "}
                and{" "}
                <Link className="text-brand underline-offset-2 hover:underline" href={`${base}/${p.b}`}>
                  {p.nameB}
                </Link>
              </p>
              <ul className="mt-1 text-sm">
                {p.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-muted-foreground">Which questions</summary>
                <ul className="mt-1 grid gap-1 text-muted-foreground">
                  {p.evidence.map((e, i) => (
                    <li key={i}>
                      {e.question}: {e.detail}
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
