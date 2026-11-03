"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createExamAction } from "@/app/author/exams/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

export function NewExamForm({ courses }: { courses: { id: string; title: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="grid gap-2 sm:grid-cols-[1fr_auto_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await createExamAction({ courseId, title });
          if (!r.ok) return setError(r.error);
          router.push(`/author/exams/${r.id}`);
        });
      }}
    >
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Exam title" aria-label="Exam title" />
      <Select value={courseId} onChange={(e) => setCourseId(e.target.value)} aria-label="Course" className="sm:w-56">
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </Select>
      <Button type="submit" disabled={pending || !title.trim() || !courseId}>
        Create exam
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive sm:col-span-3">
          {error}
        </p>
      ) : null}
    </form>
  );
}
