import { toIcs } from "@/engine/ics";
import { scopeFor } from "@/server/access";
import { userForToken } from "@/server/api/tokens";
import { listCourses } from "@/server/authoring/data";
import { studentAcademics } from "@/server/student/academics";
import { staffCourseCalendar } from "@/server/teach/course";

const PREFIX = { "exam-opens": "Opens: ", "exam-closes": "Closes: ", "assignment-due": "Due: ", event: "" } as const;

// A private iCalendar feed (subscribe from Google, Apple or Outlook). The
// secret is in the URL because calendar apps can't send headers; making a new
// one under Account → Your data turns the old URL off.
export async function GET(req: Request, ctx: RouteContext<"/feeds/[token]">) {
  const { token } = await ctx.params;
  const user = await userForToken(token.replace(/\.ics$/, ""), "calendar");
  if (!user) return new Response("Not found", { status: 404 });
  const items =
    user.role === "student"
      ? (await studentAcademics(user)).calendar
      : (await Promise.all((await listCourses(await scopeFor(user))).map(staffCourseCalendar))).flat();
  const origin = new URL(req.url).origin;
  const ics = toIcs({
    name: `Modus · ${user.fullName ?? user.email}`,
    now: new Date(),
    events: items.map((i) => ({
      uid: `${i.id}@modus`,
      title: `${PREFIX[i.kind]}${i.title}`,
      start: i.startsAt,
      end: i.endsAt ?? null,
      allDay: i.allDay,
      description: [i.courseLabel, i.description].filter(Boolean).join("\n"),
      location: i.location ?? null,
      url: i.href ? origin + i.href : null,
    })),
  });
  return new Response(ics, { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" } });
}
