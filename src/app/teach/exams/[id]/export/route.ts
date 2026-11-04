import { z } from "zod";
import { toCsv } from "@/engine/csv";
import { scopeFor } from "@/server/access";
import { getCurrentUser } from "@/server/auth";
import { getExam } from "@/server/authoring/data";
import { listExamAttempts } from "@/server/run/data";

// A route handler isn't covered by requireRole() in a layout, so it checks itself.
export async function GET(_req: Request, ctx: RouteContext<"/teach/exams/[id]/export">) {
  const user = await getCurrentUser();
  if (!user || user.role === "student") return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (!z.guid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const scope = await scopeFor(user);
  const exam = await getExam(scope, id);
  if (!exam) return new Response("Not found", { status: 404 });

  const rows = await listExamAttempts(scope, id);
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
