"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createAssignmentAction } from "@/app/teach/assignments/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusText } from "@/components/ui/notice";
import { Select } from "@/components/ui/select";

export function NewAssignmentForm({ courses }: { courses: { id: string; title: string }[] }) {
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
          const r = await createAssignmentAction({ courseId, title });
          if (!r.ok) return setError(r.error);
          router.push(`/teach/assignments/${r.id}`);
        });
      }}
    >
      <Input aria-label="New assignment title" placeholder="New assignment, e.g. Lab report 2" value={title} onChange={(e) => setTitle(e.target.value)} required />
      {courses.length > 1 && (
        <Select aria-label="Course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </Select>
      )}
      <Button type="submit" variant="outline" disabled={pending || !title.trim()}>
        Create assignment
      </Button>
      {error && <StatusText ok={false}>{error}</StatusText>}
    </form>
  );
}
