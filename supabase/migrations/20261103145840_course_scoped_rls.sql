-- Course-scoped read policies. The server still reads through Drizzle as the
-- owner; these govern what supabase-js and Realtime can see with a user key.

-- Staff checks are org-scoped and ignore deactivated accounts.
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT role IN ('admin', 'instructor') AND deactivated_at IS NULL
       FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.is_admin_of(target_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT role = 'admin' AND org_id = target_org AND deactivated_at IS NULL
       FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.course_role_of(target_course uuid)
RETURNS public.course_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT role FROM public.enrollments
  WHERE course_id = target_course AND user_id = auth.uid();
$$;
--> statement-breakpoint

-- Admins see the org; teachers see their courses; students see non-draft
-- exams in courses they're enrolled in.
DROP POLICY IF EXISTS exams_select ON public.exams;
--> statement-breakpoint
CREATE POLICY exams_select ON public.exams
FOR SELECT TO authenticated
USING (
  (SELECT public.is_admin_of(org_id))
  OR (SELECT public.course_role_of(course_id)) = 'teacher'
  OR (state <> 'draft' AND (SELECT public.course_role_of(course_id)) = 'student')
);
--> statement-breakpoint

DROP POLICY IF EXISTS attempts_select ON public.attempts;
--> statement-breakpoint
CREATE POLICY attempts_select ON public.attempts
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (SELECT public.is_admin_of(org_id))
  OR EXISTS (
    SELECT 1 FROM public.exams e
    WHERE e.id = attempts.exam_id AND (SELECT public.course_role_of(e.course_id)) = 'teacher'
  )
);
--> statement-breakpoint

DROP POLICY IF EXISTS profiles_select ON public.profiles;
--> statement-breakpoint
CREATE POLICY profiles_select ON public.profiles
FOR SELECT TO authenticated
USING (id = (SELECT auth.uid()) OR ((SELECT public.is_staff()) AND org_id = (
  SELECT p.org_id FROM public.profiles p WHERE p.id = (SELECT auth.uid())
)));
--> statement-breakpoint

-- Existing course members were all students; staff were never enrolled. The
-- seed assigns teachers.
