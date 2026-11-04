import { and, eq } from "drizzle-orm";
import { authUsers } from "drizzle-orm/supabase";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { activityText } from "@/components/admin/activity-text";
import { PersonControls } from "@/components/admin/person-controls";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LocalTime } from "@/components/ui/local-time";
import { PageHeader } from "@/components/ui/page-header";
import { Row, RowList } from "@/components/ui/row-list";
import { Section } from "@/components/ui/section";
import { db } from "@/db/client";
import { courses, enrollments, profiles } from "@/db/schema";
import { ROLE_LABELS } from "@/lib/auth/roles";
import { requireAdmin } from "@/server/access";
import { listActivity } from "@/server/admin/org";

export const metadata: Metadata = { title: "Person" };

export default async function PersonPage({ params }: PageProps<"/admin/people/[id]">) {
  const { user } = await requireAdmin();
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  const [row] = await db
    .select({ p: profiles, lastSignInAt: authUsers.lastSignInAt })
    .from(profiles)
    .leftJoin(authUsers, eq(authUsers.id, profiles.id))
    .where(and(eq(profiles.id, id), eq(profiles.orgId, user.orgId)))
    .limit(1);
  if (!row) notFound();
  const p = row.p;
  const [memberships, activity] = await Promise.all([
    db
      .select({ id: courses.id, title: courses.title, code: courses.code, role: enrollments.role })
      .from(enrollments)
      .innerJoin(courses, eq(courses.id, enrollments.courseId))
      .where(eq(enrollments.userId, id)),
    listActivity(user.orgId, { q: p.email, limit: 10 }),
  ]);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/people", label: "People" }}
        title={p.fullName ?? p.email}
        meta={p.deactivatedAt ? <Badge>Switched off</Badge> : undefined}
        description={
          <>
            {p.email} · {ROLE_LABELS[p.role]} · {row.lastSignInAt ? <>last signed in <LocalTime iso={new Date(row.lastSignInAt).toISOString()} format="relative" /></> : "has never signed in"}
          </>
        }
      />

      <Section title="Access">
        <PersonControls id={p.id} role={p.role} active={!p.deactivatedAt} isSelf={p.id === user.id} />
      </Section>

      <Section title="Courses">
        {memberships.length === 0 ? (
          <EmptyState>Not in any course. Add them from a course’s page.</EmptyState>
        ) : (
          <RowList>
            {memberships.map((m) => (
              <Row key={m.id} href={`/admin/courses/${m.id}`} title={m.title} detail={m.code ?? undefined} aside={<Badge>{m.role === "teacher" ? "Teaches" : "Student"}</Badge>} />
            ))}
          </RowList>
        )}
      </Section>

      {activity.rows.length > 0 && (
        <Section
          title="Their recent activity"
          actions={
            <Link href={`/admin/activity?q=${encodeURIComponent(p.email)}`} className="text-sm text-muted-foreground hover:text-foreground">
              All →
            </Link>
          }
        >
          <ol className="grid gap-2 text-sm">
            {activity.rows.map((a) => (
              <li key={a.id} className="flex gap-3">
                <span className="w-36 shrink-0 text-muted-foreground">
                  <LocalTime iso={a.ts.toISOString()} />
                </span>
                <span>{activityText(a.action)}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </>
  );
}
