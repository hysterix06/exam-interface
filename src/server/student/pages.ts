import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { requireRole } from "@/server/auth";
import { studentCourse } from "./academics";

/** The course behind every student course tab; cached so the layout and page share it. 404 unless enrolled. */
export const courseForPage = cache(async (id: string) => {
  const user = await requireRole("student");
  if (!z.guid().safeParse(id).success) notFound();
  const data = await studentCourse(user, id);
  if (!data) notFound();
  return { user, ...data };
});

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** ?month=2026-11&view=agenda from the URL, defaulting to this month and the grid. */
export function calendarParams(sp: { month?: string | string[]; view?: string | string[] }) {
  const m = typeof sp.month === "string" && MONTH.test(sp.month) ? sp.month : new Date().toISOString().slice(0, 7);
  const view = sp.view === "agenda" ? ("agenda" as const) : ("month" as const);
  return { month: m, view };
}
