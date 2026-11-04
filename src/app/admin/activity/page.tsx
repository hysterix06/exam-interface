import type { Metadata } from "next";
import Link from "next/link";
import { activityText } from "@/components/admin/activity-text";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { LocalTime } from "@/components/ui/local-time";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { requireAdmin } from "@/server/access";
import { activityEntities, listActivity } from "@/server/admin/org";

export const metadata: Metadata = { title: "Activity" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function Change({ before, after }: { before: unknown; after: unknown }) {
  if (before == null && after == null) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Details</summary>
      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
        {before != null && (
          <pre className="overflow-x-auto rounded-md border bg-muted/40 p-2 font-mono">
            <span className="text-muted-foreground">Before </span>
            {JSON.stringify(before, null, 2)}
          </pre>
        )}
        {after != null && (
          <pre className="overflow-x-auto rounded-md border bg-muted/40 p-2 font-mono">
            <span className="text-muted-foreground">After </span>
            {JSON.stringify(after, null, 2)}
          </pre>
        )}
      </div>
    </details>
  );
}

export default async function ActivityPage({ searchParams }: PageProps<"/admin/activity">) {
  const { user } = await requireAdmin();
  const sp = await searchParams;
  const q = first(sp.q) || undefined;
  const entity = first(sp.entity) || undefined;
  const before = Number(first(sp.before)) || undefined;
  const [{ rows, next }, entities] = await Promise.all([listActivity(user.orgId, { q, entity, before }), activityEntities(user.orgId)]);
  const params = (extra: Record<string, string | number>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (entity) p.set("entity", entity);
    for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
    return `/admin/activity?${p}`;
  };

  return (
    <>
      <PageHeader title="Activity" description="Everything staff have changed, with who, when, and the values before and after." />
      <form className="mb-6 flex flex-wrap gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder="Search by person or action" aria-label="Search activity" className="min-w-48 flex-1" />
        <Select name="entity" defaultValue={entity ?? ""} aria-label="Kind" className="w-auto">
          <option value="">Everything</option>
          {entities.map((e) => (
            <option key={e} value={e}>
              {e.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState>Nothing matches.</EmptyState>
      ) : (
        <ol className="divide-y rounded-lg border">
          {rows.map((a) => (
            <li key={a.id} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[10rem_1fr]">
              <span className="text-muted-foreground">
                <LocalTime iso={a.ts.toISOString()} />
              </span>
              <div className="min-w-0">
                <span className="font-medium">{a.actor ?? a.actorEmail ?? "System"}</span> {activityText(a.action)}
                {a.reason && <span className="text-muted-foreground"> · “{a.reason}”</span>}
                <Change before={a.before} after={a.after} />
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-4 flex gap-2">
        {before && (
          <Button asChild variant="ghost" size="sm">
            <Link href={params({})}>Newest</Link>
          </Button>
        )}
        {next && (
          <Button asChild variant="outline" size="sm">
            <Link href={params({ before: next })}>Older →</Link>
          </Button>
        )}
      </div>
    </>
  );
}
