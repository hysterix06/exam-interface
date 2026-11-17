import type { Metadata } from "next";
import { CalendarView } from "@/components/calendar/calendar-view";
import { EventsManager } from "@/components/teach/course/events-manager";
import { Section } from "@/components/ui/section";
import { calendarParams } from "@/server/student/pages";
import { listEvents, staffCourseCalendar, workspaceCourse } from "@/server/teach/course";

export const metadata: Metadata = { title: "Course calendar" };

export default async function TeachCourseCalendar({ params, searchParams }: PageProps<"/teach/courses/[id]/calendar">) {
  const { id } = await params;
  const { course } = await workspaceCourse(id);
  const [items, events] = await Promise.all([staffCourseCalendar(course), listEvents(id)]);
  const { month, view } = calendarParams(await searchParams);
  return (
    <>
      <CalendarView items={items} month={month} view={view} basePath={`/teach/courses/${id}/calendar`} showCourse={false} />
      <Section title="Events" description="Exams and assignments appear from their own dates. Add class times, holidays and reminders here.">
        <EventsManager
          courseId={id}
          events={events.map((e) => ({ ...e, startsAt: e.startsAt.toISOString(), endsAt: e.endsAt?.toISOString() ?? null }))}
        />
      </Section>
    </>
  );
}
