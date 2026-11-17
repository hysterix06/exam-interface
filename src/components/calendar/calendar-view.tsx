"use client";

import { cn } from "cn";
import { CalendarDays, ClipboardList, FileText, Flag, GraduationCap, Sun, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { agenda, dayKey, groupByDay, monthGrid, shiftMonth, type CalendarItem } from "@/engine/calendar";

const subscribe = () => () => {};
/** The viewer's zone in the browser; UTC on the server and during hydration, so nothing mismatches. */
function useTimeZone() {
  return useSyncExternalStore(subscribe, () => Intl.DateTimeFormat().resolvedOptions().timeZone, () => "UTC");
}

const PREFIX: Record<CalendarItem["kind"], string> = { "exam-opens": "Opens", "exam-closes": "Closes", "assignment-due": "Due", event: "" };

const EVENT_ICON: Record<NonNullable<CalendarItem["eventKind"]>, LucideIcon> = { class: GraduationCap, holiday: Sun, deadline: Flag, other: CalendarDays };

function KindIcon({ item, className }: { item: CalendarItem; className?: string }) {
  const props = { "aria-hidden": true, className };
  if (item.kind === "assignment-due") return <ClipboardList {...props} />;
  if (item.kind !== "event") return <FileText {...props} />;
  const Icon = EVENT_ICON[item.eventKind ?? "other"];
  return <Icon {...props} />;
}

function time(iso: string, tz: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
}

function dayHeading(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
}

function ItemLine({ item, tz, compact, showCourse }: { item: CalendarItem; tz: string; compact?: boolean; showCourse: boolean }) {
  const label = (
    <>
      <KindIcon item={item} className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className={cn("block", compact && "truncate")}>
          {!item.allDay && <span className="text-muted-foreground tabular-nums">{time(item.startsAt, tz)} </span>}
          {PREFIX[item.kind] && <span className="text-muted-foreground">{PREFIX[item.kind]}: </span>}
          {item.title}
        </span>
        {!compact && (
          <span className="block text-muted-foreground">
            {[showCourse ? item.courseLabel : null, item.location, item.status].filter(Boolean).join(" · ")}
          </span>
        )}
      </span>
    </>
  );
  const cls = cn("flex gap-1.5 rounded-sm", compact ? "text-xs" : "text-sm");
  return item.href ? (
    <Link href={item.href} className={cn(cls, "hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none")} title={compact ? item.title : undefined}>
      {label}
    </Link>
  ) : (
    <div className={cls} title={compact ? [item.title, item.description].filter(Boolean).join("\n") : undefined}>
      {label}
    </div>
  );
}

function AgendaDays({ items, tz, showCourse, empty }: { items: CalendarItem[]; tz: string; showCourse: boolean; empty: string }) {
  const days = groupByDay(items, tz);
  if (days.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <ol className="grid gap-8">
      {days.map((d) => (
        <li key={d.date}>
          <h3 className="mb-3 border-b pb-2 text-sm font-medium">{dayHeading(d.date)}</h3>
          <ul className="grid gap-3">
            {d.items.map((i) => (
              <li key={i.id}>
                <ItemLine item={i} tz={tz} showCourse={showCourse} />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/** An agenda of whatever it's given (the home page's "this week"). */
export function AgendaList({ items, showCourse = true, empty = "Nothing scheduled." }: { items: CalendarItem[]; showCourse?: boolean; empty?: string }) {
  const tz = useTimeZone();
  return <AgendaDays items={items} tz={tz} showCourse={showCourse} empty={empty} />;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * A month of work and events. The month and view live in the URL, so the
 * back button and links work; on a phone the month always reads as a list.
 */
export function CalendarView({
  items,
  month,
  view,
  basePath,
  showCourse = true,
}: {
  items: CalendarItem[];
  month: string;
  view: "month" | "agenda";
  basePath: string;
  showCourse?: boolean;
}) {
  const tz = useTimeZone();
  const today = dayKey(new Date().toISOString(), tz);
  const weeks = monthGrid(month, 1);
  const from = weeks[0][0].date;
  const to = weeks.at(-1)!.at(-1)!.date;
  // Generous range in UTC, then bucket exactly by the viewer's day.
  const visible = agenda(items, new Date(`${from}T00:00:00Z`), new Date(Date.parse(`${to}T00:00:00Z`) + 2 * 86_400_000)).filter((i) => {
    const d = dayKey(i.startsAt, tz);
    return d >= from && d <= to;
  });
  const inMonth = visible.filter((i) => dayKey(i.startsAt, tz).startsWith(month));
  const byDay = new Map<string, CalendarItem[]>();
  for (const i of visible) {
    const d = dayKey(i.startsAt, tz);
    byDay.set(d, [...(byDay.get(d) ?? []), i]);
  }
  const href = (m: string, v = view) => `${basePath}?month=${m}&view=${v}`;
  const [y, mo] = month.split("-").map(Number);
  const title = new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-lg font-semibold tracking-tight">{title}</h2>
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link href={href(shiftMonth(month, -1))} aria-label="Previous month">
              ←
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={href(today.slice(0, 7))}>Today</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href={href(shiftMonth(month, 1))} aria-label="Next month">
              →
            </Link>
          </Button>
        </div>
        <nav aria-label="Calendar view" className="hidden gap-1 sm:flex">
          {(["month", "agenda"] as const).map((v) => (
            <Link
              key={v}
              href={href(month, v)}
              aria-current={v === view ? "page" : undefined}
              className="rounded-md px-2.5 py-1 text-sm text-muted-foreground hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground"
            >
              {v === "month" ? "Month" : "List"}
            </Link>
          ))}
        </nav>
      </div>

      {view === "month" && (
        <div className="hidden overflow-hidden rounded-xl border sm:block">
          <div className="grid grid-cols-7 border-b text-xs text-muted-foreground">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-2">
                {d}
              </div>
            ))}
          </div>
          {weeks.map((w) => (
            <div key={w[0].date} className="grid grid-cols-7 border-b last:border-b-0">
              {w.map((d) => {
                const isToday = d.date === today;
                const list = byDay.get(d.date) ?? [];
                return (
                  <div key={d.date} className={cn("min-h-24 border-r p-1.5 last:border-r-0", !d.inMonth && "bg-muted/30")}>
                    <div
                      className={cn("mb-1 px-0.5 text-xs tabular-nums", d.inMonth ? "text-foreground" : "text-muted-foreground", isToday && "font-semibold underline underline-offset-4")}
                      aria-current={isToday ? "date" : undefined}
                    >
                      {Number(d.date.slice(8))}
                    </div>
                    <ul className="grid gap-1">
                      {list.slice(0, 4).map((i) => (
                        <li key={i.id}>
                          <ItemLine item={i} tz={tz} compact showCourse={showCourse} />
                        </li>
                      ))}
                      {list.length > 4 && <li className="px-0.5 text-xs text-muted-foreground">+{list.length - 4} more</li>}
                    </ul>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      <div className={cn(view === "month" && "sm:hidden")}>
        <AgendaDays items={inMonth} tz={tz} showCourse={showCourse} empty="Nothing this month." />
      </div>
    </div>
  );
}
