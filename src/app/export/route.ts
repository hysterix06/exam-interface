import { getCurrentUser } from "@/server/auth";
import { writeAudit } from "@/server/authoring/audit";
import { collectData } from "@/server/data-export/collect";
import { exportZip } from "@/server/data-export/zip";

// "Download everything": the signed-in person's data as a ZIP. A route
// handler isn't covered by requireRole() in a layout, so it checks itself.
// ?files=0 leaves out handed-in files.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const withFiles = new URL(req.url).searchParams.get("files") !== "0";
  const data = await collectData(user);
  const zip = await exportZip(data, withFiles);
  await writeAudit({ orgId: user.orgId, actorId: user.id, action: "data.export", entityType: "profile", entityId: user.id, after: { tables: data.manifest.tables, files: withFiles } });
  const stamp = data.manifest.exportedAt.slice(0, 10);
  return new Response(zip as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="modus-${user.role}-${stamp}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
