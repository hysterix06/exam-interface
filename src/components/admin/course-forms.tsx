"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addMembersAction, createCourseAction, removeMemberAction, setArchivedAction, updateCourseAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { StatusText } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";

export function NewCourse({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New course</Button>
      </DialogTrigger>
      <DialogContent title="New course" description="Next, assign a teacher and enrol students.">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            start(async () => {
              const r = await createCourseAction({ code: String(f.get("code") ?? ""), title: String(f.get("title") ?? "") });
              if (!r.ok) return setError(r.error);
              router.push(`/admin/courses/${r.id}`);
            });
          }}
        >
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <Field label="Code">
              <Input name="code" placeholder="BIO 101" />
            </Field>
            <Field label="Title">
              <Input name="title" required placeholder="Introduction to Biology" />
            </Field>
          </div>
          {error && <StatusText ok={false}>{error}</StatusText>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              Create course
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CourseDetailsForm({ id, code, title, archived }: { id: string; code: string | null; title: string; archived: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="grid gap-4">
      <form
        className="grid gap-3 sm:grid-cols-[8rem_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          start(async () => {
            const r = await updateCourseAction(id, { code: String(f.get("code") ?? ""), title: String(f.get("title") ?? "") });
            setMsg(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
            if (r.ok) router.refresh();
          });
        }}
      >
        <Field label="Code">
          <Input name="code" defaultValue={code ?? ""} />
        </Field>
        <Field label="Title">
          <Input name="title" defaultValue={title} required />
        </Field>
        <Button type="submit" variant="outline" disabled={pending}>
          Save
        </Button>
      </form>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await setArchivedAction(id, !archived);
              setMsg(r.ok ? { ok: true, text: archived ? "Restored." : "Archived. It’s hidden from everyone’s lists." } : { ok: false, text: r.error });
              if (r.ok) router.refresh();
            })
          }
        >
          {archived ? "Restore course" : "Archive course"}
        </Button>
        {msg && <StatusText ok={msg.ok}>{msg.text}</StatusText>}
      </div>
    </div>
  );
}

/** Add people who already have accounts, by pasting their emails. */
export function AddMembers({ courseId, role }: { courseId: string; role: "teacher" | "student" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const noun = role === "teacher" ? "teacher" : "student";
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await addMembersAction({ courseId, emails: text, role });
          if (!r.ok) return setMsg({ ok: false, text: r.error });
          const parts = [`Added ${r.added}.`];
          if (r.missing.length) parts.push(`No account for ${r.missing.join(", ")}: add them on the People page first.`);
          if (r.skipped.length) parts.push(`${r.skipped.join(", ")} ${r.skipped.length === 1 ? "is a student" : "are students"}, so can’t teach.`);
          setMsg({ ok: r.missing.length === 0 && r.skipped.length === 0, text: parts.join(" ") });
          setText("");
          router.refresh();
        });
      }}
    >
      {role === "student" ? (
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="Paste student emails, one per line"
          aria-label="Student emails"
        />
      ) : (
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Teacher’s email" aria-label="Teacher email" />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="outline" size="sm" disabled={pending || !text.trim()}>
          Add {noun}
          {role === "student" ? "s" : ""}
        </Button>
        {msg && <StatusText ok={msg.ok}>{msg.text}</StatusText>}
      </div>
    </form>
  );
}

export function RemoveMember({ courseId, userId, name }: { courseId: string; userId: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={`Remove ${name}`}
      title="Remove from course"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await removeMemberAction({ courseId, userId });
          if (r.ok) router.refresh();
        })
      }
    >
      <X />
    </Button>
  );
}
