"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createExamAction } from "@/app/teach/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function NewExamForm({ courses, autoFocus = false }: { courses: { id: string; title: string }[]; autoFocus?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className={courses.length > 1 ? "grid gap-2 sm:grid-cols-[1fr_auto_auto]" : "grid gap-2 sm:grid-cols-[1fr_auto]"}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createExamAction({ courseId, title });
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
      <Button type="submit" disabled={pending || !title.trim() || !courseId}>
        Create exam
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive sm:col-span-full">
          {error}
        </p>
      ) : null}
    </form>
  );
}
