"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteEventAction, saveEventAction } from "@/app/teach/courses/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LocalTime } from "@/components/ui/local-time";
import { StatusText } from "@/components/ui/notice";
import { Row, RowList } from "@/components/ui/row-list";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export interface CourseEventRow {
  id: string;
  title: string;
  kind: "class" | "deadline" | "holiday" | "other";
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  location: string | null;
  description: string | null;
}

const KIND_LABEL: Record<CourseEventRow["kind"], string> = { class: "Class", deadline: "Deadline", holiday: "No class / holiday", other: "Other" };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Each occurrence as instants, worked out in the teacher's own zone (so 10:00 stays 10:00 across clock changes). */
function occurrences(f: { date: string; start: string; end: string; allDay: boolean; repeat: boolean; days: number[]; until: string }) {
  const at = (date: string, time: string) => {
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = (time || "00:00").split(":").map(Number);
    return new Date(y, m - 1, d, hh, mm);
  };
  const one = (date: string) => {
    if (f.allDay) return { startsAt: new Date(`${date}T00:00:00Z`).toISOString(), endsAt: null };
    return { startsAt: at(date, f.start).toISOString(), endsAt: f.end ? at(date, f.end).toISOString() : null };
  };
  if (!f.repeat) return [one(f.date)];
  const out = [];
  const [y, m, d] = f.date.split("-").map(Number);
  for (let cur = new Date(y, m - 1, d); localDate(cur) <= f.until && out.length < 200; cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1)) {
    if (f.days.includes((cur.getDay() + 6) % 7)) out.push(one(localDate(cur)));
  }
  return out;
}

function EventDialog({ courseId, event, open, onOpenChange }: { courseId: string; event: CourseEventRow | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const start0 = event ? new Date(event.startsAt) : null;
  const [f, setF] = useState(() => ({
    title: event?.title ?? "",
    kind: event?.kind ?? ("class" as CourseEventRow["kind"]),
    date: event ? (event.allDay ? event.startsAt.slice(0, 10) : localDate(start0!)) : localDate(new Date()),
    start: start0 && !event?.allDay ? localTime(start0) : "10:00",
    end: event?.endsAt && !event.allDay ? localTime(new Date(event.endsAt)) : event ? "" : "11:00",
    allDay: event?.allDay ?? false,
    location: event?.location ?? "",
    description: event?.description ?? "",
    repeat: false,
    days: [] as number[],
    until: "",
  }));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const count = f.repeat && f.until && f.days.length ? occurrences(f).length : 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={event ? "Edit event" : "Add to the calendar"} description="Students in this course see it on their calendar and in their calendar feed.">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (f.repeat && (!f.until || f.days.length === 0)) return setError("Pick the days it repeats on and when it stops.");
            start(async () => {
              const r = await saveEventAction(courseId, {
                id: event?.id,
                title: f.title,
                kind: f.kind,
                allDay: f.allDay,
                location: f.location,
                description: f.description,
                occurrences: occurrences(f),
              });
              if (!r.ok) return setError(r.error);
              onOpenChange(false);
              router.refresh();
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
            <Field label="Title">
              <Input required value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="Lecture" />
            </Field>
            <Field label="Kind">
              <Select value={f.kind} onChange={(e) => set("kind", e.target.value as CourseEventRow["kind"])}>
                {Object.entries(KIND_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={f.repeat ? "First day" : "Date"}>
              <Input type="date" required value={f.date} onChange={(e) => set("date", e.target.value)} />
            </Field>
            {!f.allDay && (
              <>
                <Field label="Starts">
                  <Input type="time" required value={f.start} onChange={(e) => set("start", e.target.value)} />
                </Field>
                <Field label="Ends">
                  <Input type="time" value={f.end} onChange={(e) => set("end", e.target.value)} />
                </Field>
              </>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.allDay} onChange={(e) => set("allDay", e.target.checked)} /> All day
          </label>
          {!event && (
            <fieldset className="grid gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={f.repeat} onChange={(e) => set("repeat", e.target.checked)} /> Repeats every week
              </label>
              {f.repeat && (
                <div className="grid gap-3 sm:grid-cols-[1fr_12rem] sm:items-end">
                  <div className="flex flex-wrap gap-3 text-sm" role="group" aria-label="Repeats on">
                    {DAYS.map((d, i) => (
                      <label key={d} className="flex items-center gap-1.5">
                        <input type="checkbox" checked={f.days.includes(i)} onChange={(e) => set("days", e.target.checked ? [...f.days, i] : f.days.filter((x) => x !== i))} />
                        {d}
                      </label>
                    ))}
                  </div>
                  <Field label="Until">
                    <Input type="date" value={f.until} min={f.date} onChange={(e) => set("until", e.target.value)} />
                  </Field>
                </div>
              )}
            </fieldset>
          )}
          <Field label="Where (optional)">
            <Input value={f.location} onChange={(e) => set("location", e.target.value)} placeholder="Room 204" />
          </Field>
          <Field label="Note (optional)">
            <Textarea rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          {error && <StatusText ok={false}>{error}</StatusText>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {event ? "Save" : count > 1 ? `Add ${count} events` : "Add event"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The course's own calendar entries: add (once or weekly), edit, remove. */
export function EventsManager({ courseId, events }: { courseId: string; events: CourseEventRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<CourseEventRow | null | "new">(null);
  const [pending, start] = useTransition();
  const [now] = useState(() => Date.now());
  const upcoming = events.filter((e) => Date.parse(e.endsAt ?? e.startsAt) >= now - 86_400_000);
  const past = events.length - upcoming.length;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {upcoming.length} upcoming{past ? ` · ${past} past` : ""}
        </p>
        <Button size="sm" onClick={() => setEditing("new")}>
          Add event
        </Button>
      </div>
      {upcoming.length === 0 ? (
        <EmptyState>No upcoming events. Add your class times, holidays and reminders.</EmptyState>
      ) : (
        <RowList>
          {upcoming.map((e) => (
            <Row
              key={e.id}
              title={e.title}
              detail={
                <>
                  {KIND_LABEL[e.kind]} · <LocalTime iso={e.startsAt} format={e.allDay ? "date" : "datetime"} />
                  {e.location ? ` · ${e.location}` : ""}
                </>
              }
              aside={
                <>
                  <Button variant="ghost" size="icon" aria-label={`Edit ${e.title}`} onClick={() => setEditing(e)}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${e.title}`}
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const r = await deleteEventAction(courseId, e.id);
                        if (r.ok) router.refresh();
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </>
              }
            />
          ))}
        </RowList>
      )}
      {editing !== null && (
        <EventDialog key={editing === "new" ? "new" : editing.id} courseId={courseId} event={editing === "new" ? null : editing} open onOpenChange={(o) => !o && setEditing(null)} />
      )}
    </div>
  );
}
