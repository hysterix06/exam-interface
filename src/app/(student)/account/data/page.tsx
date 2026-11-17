import type { Metadata } from "next";
import { headers } from "next/headers";
import { ApiTokens, CalendarFeed } from "@/components/data/token-controls";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { requireRole } from "@/server/auth";
import { listTokens } from "@/server/api/tokens";

export const metadata: Metadata = { title: "Your data" };

const WHAT: Record<string, string[]> = {
  student: ["Your courses, syllabi and grade weights", "Your calendar", "Every exam attempt: what you were asked and what you answered (answer keys and scores only once released)", "Every assignment you handed in, every version, with the files", "Your released grades, feedback, and your course grades with the working"],
  instructor: ["Every course you teach: homepage, weights, calendar and roster", "The question bank, every version", "Exams, every attempt, answer, mark and explanation", "Assignments, every hand-in (with files), mark and extension", "A gradebook per course"],
  admin: ["Everything teachers get, for every course in the organisation", "Everyone’s account (without passwords)", "The full activity log", "Organisation settings"],
};

/** Everything you can see in Modus, yours to take: a ZIP, a calendar feed, and a read-only API. */
export default async function YourDataPage() {
  const user = await requireRole();
  const [tokens, h] = await Promise.all([listTokens(user), headers()]);
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const api = tokens.filter((t) => t.kind === "api");
  return (
    <>
      <PageHeader title="Your data" description="Everything you can see in Modus is yours to keep and use elsewhere, as files, a calendar feed, or through the API." />

      <Section title="Download everything" description="One ZIP with every table as both JSON and CSV, a README explaining each file, and the files that were handed in.">
        <ul className="mb-5 grid list-disc gap-1 pl-5 text-sm">
          {(WHAT[user.role] ?? []).map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href="/export" download>
              Download ZIP
            </a>
          </Button>
          <Button asChild variant="ghost">
            <a href="/export?files=0" download>
              Without files (smaller)
            </a>
          </Button>
        </div>
      </Section>

      <Section title="Calendar feed" description="Due dates, exam windows and class events in Google Calendar, Apple Calendar or Outlook.">
        <CalendarFeed hasFeed={tokens.some((t) => t.kind === "calendar")} origin={origin} />
      </Section>

      <Section title="API" description="Read-only access for your own scripts and tools. A token can see exactly what you can see here, and nothing more.">
        <ApiTokens tokens={api.map((t) => ({ ...t, lastUsedAt: t.lastUsedAt?.toISOString() ?? null, expiresAt: t.expiresAt?.toISOString() ?? null, createdAt: t.createdAt.toISOString() }))} />
        <div className="mt-6 grid gap-2 text-sm">
          <p className="text-muted-foreground">Try it:</p>
          <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs">{`curl -H "Authorization: Bearer <token>" ${origin}/api/v1/me\ncurl -H "Authorization: Bearer <token>" ${origin}/api/v1/assignments`}</pre>
          <p>
            Every endpoint is described in{" "}
            <a href="/api/v1/openapi.json" className="text-brand underline-offset-4 hover:underline">
              openapi.json
            </a>{" "}
            (open it in any OpenAPI viewer or Postman).
          </p>
        </div>
      </Section>
    </>
  );
}
