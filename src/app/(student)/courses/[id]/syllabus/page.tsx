import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/empty-state";
import { Prose } from "@/components/ui/prose";
import { Section } from "@/components/ui/section";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { fmtNum } from "@/engine/grading/format";
import { courseForPage } from "@/server/student/pages";

export const metadata: Metadata = { title: "Syllabus" };

export default async function CourseSyllabus({ params }: PageProps<"/courses/[id]/syllabus">) {
  const { id } = await params;
  const { course } = await courseForPage(id);
  const dates = [course.startsOn, course.endsOn].every(Boolean)
    ? `${new Date(course.startsOn!).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })} – ${new Date(course.endsOn!).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })}`
    : null;
  return (
    <>
      {dates && <p className="mb-8 text-sm text-muted-foreground">Runs {dates}</p>}
      {course.syllabus ? <Prose className="max-w-prose">{course.syllabus}</Prose> : <EmptyState>Your teacher hasn’t posted a syllabus yet.</EmptyState>}

      <Section title="How your grade is worked out" description="Each category counts for its share of the course grade.">
        {course.categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">No weights are set, so every graded item counts by its points.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Category</TH>
                <TH className="text-right">Weight</TH>
                <TH>Notes</TH>
              </TR>
            </THead>
            <tbody>
              {course.categories.map((c) => (
                <TR key={c.id}>
                  <TD className="font-medium">{c.name}</TD>
                  <TD className="text-right tabular-nums">{fmtNum(c.weight)}%</TD>
                  <TD className="text-muted-foreground">{c.dropLowest > 0 ? `Lowest ${c.dropLowest} dropped` : ""}</TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </>
  );
}
