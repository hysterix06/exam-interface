-- 1. Fix profiles_select. It looked the viewer's org up with a subquery on profiles, which
--    re-enters the same policy ("infinite recursion detected in policy"), so no browser-side
--    read of profiles worked for anyone. Decide in a SECURITY DEFINER function instead, and
--    follow the app's course scope: you see yourself; an admin sees their org; a teacher sees
--    the people in the courses they teach. (The old intent was "all staff see the whole org",
--    which would have handed every instructor every email once the recursion was fixed.)
CREATE OR REPLACE FUNCTION public.can_see_profile(target uuid, target_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
    (SELECT p.deactivated_at IS NULL AND (
        (p.role = 'admin' AND p.org_id = target_org)
        OR (
          p.role = 'instructor'
          AND EXISTS (
            SELECT 1
            FROM public.enrollments mine
            JOIN public.enrollments theirs ON theirs.course_id = mine.course_id
            WHERE mine.user_id = p.id AND mine.role = 'teacher' AND theirs.user_id = target
          )
        )
      )
     FROM public.profiles p WHERE p.id = auth.uid()),
    false
  );
$$;
--> statement-breakpoint

DROP POLICY IF EXISTS profiles_select ON public.profiles;
--> statement-breakpoint
CREATE POLICY profiles_select ON public.profiles
FOR SELECT TO authenticated
USING (id = (SELECT auth.uid()) OR public.can_see_profile(id, org_id));
--> statement-breakpoint

-- 2. Phone numbers are shared only between people in the same course, and the server
--    (Drizzle, as the table owner) applies that scope. A browser key must not be able to read
--    them at all, whatever the row policy lets through. Table-level SELECT can't be narrowed
--    column by column, so revoke it and grant back every column except the two phone ones.
--    A column added to profiles later is therefore NOT readable through PostgREST until it
--    is granted here (deliberate: default-deny). The RLS helpers are SECURITY DEFINER and the
--    policy reads only id and org_id, so policies keep working.
REVOKE SELECT ON public.profiles FROM anon, authenticated;
--> statement-breakpoint
GRANT SELECT (id, org_id, role, email, full_name, deactivated_at, created_at) ON public.profiles TO authenticated;
