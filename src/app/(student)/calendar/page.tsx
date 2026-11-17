import type { Metadata } from "next";
import { CalendarView } from "@/components/calendar/calendar-view";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/server/auth";
import { studentAcademics } from "@/server/student/academics";
import { calendarParams } from "@/server/student/pages";

export const metadata: Metadata = { title: "Calendar" };

export default async function StudentCalendar({ searchParams }: PageProps<"/calendar">) {
  const user = await requireRole("student");
  const { calendar } = await studentAcademics(user);
  const { month, view } = calendarParams(await searchParams);
  return (
    <>
      <PageHeader title="Calendar" description="Every course in one place: classes, due dates and exam windows." className="mb-8" />
      <CalendarView items={calendar} month={month} view={view} basePath="/calendar" />
    </>
  );
}
