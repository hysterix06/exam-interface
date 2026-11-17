import type { Metadata } from "next";
import Link from "next/link";
import { CourseDetailsForm } from "@/components/teach/course/details-form";
import { workspaceCourse } from "@/server/teach/course";

export const metadata: Metadata = { title: "Course homepage" };

export default async function CourseDetailsPage({ params }: PageProps<"/teach/courses/[id]/details">) {
  const { id } = await params;
  const { course } = await workspaceCourse(id);
  return (
    <>
      <p className="mb-8 text-sm text-muted-foreground">
        What students see on the course page. Grade weights are on the{" "}
        <Link href={`/teach/courses/${id}/grading`} className="text-brand underline underline-offset-4">
          Grading
        </Link>{" "}
        tab.
      </p>
      <CourseDetailsForm
        courseId={id}
        initial={{ description: course.description, syllabus: course.syllabus, term: course.term, startsOn: course.startsOn, endsOn: course.endsOn, info: course.info }}
      />
    </>
  );
}
