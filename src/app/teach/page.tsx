import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LocalTime } from "@/components/ui/local-time";
import { PageHeader } from "@/components/ui/page-header";
import { Row, RowList } from "@/components/ui/row-list";
import { Section } from "@/components/ui/section";
import { plural } from "@/lib/format";
import { requireStaff } from "@/server/access";
import { loadTeachHome } from "@/server/teach/home";

export const metadata: Metadata = { title: "Home" };

function greeting(name: string | null) {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return name ? `${part}, ${name.split(" ")[0]}` : part;
}

export default async function TeachHome() {
  const { user, scope } = await requireStaff();
  // Admins have their own home; their teaching tools start at the exam list.
  if (user.role === "admin") redirect("/teach/exams");
  const home = await loadTeachHome(scope);

  if (home.courses.length === 0) {
    return (
      <>
        <PageHeader title={greeting(user.fullName)} />
        <EmptyState>You aren’t teaching any courses yet. An administrator adds you to a course, and it appears here.</EmptyState>
      </>
    );
  }

  const attention = home.live.length + home.toMark.length + home.toRelease.length + home.drafts.filter((d) => d.blocking > 0).length;

  return (
    <>
      <PageHeader
        title={greeting(user.fullName)}
        description={
          attention === 0
            ? "Nothing needs you right now."
            : `${plural(attention, "thing needs", "things need")} your attention.`
        }
        actions={
          <Button asChild variant="outline">
            <Link href="/teach/exams?new=1">New exam</Link>
          </Button>
        }
      />

      {home.live.length > 0 && (
        <Section title="Live now">
          <RowList>
            {home.live.map((e) => (
              <Row
                key={e.id}
                href={`/teach/exams/${e.id}/run`}
                title={e.title}
                detail={
                  <>
                    {e.courseTitle}
                    {e.closesAt && (
                      <>
                        {" · closes "}
                        <LocalTime iso={e.closesAt.toISOString()} format="relative" />
                      </>
                    )}
                  </>
                }
                aside={
                  <>
                    <span className="tabular-nums">{e.live} in progress</span>
                    <span className="text-muted-foreground tabular-nums">{e.finished} done</span>
                  </>
                }
              />
            ))}
          </RowList>
        </Section>
      )}

      {home.toMark.length > 0 && (
        <Section title="Needs marking">
          <RowList>
            {home.toMark.map((e) => (
              <Row
                key={e.id}
                href={`/teach/marking/${e.id}`}
                title={e.title}
                detail={e.courseTitle}
                aside={<span className="tabular-nums">{plural(e.toMark, "answer")}</span>}
              />
            ))}
          </RowList>
        </Section>
      )}

      {home.toRelease.length > 0 && (
        <Section title="Ready to release" description="Everything is marked. Students see nothing until you release results.">
          <RowList>
            {home.toRelease.map((e) => (
              <Row
                key={e.id}
                href={`/teach/exams/${e.id}/run`}
                title={e.title}
                detail={`${e.courseTitle} · ${plural(e.finished, "attempt")}`}
                aside={<span className="text-muted-foreground">Release →</span>}
              />
            ))}
          </RowList>
        </Section>
      )}

      {home.drafts.length > 0 && (
        <Section title="Drafts">
          <RowList>
            {home.drafts.map((e) => (
              <Row
                key={e.id}
                href={e.blocking > 0 ? `/teach/exams/${e.id}/verify` : `/teach/exams/${e.id}`}
                title={e.title}
                detail={e.blocking > 0 && e.firstIssue ? e.firstIssue : e.courseTitle}
                aside={e.blocking > 0 ? <Badge tone="warning">{plural(e.blocking, "check")} failing</Badge> : <Badge>Ready to publish</Badge>}
              />
            ))}
          </RowList>
        </Section>
      )}

      {home.upcoming.length > 0 && (
        <Section title="Coming up">
          <RowList>
            {home.upcoming.map((e) => (
              <Row
                key={e.id}
                href={`/teach/exams/${e.id}/run`}
                title={e.title}
                detail={e.courseTitle}
                aside={
                  e.opensAt ? (
                    <span className="text-muted-foreground">
                      Opens <LocalTime iso={e.opensAt.toISOString()} />
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Published, not scheduled</span>
                  )
                }
              />
            ))}
          </RowList>
        </Section>
      )}

      <Section title="Your courses">
        <RowList>
          {home.courses.map((c) => (
            <Row key={c.id} href={`/teach/courses/${c.id}`} title={c.title} detail={c.code ?? undefined} />
          ))}
        </RowList>
      </Section>
    </>
  );
}
