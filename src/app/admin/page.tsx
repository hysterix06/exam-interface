import type { Metadata } from "next";
import Link from "next/link";
import { activityText } from "@/components/admin/activity-text";
import { Button } from "@/components/ui/button";
import { LocalTime } from "@/components/ui/local-time";
import { PageHeader } from "@/components/ui/page-header";
import { Row, RowList } from "@/components/ui/row-list";
import { Section } from "@/components/ui/section";
import { Stat, StatGrid } from "@/components/ui/stat";
import { plural } from "@/lib/format";
import { requireAdmin } from "@/server/access";
import { getOrg, loadOverview } from "@/server/admin/org";

export const metadata: Metadata = { title: "Overview" };

export default async function AdminHome() {
  const { user } = await requireAdmin();
  const [o, org] = await Promise.all([loadOverview(user.orgId), getOrg(user.orgId)]);
  const setupCount = o.setup.noTeacher.length + o.setup.noStudents.length + (o.setup.neverSignedIn > 0 ? 1 : 0);

  return (
    <>
      <PageHeader
        title={org.name}
        description={`${plural(o.people.student, "student")}, ${plural(o.people.instructor, "instructor")} and ${plural(o.people.admin, "administrator")} across ${plural(o.courses.length, "course")}.`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/courses?new=1">New course</Link>
            </Button>
            <Button asChild>
              <Link href="/admin/people?add=1">Add people</Link>
            </Button>
          </>
        }
      />

      <StatGrid>
        <Stat label="People" value={o.people.student + o.people.instructor + o.people.admin} href="/admin/people" />
        <Stat label="Courses" value={o.courses.length} href="/admin/courses" />
        <Stat label="Exams open now" value={o.openNow.length} hint={o.openNow[0]?.title} href="/teach/exams" />
        <Stat label="Attempts this week" value={o.attemptsThisWeek} hint={o.unmarked ? `${o.unmarked} answers to mark` : undefined} />
      </StatGrid>

      {setupCount > 0 && (
        <Section title="Needs attention">
          <RowList>
            {o.setup.noTeacher.map((c) => (
              <Row key={`t${c.id}`} href={`/admin/courses/${c.id}`} title={c.title} detail="No teacher assigned" aside={<span className="text-muted-foreground">Assign →</span>} />
            ))}
            {o.setup.noStudents.map((c) => (
              <Row key={`s${c.id}`} href={`/admin/courses/${c.id}`} title={c.title} detail="No students enrolled" aside={<span className="text-muted-foreground">Enrol →</span>} />
            ))}
            {o.setup.neverSignedIn > 0 && (
              <Row
                href="/admin/people?status=never"
                title={`${plural(o.setup.neverSignedIn, "person hasn’t", "people haven’t")} signed in yet`}
                detail="They may still need their one-time password."
                aside={<span className="text-muted-foreground">Review →</span>}
              />
            )}
          </RowList>
        </Section>
      )}

      <Section
        title="Recent activity"
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/activity">All activity →</Link>
          </Button>
        }
      >
        {o.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>
        ) : (
          <ol className="grid gap-2.5 text-sm">
            {o.recent.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{a.actor ?? a.actorEmail ?? "System"}</span>
                <span>{activityText(a.action)}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  <LocalTime iso={a.ts.toISOString()} format="relative" />
                </span>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}
