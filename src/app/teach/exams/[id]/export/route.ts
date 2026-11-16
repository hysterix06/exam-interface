import { z } from "zod";
import { toCsv } from "@/engine/csv";
import { ITEM_HEADER, itemRows, SUMMARY_HEADER, summaryRows } from "@/engine/export";
import { scopeFor } from "@/server/access";
import { getCurrentUser } from "@/server/auth";
import { getExam } from "@/server/authoring/data";
import { listExportItems, listExportSummary } from "@/server/run/data";

// A route handler isn't covered by requireRole() in a layout, so it checks itself.
// ?format=items gives one row per answer instead of one per student.
export async function GET(req: Request, ctx: RouteContext<"/teach/exams/[id]/export">) {
  const user = await getCurrentUser();
  if (!user || user.role === "student") return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (!z.guid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const scope = await scopeFor(user);
  const exam = await getExam(scope, id);
  if (!exam) return new Response("Not found", { status: 404 });

  const items = new URL(req.url).searchParams.get("format") === "items";
  const csv = items
    ? toCsv([ITEM_HEADER, ...itemRows(await listExportItems(scope, id))])
    : toCsv([SUMMARY_HEADER, ...summaryRows(await listExportSummary(scope, id))]);
  const name = exam.title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "exam";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${items ? "answers" : "results"}.csv"`,
    },
  });
}
