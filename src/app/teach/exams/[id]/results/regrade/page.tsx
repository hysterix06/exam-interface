import type { Metadata } from "next";
import Link from "next/link";
import { RegradeTool } from "@/components/run/regrade-tool";
import { PageHeader } from "@/components/ui/page-header";
import { listExamAttempts } from "@/server/run/data";
import { listRegradable } from "@/server/run/regrade";
import { workspaceExam } from "@/server/teach/exam";

export const metadata: Metadata = { title: "Regrade" };

export default async function RegradePage({ params }: PageProps<"/teach/exams/[id]/results/regrade">) {
  const { id } = await params;
  const { scope } = await workspaceExam(id);
  const [questions, attempts] = await Promise.all([listRegradable(scope, id), listExamAttempts(scope, id)]);

  return (
    <>
      <PageHeader
        className="mb-6"
        back={{ href: `/teach/exams/${id}/results`, label: "Results" }}
        title={<span className="text-xl">Regrade</span>}
        description={
          <>
            Fixed an answer key? <Link href="/teach/questions" className="underline underline-offset-4">Edit the question</Link> (that saves a new
            version), then choose it here. You see exactly whose score changes before anything is written.
          </>
        }
      />
      <RegradeTool examId={id} questions={questions} names={Object.fromEntries(attempts.map((a) => [a.id, a.name ?? a.email]))} />
    </>
  );
}
