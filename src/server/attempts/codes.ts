import "server-only";
import { createHash, randomInt } from "node:crypto";
import { db } from "@/db/client";
import { examCodes } from "@/db/schema";
import type { CurrentUser } from "@/server/auth";
import { writeAudit } from "@/server/authoring/audit";
import { getExam } from "@/server/authoring/data";
import type { ActionResult } from "@/server/authoring/questions";

// No 0/O/1/I so codes survive being read aloud or copied from a screen.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeCode(code: string) {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

/** Only the hash is stored; a leaked database can't reveal usable codes. */
export function hashCode(code: string) {
  return createHash("sha256").update(normalizeCode(code)).digest("hex");
}

function makeCode() {
  const raw = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

/** Create single-use codes for an exam. Plaintext is returned once and never stored. */
export async function createCodes(
  user: CurrentUser,
  examId: string,
  n: number,
): Promise<ActionResult<{ codes: string[] }>> {
  if (!Number.isInteger(n) || n < 1 || n > 500) return { ok: false, error: "Choose between 1 and 500 codes." };
  const exam = await getExam(user.orgId, examId);
  if (!exam) return { ok: false, error: "That exam no longer exists." };

  const codes = Array.from({ length: n }, makeCode);
  await db
    .insert(examCodes)
    .values(codes.map((c) => ({ orgId: user.orgId, examId, codeHash: hashCode(c) })))
    .onConflictDoNothing();
  await writeAudit({ orgId: user.orgId, actorId: user.id, action: "exam.codes", entityType: "exam", entityId: examId, after: { count: n } });
  return { ok: true, codes };
}
