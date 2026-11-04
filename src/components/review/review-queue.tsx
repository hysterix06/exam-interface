"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { saveReviewAction } from "@/app/teach/actions";
import { Button } from "@/components/ui/button";
import { fmtNum } from "@/engine/grading/format";
import { keywordHits, wordCount } from "@/question-types/long-answer/core";
import type { ReviewItem } from "@/server/review";

function Highlighted({ text, keywords }: { text: string; keywords: string[] }) {
  const terms = keywords.map((k) => k.trim()).filter(Boolean);
  if (terms.length === 0) return <>{text}</>;
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  return (
    <>
      {parts.map((p, i) =>
        terms.some((t) => t.toLowerCase() === p.toLowerCase()) ? (
          <mark key={i} className="rounded-sm bg-foreground/10 px-0.5 text-foreground">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/**
 * Marks one student's answer at a time. Keyboard: 1–9 toggle criteria,
 * Enter saves and moves on, S skips. The answer is shown with keyword
 * highlights and a word count, which only help scanning: the grader decides.
 */
export function ReviewQueue({ items }: { items: ReviewItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [index, setIndex] = useState(0);
  const [ticked, setTicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const item = items[index];

  const hits = useMemo(() => (item ? keywordHits(item.text, item.instance.keywords) : null), [item]);
  const total = item ? item.instance.rubric.reduce((s, c) => s + c.points, 0) || 1 : 1;
  const awarded = item ? item.instance.rubric.filter((c) => ticked.includes(c.id)).reduce((s, c) => s + (item.points * c.points) / total, 0) : 0;

  const advance = () => {
    setTicked([]);
    setError(null);
    setIndex((i) => i + 1);
  };

  const save = () => {
    if (!item) return;
    start(async () => {
      const r = await saveReviewAction({ attemptItemId: item.attemptItemId, ticked });
      if (!r.ok) return setError(r.error);
      advance();
      router.refresh();
    });
  };

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      const n = Number(e.key);
      if (n >= 1 && n <= item.instance.rubric.length) {
        const id = item.instance.rubric[n - 1].id;
        setTicked((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
      } else if (e.key === "Enter" && !pending) {
        save();
      } else if (e.key.toLowerCase() === "s") {
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, ticked, pending]);

  if (!item) {
    return <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">No more answers to mark for this question.</div>;
  }

  return (
    <div className="grid content-start gap-5">
      <p className="text-sm text-muted-foreground">
        {item.label} · answer {index + 1} of {items.length}
      </p>
      <p className="font-medium">{item.instance.stem}</p>

      <article className="whitespace-pre-wrap rounded-lg border bg-muted/30 p-4 text-sm leading-relaxed" aria-label="Student answer">
        <Highlighted text={item.text} keywords={item.instance.keywords} />
      </article>
      <p className="text-xs text-muted-foreground">
        {wordCount(item.text)} words
        {item.instance.maxWords ? ` (limit ${item.instance.maxWords})` : ""}
        {hits && item.instance.keywords.length > 0 && (
          <>
            {" "}
            · keywords found: {hits.found.length ? hits.found.join(", ") : "none"}
            {hits.missing.length > 0 && <> · not found: {hits.missing.join(", ")}</>}
          </>
        )}
      </p>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">Rubric</legend>
        {item.instance.rubric.map((c, i) => (
          <label key={c.id} className="flex items-start gap-3 rounded-md border px-3 py-2 text-sm has-[:checked]:border-foreground has-[:checked]:bg-muted">
            <input
              type="checkbox"
              className="mt-0.5 accent-foreground"
              checked={ticked.includes(c.id)}
              onChange={() => setTicked((t) => (t.includes(c.id) ? t.filter((x) => x !== c.id) : [...t, c.id]))}
            />
            <span className="flex-1">{c.text}</span>
            <kbd className="rounded border px-1.5 text-xs text-muted-foreground">{i + 1}</kbd>
            <span className="w-14 text-right text-xs text-muted-foreground tabular-nums">{fmtNum(Math.round(((item.points * c.points) / total) * 100) / 100)} pt</span>
          </label>
        ))}
      </fieldset>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          Save {fmtNum(Math.round(awarded * 100) / 100)} / {fmtNum(item.points)} &amp; next
        </Button>
        <Button variant="ghost" onClick={advance} disabled={pending}>
          Skip
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">1–9 tick · Enter save · S skip</span>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
