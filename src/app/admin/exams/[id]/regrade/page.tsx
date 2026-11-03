import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { RegradeTool } from "@/components/admin/regrade-tool";
import { requireRole } from "@/server/auth";
import { listExamAttempts } from "@/server/admin/data";
import { listRegradable } from "@/server/admin/regrade";
import { getExam } from "@/server/authoring/data";

export default async function RegradePage({ params }: PageProps<"/admin/exams/[id]/regrade">) {
  const user = await requireRole("admin", "instructor");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const exam = await getExam(user.orgId, id);
  if (!exam) notFound();
  const [questions, attempts] = await Promise.all([listRegradable(user.orgId, id), listExamAttempts(user.orgId, id)]);

  return (
    <>
      <Link href={`/admin/exams/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
        ← {exam.title}
      </Link>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">Regrade</h1>
      <p className="mt-2 mb-6 max-w-prose text-sm text-muted-foreground">
        Fixed an answer key? Edit the question (that saves a new version), then regrade here. You see exactly who changes before anything is written.
      </p>
      <RegradeTool examId={id} questions={questions} names={Object.fromEntries(attempts.map((a) => [a.id, a.name ?? a.email]))} />
    </>
  );
}
