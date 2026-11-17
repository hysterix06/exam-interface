import { z } from "zod";

// Practical details on a course homepage. Stored as courses.info (jsonb).
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM");

export const courseInfoSchema = z.object({
  meetings: z
    .array(z.object({
      days: z.string().trim().min(1).max(40),
      start: time.optional(),
      end: time.optional(),
      location: z.string().trim().max(120).optional(),
    }))
    .max(10)
    .default([]),
  officeHours: z.string().trim().max(500).optional(),
  contactNote: z.string().trim().max(500).optional(),
  links: z.array(z.object({ label: z.string().trim().min(1).max(80), url: z.url({ protocol: /^https?$/ }) })).max(20).default([]),
});
export type CourseInfo = z.infer<typeof courseInfoSchema>;

export function parseCourseInfo(raw: unknown): CourseInfo {
  const r = courseInfoSchema.safeParse(raw ?? {});
  return r.success ? r.data : { meetings: [], links: [] };
}

/** "Mon, Wed 10:00–11:15 · Room 204". */
export function describeMeeting(m: CourseInfo["meetings"][number]): string {
  const when = m.start ? ` ${m.start}${m.end ? `–${m.end}` : ""}` : "";
  return `${m.days}${when}${m.location ? ` · ${m.location}` : ""}`;
}
