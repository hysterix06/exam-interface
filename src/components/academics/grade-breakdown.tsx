import Link from "next/link";
import { Stat } from "@/components/ui/stat";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { courseGradeExplanation, type CourseGrade, type GradebookItem } from "@/engine/gradebook/course-grade";
import { fmtNum } from "@/engine/grading/format";

const pct = (n: number | null) => (n === null ? "—" : `${fmtNum(Math.round(n * 10) / 10)}%`);

/** The course grade, the weights behind it, and every item with what it contributed. */
export function GradeBreakdown({
  grade,
  items,
  hrefFor,
  statusFor,
}: {
  grade: CourseGrade;
  items: GradebookItem[];
  hrefFor: (i: GradebookItem) => string;
  /** What to say for an item without a score ("Not released", "Missing"). */
  statusFor: (i: GradebookItem) => string;
}) {
  const byCat = new Map(grade.categories.map((c) => [c.id, c]));
  const groups = [
    ...grade.categories.map((c) => ({ id: c.id, title: `${c.name} · ${fmtNum(c.weight)}%`, items: items.filter((i) => i.categoryId === c.id) })),
    { id: "none", title: grade.categories.length ? "Not counted" : "Everything", items: items.filter((i) => grade.categories.length === 0 || grade.uncounted.includes(i.id)) },
  ].filter((g) => g.items.length > 0 || byCat.has(g.id));

  return (
    <div className="grid gap-10">
      <div className="grid gap-x-8 gap-y-8 sm:grid-cols-[12rem_1fr]">
        <Stat label="Course grade so far" value={pct(grade.percent)} explain={courseGradeExplanation(grade)} />
        <ul className="grid content-start gap-1.5 border-t border-foreground/20 pt-4 text-sm text-muted-foreground">
          {grade.lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </div>
      {groups.map((g) => {
        const c = byCat.get(g.id);
        return (
          <section key={g.id} aria-label={g.title}>
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <h3 className="font-medium">{g.title}</h3>
              {c && (
                <p className="text-sm text-muted-foreground tabular-nums">
                  {pct(c.percent)}
                  {c.dropLowest > 0 ? ` · lowest ${c.dropLowest} dropped` : ""}
                </p>
              )}
            </div>
            {g.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing in this category yet.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Item</TH>
                    <TH className="text-right">Score</TH>
                  </TR>
                </THead>
                <tbody>
                  {g.items.map((i) => {
                    const dropped = c?.dropped.includes(i.id);
                    return (
                      <TR key={i.id}>
                        <TD>
                          <Link href={hrefFor(i)} className="hover:underline">
                            {i.title}
                          </Link>
                          <span className="ml-2 text-xs text-muted-foreground">{i.kind === "exam" ? "Exam" : "Assignment"}</span>
                          {dropped && <span className="ml-2 text-xs text-muted-foreground">· dropped</span>}
                        </TD>
                        <TD className="text-right tabular-nums">
                          {i.excused ? (
                            <span className="text-muted-foreground">Excused</span>
                          ) : i.score === null ? (
                            <span className="text-muted-foreground">{statusFor(i)}</span>
                          ) : (
                            <>
                              {fmtNum(i.score)} / {fmtNum(i.max)}
                            </>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>
            )}
          </section>
        );
      })}
    </div>
  );
}
