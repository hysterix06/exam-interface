import "server-only";
import { db, type Db } from "@/db/client";
import { auditLog } from "@/db/schema";

type Executor = Pick<Db, "insert">;

export async function writeAudit(
  entry: {
    orgId: string;
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
    reason?: string;
  },
  executor: Executor = db,
) {
  await executor.insert(auditLog).values({
    orgId: entry.orgId,
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
  });
}
