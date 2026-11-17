"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createExamAction } from "@/app/teach/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EXAM_TEMPLATES, templateById } from "@/engine/exam-templates";

export function NewExamForm({ courses, autoFocus = false }: { courses: { id: string; title: string }[]; autoFocus?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState("blank");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className={courses.length > 1 ? "grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]" : "grid gap-2 sm:grid-cols-[1fr_auto_auto]"}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createExamAction({ courseId, title, template });
          if (!r.ok) return setError(r.error);
          router.push(`/teach/exams/${r.id}`);
        });
      }}
    >
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New exam title, e.g. Midterm" aria-label="New exam title" autoFocus={autoFocus} />
      {courses.length > 1 && (
        <Select value={courseId} onChange={(e) => setCourseId(e.target.value)} aria-label="Course" className="sm:w-56">
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </Select>
      )}
      <Select value={template} onChange={(e) => setTemplate(e.target.value)} aria-label="Start from" className="sm:w-40">
        {EXAM_TEMPLATES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.id === "blank" ? "Start blank" : t.label}
          </option>
        ))}
      </Select>
      <Button type="submit" disabled={pending || !title.trim() || !courseId}>
        Create exam
      </Button>
      <p className="text-xs text-muted-foreground sm:col-span-full">{templateById(template).description} You can change everything afterwards.</p>
      {error ? (
        <p role="alert" className="text-sm text-destructive sm:col-span-full">
          {error}
        </p>
      ) : null}
    </form>
  );
}
