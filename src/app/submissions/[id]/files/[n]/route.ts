import { z } from "zod";
import { getCurrentUser } from "@/server/auth";
import { SIGNED_URL_SECONDS, signedSubmissionUrl, submissionFileForViewer } from "@/server/assignments/files";

// Handed-in files are fetched through here: access is checked on every
// request, then the browser is sent to a short-lived signed URL. ?download
// saves the file; otherwise PDFs and images open in place.
export async function GET(req: Request, ctx: RouteContext<"/submissions/[id]/files/[n]">) {
  const user = await getCurrentUser();
  if (!user) return new Response("Not found", { status: 404 });
  const { id, n } = await ctx.params;
  const index = Number(n);
  if (!z.guid().safeParse(id).success || !Number.isInteger(index) || index < 0) return new Response("Not found", { status: 404 });
  const file = await submissionFileForViewer(user, id, index);
  if (!file) return new Response("Not found", { status: 404 });
  const download = new URL(req.url).searchParams.has("download") || !/^(application\/pdf|image\/)/.test(file.mime);
  const url = await signedSubmissionUrl(file, download);
  if (!url) return new Response("Unavailable", { status: 503 });
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": `private, max-age=${SIGNED_URL_SECONDS - 60}` } });
}
