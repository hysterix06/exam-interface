import { cn } from "cn";
import { EmptyState } from "@/components/ui/empty-state";
import { LocalTime } from "@/components/ui/local-time";
import { Row, RowList } from "@/components/ui/row-list";
import type { WorkItem, WorkTone } from "@/server/student/academics";

const TONE: Record<WorkTone, string> = {
  plain: "text-foreground",
  muted: "text-muted-foreground",
  warning: "text-warning",
  danger: "text-destructive",
  success: "text-success",
};

export function WorkStatus({ item }: { item: Pick<WorkItem, "status" | "tone"> }) {
  return <span className={cn("tabular-nums", TONE[item.tone])}>{item.status}</span>;
}

/** Exams and assignments in one list: what it is, where it's from, when, and where you stand. */
export function WorkList({ items, showCourse = true, empty }: { items: WorkItem[]; showCourse?: boolean; empty?: string }) {
  if (items.length === 0) return empty ? <EmptyState>{empty}</EmptyState> : null;
  return (
    <RowList>
      {items.map((w) => (
        <Row
          key={`${w.kind}:${w.id}`}
          href={w.href}
          title={w.title}
          detail={
            <>
              {[w.kind === "exam" ? "Exam" : "Assignment", showCourse ? w.courseLabel : null].filter(Boolean).join(" · ")}
              {w.when && (
                <>
                  {" · "}
                  {w.when.label} <LocalTime iso={w.when.iso} />
                </>
              )}
            </>
          }
          aside={<WorkStatus item={w} />}
        />
      ))}
    </RowList>
  );
}
