"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth";
import { createApiToken, resetCalendarFeed, revokeToken } from "@/server/api/tokens";

// Every role manages its own tokens; each action acts only on the caller's own.
export async function createApiTokenAction(input: { name: string; expiresInDays: number | null }) {
  const user = await requireRole();
  const r = await createApiToken(user, input);
  if (r.ok) revalidatePath("/account/data");
  return r;
}

export async function resetCalendarFeedAction() {
  const user = await requireRole();
  const r = await resetCalendarFeed(user);
  revalidatePath("/account/data");
  return r;
}

export async function revokeTokenAction(id: string) {
  const user = await requireRole();
  const r = await revokeToken(user, id);
  if (r.ok) revalidatePath("/account/data");
  return r;
}
