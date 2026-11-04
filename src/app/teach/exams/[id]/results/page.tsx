import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LocalTime } from "@/components/ui/local-time";
import { Section } from "@/components/ui/section";
import { Stat, StatGrid } from "@/components/ui/stat";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtNum } from "@/engine/grading/format";
import { percent } from "@/lib/format";
import { listExamAttempts, listExamHistory } from "@/server/run/data";
import { workspaceExam } from "@/server/teach/exam";

export const metadata: Metadata = { title: "Results" };

const STATE: Record<string, { label: string; tone: "neutral" | "warning" | "strong" }> = {
  in_progress: { label: "In progress", tone: "neutral" },
  submitted: { label: "Needs marking", tone: "warning" },
  graded: { label: "Graded", tone: "strong" },
};

function median(xs: number[]) {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export default async function ResultsPage({ params }: PageProps<"/teach/exams/[id]/results">) {
  const { id } = await params;
  const { scope, exam } = await workspaceExam(id);
  if (exam.state === "draft") redirect(`/teach/exams/${id}/verify`);
  const [rows, history] = await Promise.all([listExamAttempts(scope, id), listExamHistory(scope, id)]);

  const graded = rows.filter((r) => r.state === "graded");
  const pcts = graded.map((r) => percent(r.score, r.maxScore)).filter((p): p is number => p !== null);
  const toMark = rows.filter((r) => r.state === "submitted").length;
  const base = `/teach/exams/${id}`;

  return (
    <>
      <StatGrid className="mb-10">
        <Stat label="Attempts" value={rows.length} />
        <Stat label="Average" value={pcts.length ? `${Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length)}%` : "—"} hint={pcts.length ? `${graded.length} graded` : undefined} />
        <Stat label="Median" value={pcts.length ? `${Math.round(median(pcts)!)}%` : "—"} />
        <Stat label="To mark" value={toMark} href={toMark ? `/teach/marking/${id}` : undefined} />
      </StatGrid>

      <Section
        title="Students"
        actions={
          rows.length > 0 ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href={`${base}/results/analysis`}>Item analysis</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href={`${base}/results/regrade`}>Regrade</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href={`${base}/export`}>Export CSV</a>
              </Button>
            </>
          ) : null
        }
      >
        {rows.length === 0 ? (
          <EmptyState>No student has started this exam yet.</EmptyState>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Student</TH>
                <TH>Status</TH>
                <TH className="text-right">Score</TH>
                <TH className="text-right">%</TH>
                <TH>Submitted</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link href={`${base}/results/${r.id}`} className="font-medium hover:underline">
                      {r.name ?? r.email}
                    </Link>
                  </TD>
                  <TD>
                    <Badge tone={STATE[r.state].tone}>{STATE[r.state].label}</Badge>
                  </TD>
                  <TD className="text-right tabular-nums">{r.score !== null ? `${fmtNum(r.score)} / ${fmtNum(r.maxScore ?? 0)}` : "—"}</TD>
                  <TD className="text-right tabular-nums">{r.state === "graded" ? (percent(r.score, r.maxScore) ?? "—") : "—"}</TD>
                  <TD className="whitespace-nowrap text-muted-foreground">{r.submittedAt ? <LocalTime iso={r.submittedAt.toISOString()} /> : "—"}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Section>

      {history.length > 0 && (
        <Section title="History" description="Everything staff have done to this exam.">
          <ol className="grid gap-2 text-sm">
            {history.map((h) => (
              <li key={h.id} className="grid grid-cols-[9rem_1fr] gap-3">
                <span className="text-muted-foreground">
                  <LocalTime iso={h.ts.toISOString()} />
                </span>
                <span>
                  <span className="font-medium">{h.actor ?? h.actorEmail ?? "System"}</span> {describeAction(h.action)}
                  {h.reason ? <span className="text-muted-foreground"> · “{h.reason}”</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </>
  );
}

const ACTIONS: Record<string, string> = {
  "exam.create": "created the exam",
  "exam.update": "edited the draft",
  "exam.publish": "published it",
  "exam.unpublish": "moved it back to draft",
  "exam.open": "opened it",
  "exam.closed": "closed it",
  "exam.graded": "marked it graded",
  "exam.released": "released results",
  "exam.schedule": "changed the window",
  "exam.codes": "generated access codes",
  "exam.regrade": "regraded a question",
  "extension.add": "granted extra time",
  "extension.remove": "removed extra time",
};

function describeAction(action: string) {
  return ACTIONS[action] ?? action.replace(/[._]/g, " ");
}
