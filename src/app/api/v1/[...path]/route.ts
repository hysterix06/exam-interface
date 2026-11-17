import { authenticateBearer } from "@/server/api/tokens";
import { matchRoute, NotFound, openApi, paginate } from "@/server/api/v1";

// Read-only personal API. Authenticated by a bearer token only (never the
// session cookie), so a page on another site can't use a signed-in browser.
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } });

export async function GET(req: Request, ctx: RouteContext<"/api/v1/[...path]">) {
  const { path } = await ctx.params;
  const url = new URL(req.url);
  const route = "/" + path.join("/");
  if (route === "/openapi.json") return json(openApi(url.origin));

  const user = await authenticateBearer(req);
  if (!user) return json({ error: "Send a valid token: Authorization: Bearer modus_pat_…" }, 401);
  const m = matchRoute(route);
  if (!m) return json({ error: "No such endpoint. See /api/v1/openapi.json." }, 404);
  try {
    const result = await m.route.handler(user, m.params, url);
    return json(m.route.list ? paginate(result as unknown[], url) : { data: result });
  } catch (e) {
    if (e instanceof NotFound) return json({ error: "Not found." }, 404);
    throw e;
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization", "Access-Control-Allow-Methods": "GET" } });
}
