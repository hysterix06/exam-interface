-- Uploaded files live in private buckets. There are deliberately no
-- storage.objects policies: only the server (secret key) reads or writes, and
-- every download goes through /assets/[id], which checks who is asking and
-- answers with a short-lived signed URL.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('assets', 'assets', false, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  ('submissions', 'submissions', false, 2097152, ARRAY['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
-- Defense in depth, like every other table: reads go through Drizzle as owner.
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
