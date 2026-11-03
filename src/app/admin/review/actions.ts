"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/server/auth";
import { saveReview } from "@/server/review";

export async function saveReviewAction(input: { attemptItemId: string; ticked: string[] }) {
  const user = await requireRole("admin", "instructor");
  const r = await saveReview(user, input);
  if (r.ok) revalidatePath("/admin/review", "layout");
  return r;
}
