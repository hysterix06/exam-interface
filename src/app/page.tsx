import { redirect } from "next/navigation";
import { homeFor } from "@/lib/auth/roles";
import { requireRole } from "@/server/auth";

// proxy.ts normally redirects "/" first; this covers a stale JWT role.
export default async function RootPage() {
  const user = await requireRole();
  redirect(homeFor(user.role));
}
