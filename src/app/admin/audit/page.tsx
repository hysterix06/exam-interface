import Link from "next/link";
import { requireRole } from "@/server/auth";
import { listAudit } from "@/server/admin/data";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  const user = await requireRole("admin", "instructor");
  const sp = await searchParams;
  const page = Math.max(0, Math.floor(Number(first(sp.page))) || 0);
  const { rows, hasMore } = await listAudit(user.orgId, page);

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
      <p className="mt-2 mb-6 max-w-prose text-sm text-muted-foreground">
        Every change an educator makes: who, what, when, and the before and after values.
      </p>
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">Nothing recorded yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Who</th>
                <th className="px-3 py-2 font-medium">What</th>
                <th className="px-3 py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{r.ts.toLocaleString()}</td>
                  <td className="px-3 py-2">{r.actor ?? r.actorEmail ?? "system"}</td>
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs">{r.action}</span>
                    <span className="block text-xs text-muted-foreground">
                      {r.entityType} {r.entityId.slice(0, 8)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.reason && <p className="mb-1">“{r.reason}”</p>}
                    {(r.before !== null || r.after !== null) && (
                      <details>
                        <summary className="cursor-pointer text-muted-foreground">Before and after</summary>
                        <pre className="mt-1 max-w-md overflow-x-auto rounded bg-muted/50 p-2">{JSON.stringify({ before: r.before, after: r.after }, null, 2)}</pre>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex gap-4 text-sm">
        {page > 0 && <Link href={`/admin/audit?page=${page - 1}`} className="underline">← Newer</Link>}
        {hasMore && <Link href={`/admin/audit?page=${page + 1}`} className="underline">Older →</Link>}
      </div>
    </>
  );
}
