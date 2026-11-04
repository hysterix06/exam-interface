import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client for account management (create users, ban/unban,
 * reset passwords). Server-only: it bypasses every policy. Only call it from
 * functions guarded by requireAdmin().
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not set; account management is unavailable.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
