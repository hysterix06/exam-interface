"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db/client";
import { profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/server/auth";

type Result = { ok: true } | { ok: false; error: string };

export async function updateNameAction(fullName: string): Promise<Result> {
  const user = await requireRole();
  const name = z.string().trim().min(1).max(120).safeParse(fullName);
  if (!name.success) return { ok: false, error: "Enter your name." };
  await db.update(profiles).set({ fullName: name.data }).where(eq(profiles.id, user.id));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function changePasswordAction(input: { current: string; next: string }): Promise<Result> {
  const user = await requireRole();
  if (typeof input.next !== "string" || input.next.length < 8) return { ok: false, error: "Use at least 8 characters." };
  const supabase = await createClient();
  // Re-check the current password so an unattended session can't lock someone out.
  const { error: wrong } = await supabase.auth.signInWithPassword({ email: user.email, password: String(input.current ?? "") });
  if (wrong) return { ok: false, error: "Your current password isn’t right." };
  const { error } = await supabase.auth.updateUser({ password: input.next });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
