import { z } from "zod";
import { toCsv } from "@/engine/csv";
import { getCurrentUser } from "@/server/auth";
import { listExamAttempts } from "@/server/admin/data";
import { getExam } from "@/server/authoring/data";

// A route handler isn't covered by requireRole() in a layout, so it checks itself.
export async function GET(_req: Request, ctx: RouteContext<"/admin/exams/[id]/export">) {
  const user = await getCurrentUser();
  if (!user || user.role === "student") return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const exam = await getExam(user.orgId, id);
  if (!exam) return new Response("Not found", { status: 404 });

  const rows = await listExamAttempts(user.orgId, id);
  const csv = toCsv([
    ["Student", "Email", "Status", "Score", "Out of", "Percent", "Started", "Submitted"],
    ...rows.map((r) => [
      r.name ?? "",
      r.email,
      r.state,
      r.score,
      r.maxScore,
      r.score !== null && r.maxScore ? Math.round((r.score / r.maxScore) * 1000) / 10 : null,
      r.startedAt.toISOString(),
      r.submittedAt?.toISOString() ?? "",
    ]),
  ]);
  const name = exam.title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "exam";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-results.csv"`,
    },
  });
}
