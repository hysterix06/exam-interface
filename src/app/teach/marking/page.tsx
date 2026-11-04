import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Row, RowList } from "@/components/ui/row-list";
import { plural } from "@/lib/format";
import { requireStaff } from "@/server/access";
import { listReviewExams } from "@/server/review";

export const metadata: Metadata = { title: "Marking" };

export default async function MarkingPage() {
  const { scope } = await requireStaff();
  const exams = await listReviewExams(scope);
  const total = exams.reduce((s, e) => s + e.pending, 0);
  return (
    <>
      <PageHeader
        title="Marking"
        description={total ? `${plural(total, "written answer")} waiting. Students stay anonymous while you mark, one question at a time.` : undefined}
      />
      {exams.length === 0 ? (
        <EmptyState>Nothing to mark. You’re all caught up.</EmptyState>
      ) : (
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
      )}
    </>
  );
}
