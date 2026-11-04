import Link from "next/link";
import { ExamStateBadge } from "@/components/teach/exam-state-badge";
import { LinkTabs } from "@/components/ui/link-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { workspaceExam } from "@/server/teach/exam";

/** One exam, one place: build it, verify it, run it, then read the results. */
export default async function ExamWorkspaceLayout({ children, params }: LayoutProps<"/teach/exams/[id]">) {
  const { id } = await params;
  const { exam, course, effective } = await workspaceExam(id);
  const base = `/teach/exams/${id}`;
  const draft = exam.state === "draft";

  return (
    <>
      <PageHeader
        back={{ href: "/teach/exams", label: "Exams" }}
        title={exam.title}
        meta={<ExamStateBadge state={effective} />}
        description={
          course ? (
            <Link href={`/teach/courses/${course.id}`} className="hover:text-foreground">
              {course.code ? `${course.code} · ${course.title}` : course.title}
            </Link>
          ) : undefined
        }
        className="mb-6"
      />
      <LinkTabs
        label="Exam"
        tabs={[
          { href: base, label: "Build", exact: true },
          { href: `${base}/verify`, label: "Verify" },
          { href: `${base}/run`, label: "Run", disabledReason: draft ? "Publish the exam first" : undefined },
          { href: `${base}/results`, label: "Results", disabledReason: draft ? "Publish the exam first" : undefined },
        ]}
      />
      {children}
    </>
  );
}
