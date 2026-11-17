import type { Metadata } from "next";
import Link from "next/link";
import { StaffContact } from "@/components/academics/staff-contact";
import { WorkList } from "@/components/academics/work-list";
import { Prose } from "@/components/ui/prose";
import { Section } from "@/components/ui/section";
import { Stat, StatGrid } from "@/components/ui/stat";
import { fmtNum } from "@/engine/grading/format";
import { workItems } from "@/server/student/academics";
import { courseForPage } from "@/server/student/pages";

export const metadata: Metadata = { title: "Course" };

export default async function CourseOverview({ params }: PageProps<"/courses/[id]">) {
  const { id } = await params;
  const { user, course, exams, assignments } = await courseForPage(id);
  const work = workItems(exams, assignments, new Map([[course.id, course.label]]));
  const next = work.filter((w) => w.group !== "done").slice(0, 4);
  const toDo = work.filter((w) => w.group === "now").length;
  const graded = course.gradeItems.filter((i) => i.score !== null).length;

  return (
    <>
      <StatGrid className="mb-12">
        <Stat label="Course grade so far" value={course.grade.percent === null ? "—" : `${fmtNum(Math.round(course.grade.percent * 10) / 10)}%`} href={`/courses/${id}/grades`} />
        <Stat label="To do now" value={toDo} href={`/courses/${id}/work`} />
        <Stat label="Graded" value={`${graded} of ${course.gradeItems.length}`} href={`/courses/${id}/grades`} />
      </StatGrid>

      {course.description && (
        <Section>
          <Prose>{course.description}</Prose>
        </Section>
      )}

      <Section
        title="Coming up"
        actions={
          <Link href={`/courses/${id}/work`} className="text-sm text-muted-foreground hover:text-foreground">
            All work →
          </Link>
        }
      >
        <WorkList items={next} showCourse={false} empty="Nothing due. Enjoy it." />
      </Section>

      <Section title="Contact">
        <StaffContact teachers={course.teachers} info={course.info} viewerRegion={user.phoneRegion} />
      </Section>
    </>
  );
}
