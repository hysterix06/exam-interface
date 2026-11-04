"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { profiles } from "@/db/schema";
import { homeFor } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

const credentials = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export type SignInState = { error: string | null };

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error || !data.user) return { error: "That email and password don't match an account." };

  // Go straight to the role's home: a second redirect from "/" would leave the
  // address bar on "/" while showing the home page.
  const [profile] = await db
    .select({ role: profiles.role, deactivatedAt: profiles.deactivatedAt })
    .from(profiles)
    .where(eq(profiles.id, data.user.id))
    .limit(1);
  if (!profile || profile.deactivatedAt) {
    await supabase.auth.signOut();
    return { error: "This account has been switched off. Ask your administrator." };
  }
  redirect(homeFor(profile.role));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
