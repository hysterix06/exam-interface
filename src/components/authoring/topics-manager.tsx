"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createTopicAction, deleteTopicAction, renameTopicAction } from "@/app/teach/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";

interface Topic {
  id: string;
  name: string;
  questionCount: number;
}

/** One course's topics: rename in place, add, and delete empty ones. */
export function TopicsManager({ courseId, topics }: { courseId: string; topics: Topic[] }) {
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
    <div className="grid gap-3">
      {error ? (
        <Notice tone="error" live>
          {error}
        </Notice>
      ) : null}
      <ul className="divide-y rounded-lg border">
        {topics.map((t) => (
          <TopicRow key={t.id} topic={t} disabled={pending} run={run} />
        ))}
        {topics.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">No topics yet. Topics group questions by what they test.</li>}
      </ul>
      <AddForm disabled={pending} onSubmit={(name) => run(() => createTopicAction({ courseId, name }))} />
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
    <li className="flex items-center gap-3 px-2 py-1.5">
      <Input
        aria-label={`Rename ${topic.name}`}
        className="border-transparent shadow-none hover:border-input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => name.trim() && name.trim() !== topic.name && run(() => renameTopicAction({ id: topic.id, name }))}
      />
      <Link href={`/teach/questions?topic=${topic.id}`} className="shrink-0 text-sm text-muted-foreground tabular-nums hover:text-foreground">
        {topic.questionCount} {topic.questionCount === 1 ? "question" : "questions"}
      </Link>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete ${topic.name}`}
        title={topic.questionCount > 0 ? "Only empty topics can be deleted" : undefined}
        disabled={disabled || topic.questionCount > 0}
        onClick={() => run(() => deleteTopicAction(topic.id))}
      >
        <Trash2 />
      </Button>
    </li>
  );
}

function AddForm({ disabled, onSubmit }: { disabled: boolean; onSubmit: (value: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onSubmit(value);
        setValue("");
      }}
    >
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="New topic, e.g. Cell Biology" aria-label="New topic name" />
      <Button type="submit" variant="outline" disabled={disabled || !value.trim()}>
        Add topic
      </Button>
    </form>
  );
}
