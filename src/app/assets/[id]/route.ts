import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { assetForViewer, SIGNED_URL_SECONDS, signedAssetUrl } from "@/server/assets";

// Every image or workbook in a question is fetched through here: the viewer's
// access is checked, then they're sent to a short-lived signed URL. Questions
// store only the asset id, so nothing in an instance is a guessable link.
export async function GET(req: Request, ctx: RouteContext<"/assets/[id]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not found", { status: 404 });
  const { id } = await ctx.params;
  if (!z.guid().safeParse(id).success) return new Response("Not found", { status: 404 });
  const asset = await assetForViewer(user, id);
  if (!asset) return new Response("Not found", { status: 404 });
  const download = new URL(req.url).searchParams.has("download") ? asset.fileName : undefined;
  const url = await signedAssetUrl(asset.path, download);
  if (!url) return new Response("Unavailable", { status: 503 });
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": `private, max-age=${SIGNED_URL_SECONDS - 60}` },
  });
}
