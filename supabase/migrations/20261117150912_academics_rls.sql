-- Academics tables: course homepages, calendar, assignments, gradebook, tokens.
-- As everywhere else, the server reads through Drizzle as the owner; these
-- policies govern supabase-js and Realtime only. api_tokens has no policy, so
-- it is closed to user keys entirely.
ALTER TABLE public.grade_categories ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.course_events ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.submission_grades ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.assignment_extensions ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY assignments_select ON public.assignments
FOR SELECT TO authenticated
USING (
  (SELECT public.is_admin_of(org_id))
  OR (SELECT public.course_role_of(course_id)) = 'teacher'
  OR (state = 'published' AND (SELECT public.course_role_of(course_id)) = 'student')
);
--> statement-breakpoint

-- Students see their own hand-ins; teachers see their course's.
CREATE POLICY submissions_select ON public.submissions
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.assignments a
    WHERE a.id = assignment_id
      AND ((SELECT public.is_admin_of(a.org_id)) OR (SELECT public.course_role_of(a.course_id)) = 'teacher')
  )
);
--> statement-breakpoint

-- Realtime: the student home and the submissions list refetch on change.
ALTER PUBLICATION supabase_realtime ADD TABLE public.assignments, public.submissions;
--> statement-breakpoint

-- Assignment hand-ins share the private submissions bucket with workbook
-- uploads: allow PDFs, Word files, images and plain text up to 10 MB.
UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY[
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/pdf',
      'image/png', 'image/jpeg', 'image/webp',
      'text/plain'
    ]
WHERE id = 'submissions';
