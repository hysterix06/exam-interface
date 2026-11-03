"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createCourseAction,
  createTopicAction,
  deleteTopicAction,
  renameTopicAction,
} from "@/app/author/topics/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Course {
  id: string;
  code: string | null;
  title: string;
}
interface Topic {
  id: string;
  courseId: string;
  name: string;
  questionCount: number;
}

export function TopicsManager({ courses, topics }: { courses: Course[]; topics: Topic[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? null : (r.error ?? "Something went wrong."));
      if (r.ok) router.refresh();
    });

  return (
    <div className="grid gap-8">
      {error ? (
        <p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {courses.map((course) => (
        <section key={course.id}>
          <h2 className="mb-3 font-medium">
            {course.title}
            {course.code ? <span className="ml-2 text-sm text-muted-foreground">{course.code}</span> : null}
          </h2>
          <ul className="divide-y rounded-lg border">
            {topics
              .filter((t) => t.courseId === course.id)
              .map((t) => (
                <TopicRow key={t.id} topic={t} disabled={pending} run={run} />
              ))}
            {topics.every((t) => t.courseId !== course.id) && (
              <li className="px-4 py-3 text-sm text-muted-foreground">No topics yet.</li>
            )}
          </ul>
          <AddForm
            placeholder="New topic name"
            label="Add topic"
            disabled={pending}
            onSubmit={(name) => run(() => createTopicAction({ courseId: course.id, name }))}
          />
        </section>
      ))}

      <section className="rounded-lg border border-dashed p-4">
        <h2 className="mb-1 font-medium">New course</h2>
        <p className="mb-3 text-sm text-muted-foreground">Topics and exams belong to a course.</p>
        <CourseForm disabled={pending} onSubmit={(v) => run(() => createCourseAction(v))} />
      </section>
    </div>
  );
}

function TopicRow({
  topic,
  disabled,
  run,
}: {
  topic: Topic;
  disabled: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const [name, setName] = useState(topic.name);
  return (
    <li className="flex items-center gap-3 px-4 py-2">
      <Input
        aria-label={`Rename ${topic.name}`}
        className="border-transparent shadow-none hover:border-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() !== topic.name && run(() => renameTopicAction({ id: topic.id, name }))}
      />
      <span className="shrink-0 text-sm text-muted-foreground">
        {topic.questionCount} {topic.questionCount === 1 ? "question" : "questions"}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete ${topic.name}`}
        disabled={disabled}
        onClick={() => run(() => deleteTopicAction(topic.id))}
      >
        <Trash2 />
      </Button>
    </li>
  );
}

function AddForm({
  placeholder,
  label,
  disabled,
  onSubmit,
}: {
  placeholder: string;
  label: string;
  disabled: boolean;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onSubmit(value);
        setValue("");
      }}
    >
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      <Button type="submit" variant="outline" disabled={disabled}>
        {label}
      </Button>
    </form>
  );
}

function CourseForm({ disabled, onSubmit }: { disabled: boolean; onSubmit: (v: { code: string; title: string }) => void }) {
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onSubmit({ code, title });
        setCode("");
        setTitle("");
      }}
    >
      <Input className="w-32" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Code" aria-label="Course code" />
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Course title" aria-label="Course title" />
      <Button type="submit" variant="outline" disabled={disabled}>
        Add course
      </Button>
    </form>
  );
}
