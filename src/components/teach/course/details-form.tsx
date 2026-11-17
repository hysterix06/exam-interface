"use client";

import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveCourseDetailsAction } from "@/app/teach/courses/actions";
import { Button } from "@/components/ui/button";
import { ButtonTabs } from "@/components/ui/button-tabs";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusText } from "@/components/ui/notice";
import { Prose } from "@/components/ui/prose";
import { Section } from "@/components/ui/section";
import { Textarea } from "@/components/ui/textarea";
import type { CourseInfo } from "@/engine/course";

export interface CourseDetails {
  description: string | null;
  syllabus: string | null;
  term: string | null;
  startsOn: string | null;
  endsOn: string | null;
  info: CourseInfo;
}

/** The course homepage as students see it: blurb, syllabus, dates, and how to reach the teacher. */
export function CourseDetailsForm({ courseId, initial }: { courseId: string; initial: CourseDetails }) {
  const router = useRouter();
  const [d, setD] = useState({
    description: initial.description ?? "",
    syllabus: initial.syllabus ?? "",
    term: initial.term ?? "",
    startsOn: initial.startsOn ?? "",
    endsOn: initial.endsOn ?? "",
    officeHours: initial.info.officeHours ?? "",
    contactNote: initial.info.contactNote ?? "",
    meetings: initial.info.meetings.map((m) => ({ days: m.days, start: m.start ?? "", end: m.end ?? "", location: m.location ?? "" })),
    links: initial.info.links,
  });
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    setMsg(null);
  };

  const save = () =>
    start(async () => {
      const opt = (s: string) => s.trim() || undefined;
      const r = await saveCourseDetailsAction(courseId, {
        description: d.description,
        syllabus: d.syllabus,
        term: d.term,
        startsOn: d.startsOn,
        endsOn: d.endsOn,
        info: {
          officeHours: opt(d.officeHours),
          contactNote: opt(d.contactNote),
          meetings: d.meetings.filter((m) => m.days.trim()).map((m) => ({ days: m.days, start: opt(m.start), end: opt(m.end), location: opt(m.location) })),
          links: d.links.filter((l) => l.label.trim() || l.url.trim()),
        },
      });
      setMsg(r.ok ? { ok: true, text: "Saved. Students see this now." } : { ok: false, text: r.error });
      if (r.ok) router.refresh();
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Section title="About the course">
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Term">
              <Input value={d.term} onChange={(e) => set("term", e.target.value)} placeholder="Autumn 2026" />
            </Field>
            <Field label="Starts">
              <Input type="date" value={d.startsOn} onChange={(e) => set("startsOn", e.target.value)} />
            </Field>
            <Field label="Ends">
              <Input type="date" value={d.endsOn} onChange={(e) => set("endsOn", e.target.value)} />
            </Field>
          </div>
          <Field label="Short description" hint="Shown at the top of the course page. Markdown works.">
            <Textarea rows={3} value={d.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="Syllabus" description="Markdown, with $maths$. Students read it on the Syllabus tab, above the grade weights.">
        <ButtonTabs
          label="Syllabus editor"
          value={tab}
          onChange={(v) => setTab(v as "write" | "preview")}
          options={[
            { value: "write", label: "Write" },
            { value: "preview", label: "Preview" },
          ]}
        />
        <div className="mt-3">
          {tab === "write" ? (
            <Textarea aria-label="Syllabus" rows={18} className="font-mono text-sm" value={d.syllabus} onChange={(e) => set("syllabus", e.target.value)} />
          ) : d.syllabus.trim() ? (
            <div className="min-h-40 rounded-md border p-5">
              <Prose>{d.syllabus}</Prose>
            </div>
          ) : (
            <p className="rounded-md border p-5 text-sm text-muted-foreground">Nothing to preview yet.</p>
          )}
        </div>
      </Section>

      <Section title="Contact">
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Office hours">
              <Textarea rows={3} value={d.officeHours} onChange={(e) => set("officeHours", e.target.value)} placeholder="Tuesdays 14:00–16:00, Room 3.12" />
            </Field>
            <Field label="How to get in touch">
              <Textarea rows={3} value={d.contactNote} onChange={(e) => set("contactNote", e.target.value)} placeholder="Email me; I reply within two working days." />
            </Field>
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Class meetings</legend>
            {d.meetings.map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_6rem_6rem_1fr_auto]">
                <Input aria-label="Days" value={m.days} placeholder="Mon, Wed" onChange={(e) => set("meetings", d.meetings.map((x, j) => (j === i ? { ...x, days: e.target.value } : x)))} />
                <Input aria-label="Starts" type="time" value={m.start} className="hidden sm:block" onChange={(e) => set("meetings", d.meetings.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
                <Input aria-label="Ends" type="time" value={m.end} className="hidden sm:block" onChange={(e) => set("meetings", d.meetings.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
                <Input aria-label="Where" value={m.location} placeholder="Room 204" className="hidden sm:block" onChange={(e) => set("meetings", d.meetings.map((x, j) => (j === i ? { ...x, location: e.target.value } : x)))} />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove meeting" onClick={() => set("meetings", d.meetings.filter((_, j) => j !== i))}>
                  <X />
                </Button>
              </div>
            ))}
            <div>
              <Button type="button" variant="ghost" size="sm" onClick={() => set("meetings", [...d.meetings, { days: "", start: "", end: "", location: "" }])}>
                <Plus /> Add a meeting time
              </Button>
            </div>
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Links</legend>
            {d.links.map((l, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input aria-label="Link text" value={l.label} placeholder="Reading list" onChange={(e) => set("links", d.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <Input aria-label="Address" type="url" value={l.url} placeholder="https://" onChange={(e) => set("links", d.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
                <Button type="button" variant="ghost" size="icon" aria-label="Remove link" onClick={() => set("links", d.links.filter((_, j) => j !== i))}>
                  <X />
                </Button>
              </div>
            ))}
            <div>
              <Button type="button" variant="ghost" size="sm" onClick={() => set("links", [...d.links, { label: "", url: "" }])}>
                <Plus /> Add a link
              </Button>
            </div>
          </fieldset>
        </div>
      </Section>

      <div className="sticky bottom-0 mt-10 flex items-center gap-4 border-t bg-background py-4">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {msg && <StatusText ok={msg.ok}>{msg.text}</StatusText>}
      </div>
    </form>
  );
}
