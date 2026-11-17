import { z } from "zod";
import { toCsv } from "@/engine/csv";
import { canTeach, scopeFor } from "@/server/access";
import { getCurrentUser } from "@/server/auth";
import { getCourse } from "@/server/authoring/data";
import { courseGradebook, gradebookCsvRows } from "@/server/teach/gradebook";

// A route handler isn't covered by requireRole() in a layout, so it checks itself.
export async function GET(_req: Request, ctx: RouteContext<"/teach/courses/[id]/gradebook/export">) {
  const user = await getCurrentUser();
  if (!user || user.role === "student") return new Response("Forbidden", { status: 403 });
  const { id } = await ctx.params;
  if (!z.guid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const scope = await scopeFor(user);
  const course = canTeach(scope, id) ? await getCourse(scope, id) : null;
  if (!course) return new Response("Not found", { status: 404 });
  const csv = toCsv(gradebookCsvRows(await courseGradebook(id)));
  const name = (course.code ?? course.title).replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "course";
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}-gradebook.csv"` } });
}
