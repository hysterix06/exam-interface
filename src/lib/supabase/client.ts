import { createBrowserClient } from "@supabase/ssr";

// Browser client: Realtime subscriptions and storage only. All writes go
// through server actions.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
