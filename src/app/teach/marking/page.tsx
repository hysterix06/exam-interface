import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Row, RowList } from "@/components/ui/row-list";
import { plural } from "@/lib/format";
import { requireStaff } from "@/server/access";
import { listAssignmentsToMark } from "@/server/assignments/authoring";
import { listReviewExams } from "@/server/review";
import { Section } from "@/components/ui/section";

export const metadata: Metadata = { title: "Marking" };

export default async function MarkingPage() {
  const { scope } = await requireStaff();
  const [exams, handIns] = await Promise.all([listReviewExams(scope), listAssignmentsToMark(scope)]);
  const total = exams.reduce((s, e) => s + e.pending, 0);
  const handInTotal = handIns.reduce((s, e) => s + e.pending, 0);
  return (
    <>
      <PageHeader
        title="Marking"
        description={
          total || handInTotal
            ? [total ? `${plural(total, "written exam answer")} (students stay anonymous, one question at a time)` : null, handInTotal ? plural(handInTotal, "assignment hand-in") : null].filter(Boolean).join(" and ") + " waiting."
            : undefined
        }
      />
      {handIns.length > 0 && (
        <Section title="Assignments">
          <RowList>
            {handIns.map((a) => (
              <Row key={a.id} href={`/teach/assignments/${a.id}/handins`} title={a.title} detail={a.courseTitle} aside={<span className="tabular-nums">{plural(a.pending, "hand-in")}</span>} />
            ))}
            </RowList>
        </Section>
      )}
      {exams.length === 0 ? (
        handIns.length === 0 && <EmptyState>Nothing to mark. You’re all caught up.</EmptyState>
      ) : (
        <Section title={handIns.length ? "Exams" : undefined}>
          <RowList>
          {exams.map((e) => (
            <Row
              key={e.id}
              href={`/teach/marking/${e.id}`}
              title={e.title}
              detail={e.courseTitle}
              aside={<span className="tabular-nums">{plural(e.pending, "answer")}</span>}
            />
          ))}
          </RowList>
        </Section>
      )}
    </>
  );
}
