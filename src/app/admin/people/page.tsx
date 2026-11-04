import type { Metadata } from "next";
import Link from "next/link";
import { AddPerson } from "@/components/admin/add-person";
import { ImportPeople } from "@/components/admin/import-people";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterForm } from "@/components/ui/filter-form";
import { Input } from "@/components/ui/input";
import { LocalTime } from "@/components/ui/local-time";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { isRole, ROLE_LABELS, ROLES } from "@/lib/auth/roles";
import { plural } from "@/lib/format";
import { requireAdmin } from "@/server/access";
import { listAllCourses } from "@/server/admin/courses";
import { listPeople, type PeopleFilters } from "@/server/admin/people";

export const metadata: Metadata = { title: "People" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function PeoplePage({ searchParams }: PageProps<"/admin/people">) {
  const { user } = await requireAdmin();
  const sp = await searchParams;
  const status = first(sp.status);
  const role = first(sp.role);
  const filters: PeopleFilters = {
    q: first(sp.q) || undefined,
    role: isRole(role) ? role : undefined,
    status: status === "active" || status === "inactive" || status === "never" ? status : undefined,
  };
  const [people, courses] = await Promise.all([listPeople(user.orgId, filters), listAllCourses(user.orgId)]);
  const courseOptions = courses.map((c) => ({ id: c.id, title: c.code ? `${c.code} · ${c.title}` : c.title }));
  const filtered = Object.values(filters).some(Boolean);

  return (
    <>
      <PageHeader
        title="People"
        description={filtered ? `${plural(people.length, "person", "people")} match.` : `${plural(people.length, "person", "people")} in your organisation.`}
        actions={
          <>
            <ImportPeople courses={courseOptions} />
            <AddPerson courses={courseOptions} defaultOpen={first(sp.add) === "1"} />
          </>
        }
      />

      <FilterForm className="mb-6 flex flex-wrap gap-2">
        <Input name="q" defaultValue={filters.q} placeholder="Search by name or email" aria-label="Search people" className="min-w-48 flex-1" />
        <Select name="role" defaultValue={filters.role ?? ""} aria-label="Role" className="w-auto">
          <option value="">Everyone</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}s
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={filters.status ?? ""} aria-label="Status" className="w-auto">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="never">Never signed in</option>
          <option value="inactive">Switched off</option>
        </Select>
        {filtered && (
          <Button asChild variant="ghost">
            <Link href="/admin/people">Clear</Link>
          </Button>
        )}
      </FilterForm>

      {people.length === 0 ? (
        <EmptyState>{filtered ? "Nobody matches those filters." : "No one here yet. Add people one at a time, or import a list."}</EmptyState>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Name</TH>
              <TH>Role</TH>
              <TH>Courses</TH>
              <TH>Last signed in</TH>
            </tr>
          </THead>
          <tbody>
            {people.map((p) => (
              <TR key={p.id} className={p.deactivatedAt ? "text-muted-foreground" : undefined}>
                <TD>
                  <Link href={`/admin/people/${p.id}`} className="font-medium hover:underline">
                    {p.fullName ?? p.email}
                  </Link>
                  {p.fullName && <span className="block text-xs text-muted-foreground">{p.email}</span>}
                </TD>
                <TD className="whitespace-nowrap">
                  {ROLE_LABELS[p.role]}
                  {p.deactivatedAt && (
                    <Badge className="ml-2" tone="neutral">
                      Off
                    </Badge>
                  )}
                </TD>
                <TD className="max-w-xs truncate text-muted-foreground">{p.courses.map((c) => c.label).join(", ") || "—"}</TD>
                <TD className="whitespace-nowrap text-muted-foreground">
                  {p.lastSignInAt ? <LocalTime iso={p.lastSignInAt.toISOString()} format="relative" /> : "Never"}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
