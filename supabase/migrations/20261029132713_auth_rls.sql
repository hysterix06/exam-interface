-- Default org for the single-tenant v1.
INSERT INTO public.orgs (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default')
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint

-- Every new auth user gets a profile. Role always starts as student; only an
-- admin (or the seed script) can promote, never the user's own metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, coalesce(NEW.email, ''), NEW.raw_user_meta_data ->> 'full_name');
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
--> statement-breakpoint

-- Mirror role/org into app_metadata so they ride in the JWT and proxy.ts can
-- gate routes without a query. app_metadata is not user-editable.
CREATE OR REPLACE FUNCTION public.sync_profile_claims()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', NEW.role, 'org_id', NEW.org_id)
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER on_profile_claims
AFTER INSERT OR UPDATE OF role, org_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_claims();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT role IN ('admin', 'instructor') FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;
--> statement-breakpoint

-- RLS on every table. The server talks to Postgres as the owner through
-- Drizzle (bypassing RLS, authorized by requireRole()); these policies govern
-- what the anon/authenticated keys can read via supabase-js and Realtime.
-- Tables without a policy are closed to those keys entirely.
ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.question_versions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.exam_codes ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.attempt_items ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.extensions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY profiles_select ON public.profiles
FOR SELECT TO authenticated
USING (id = (SELECT auth.uid()) OR (SELECT public.is_staff()));
--> statement-breakpoint

-- Students see exam rows once they leave draft (home screen + Realtime).
CREATE POLICY exams_select ON public.exams
FOR SELECT TO authenticated
USING (state <> 'draft' OR (SELECT public.is_staff()));
--> statement-breakpoint

CREATE POLICY attempts_select ON public.attempts
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_staff()));
--> statement-breakpoint

-- Realtime: home screen listens to exams, live dashboard to attempts.
ALTER PUBLICATION supabase_realtime ADD TABLE public.exams, public.attempts;
