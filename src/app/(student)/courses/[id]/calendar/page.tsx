import type { Metadata } from "next";
import { CalendarView } from "@/components/calendar/calendar-view";
import { calendarParams, courseForPage } from "@/server/student/pages";

export const metadata: Metadata = { title: "Course calendar" };

export default async function CourseCalendar({ params, searchParams }: PageProps<"/courses/[id]/calendar">) {
  const { id } = await params;
  const { calendar } = await courseForPage(id);
  const { month, view } = calendarParams(await searchParams);
  return <CalendarView items={calendar} month={month} view={view} basePath={`/courses/${id}/calendar`} showCourse={false} />;
}
