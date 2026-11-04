"use client";

import { Flag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { logEventAction, saveResponseAction, setFlagAction, submitAttemptAction } from "@/app/attempt/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { getQuestionTypeUi } from "@/question-types/ui-registry";

export interface RunnerItem {
  id: string;
  type: string;
  instance: unknown;
  response: unknown;
  seq: number;
  flagged: boolean;
}

type SaveStatus = "saved" | "saving" | "error";

function clock(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * The exam-taking screen: question, answer, progress, timer, and nothing else.
 * The server owns the clock and the answers; this is a view that autosaves.
 */
export function AttemptRunner({
  attemptId,
  examId,
  title,
  isPreview,
  oneWay,
  deadlineAt,
  serverNow,
  initialSecondsLeft,
  items,
}: {
  attemptId: string;
  examId: string;
  title: string;
  isPreview: boolean;
  oneWay: boolean;
  deadlineAt: string | null;
  serverNow: string;
  initialSecondsLeft: number | null;
  items: RunnerItem[];
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.response])),
  );
  const [flagged, setFlagged] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.flagged])),
  );
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [confirming, setConfirming] = useState(false);
  const [finishing, setFinishing] = useState(false);

  // The countdown follows the server's clock, not the laptop's: the offset is
  // measured once on mount and applied on every tick.
  const deadline = deadlineAt ? Date.parse(deadlineAt) : null;
  const offset = useRef(0);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(initialSecondsLeft);

  const seqs = useRef<Record<string, number>>(Object.fromEntries(items.map((i) => [i.id, i.seq])));
  const dirty = useRef<Record<string, unknown>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const resultsUrl = `/exams/${examId}/results/${attemptId}`;

  const flush = useCallback(
    async (id: string) => {
      if (!(id in dirty.current)) return;
      const value = dirty.current[id];
      delete dirty.current[id];
      const seq = (seqs.current[id] = (seqs.current[id] ?? 0) + 1);
      setStatus("saving");
      try {
        const r = await saveResponseAction({ attemptId, itemId: id, response: value, seq });
        if (r.ok) {
          setStatus(Object.keys(dirty.current).length ? "saving" : "saved");
        } else if ("closed" in r) {
          router.replace(resultsUrl);
        } else {
          dirty.current[id] ??= value;
          setStatus("error");
        }
      } catch {
        // Offline or a failed request: keep the answer and retry shortly.
        dirty.current[id] ??= value;
        setStatus("error");
      }
    },
    [attemptId, resultsUrl, router],
  );

  const flushAll = useCallback(async () => {
    for (const t of Object.values(timers.current)) clearTimeout(t);
    await Promise.all(Object.keys(dirty.current).map(flush));
  }, [flush]);

  const finish = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    await flushAll();
    await submitAttemptAction(attemptId);
    router.replace(resultsUrl);
  }, [attemptId, finishing, flushAll, resultsUrl, router]);

  const change = (id: string, value: unknown) => {
    setResponses((r) => ({ ...r, [id]: value }));
    dirty.current[id] = value;
    setStatus("saving");
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => void flush(id), 500);
  };

  // Countdown; ends the attempt itself when it reaches zero.
  useEffect(() => {
    offset.current = Date.parse(serverNow) - Date.now();
    if (deadline === null) return;
    const tick = setInterval(() => {
      const s = Math.max(0, Math.ceil((deadline - (Date.now() + offset.current)) / 1000));
      setSecondsLeft(s);
      if (s === 0) void finish();
    }, 1000);
    return () => clearInterval(tick);
  }, [deadline, serverNow, finish]);

  // Retry failed saves.
  useEffect(() => {
    const retry = setInterval(() => {
      for (const id of Object.keys(dirty.current)) void flush(id);
    }, 5000);
    return () => clearInterval(retry);
  }, [flush]);

  // Integrity signals for the instructor (never enforced).
  useEffect(() => {
    if (isPreview) return;
    const log = (type: string) => void logEventAction({ attemptId, type });
    const onBlur = () => log("blur");
    const onFocus = () => log("focus");
    const onPaste = () => log("paste");
    const onOffline = () => log("offline");
    const onOnline = () => log("online");
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("paste", onPaste);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("paste", onPaste);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [attemptId, isPreview]);

  const go = (to: number) => {
    if (to < 0 || to >= items.length || (oneWay && to < index)) return;
    void flush(items[index].id);
    setIndex(to);
  };

  const toggleFlag = () => {
    const item = items[index];
    const next = !flagged[item.id];
    setFlagged((f) => ({ ...f, [item.id]: next }));
    void setFlagAction({ attemptId, itemId: item.id, flagged: next });
  };

  const item = items[index];
  const { Renderer } = getQuestionTypeUi(item.type);
  const answered = items.filter((i) => responses[i.id] != null).length;
  const urgent = secondsLeft !== null && secondsLeft <= 300;
  const unansweredNumbers = items.flatMap((it, i) => (responses[it.id] == null ? [i + 1] : []));
  const flaggedNumbers = items.flatMap((it, i) => (flagged[it.id] ? [i + 1] : []));
  const pick = (i: number) => {
    setConfirming(false);
    go(i);
  };

  return (
    <div className="flex min-h-screen flex-col">
      {isPreview && (
        <p className="border-b bg-muted px-4 py-1.5 text-center text-xs text-muted-foreground">
          Preview. This attempt never counts in results.
        </p>
      )}
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-4 px-4 text-sm">
          <span className="truncate font-medium">{title}</span>
          <span className="text-muted-foreground tabular-nums">
            {index + 1} / {items.length}
          </span>
          <span
            role="status"
            className={status === "error" ? "text-destructive" : "text-muted-foreground"}
          >
            {status === "saved" ? "Saved" : status === "saving" ? "Saving…" : "Not saved. Retrying…"}
          </span>
          {secondsLeft !== null && (
            <span
              className={`ml-auto font-mono tabular-nums ${urgent ? "font-semibold text-destructive" : ""}`}
              aria-label={`Time left ${clock(secondsLeft)}`}
            >
              {clock(secondsLeft)}
            </span>
          )}
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        {/* A short fade between questions; off for people who ask for reduced motion. */}
        <div key={item.id} className="grid gap-8 animate-in fade-in duration-200 motion-reduce:animate-none">
          <Renderer
            instance={item.instance}
            value={responses[item.id] ?? null}
            onChange={(v: unknown) => change(item.id, v)}
          />
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => go(index - 1)} disabled={index === 0 || oneWay}>
              Previous
            </Button>
            {index === items.length - 1 ? (
              <Button variant="outline" onClick={() => setConfirming(true)}>
                Finish
              </Button>
            ) : (
              <Button variant="outline" onClick={() => go(index + 1)}>
                Next
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={toggleFlag}
              aria-pressed={flagged[item.id]}
              className="ml-auto"
            >
              <Flag className={flagged[item.id] ? "fill-current" : ""} />
              {flagged[item.id] ? "Flagged" : "Flag for review"}
            </Button>
          </div>
        </div>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-4 px-4 py-3">
          <nav aria-label="Questions" className="flex flex-1 flex-wrap gap-1.5">
            {items.map((it, i) => (
              <button
                key={it.id}
                onClick={() => go(i)}
                disabled={oneWay && i < index}
                aria-label={`Question ${i + 1}${responses[it.id] != null ? ", answered" : ""}${flagged[it.id] ? ", flagged" : ""}`}
                aria-current={i === index ? "step" : undefined}
                className="relative flex size-8 items-center justify-center rounded-md border text-xs tabular-nums disabled:opacity-40 aria-[current=step]:border-foreground aria-[current=step]:font-semibold data-[answered=true]:bg-muted"
                data-answered={responses[it.id] != null}
              >
                {i + 1}
                {flagged[it.id] && <span className="absolute -top-1 -right-1 size-2 rounded-full bg-foreground ring-2 ring-background" />}
              </button>
            ))}
          </nav>
          <Button onClick={() => setConfirming(true)}>Submit</Button>
        </div>
      </footer>

      <Dialog open={confirming} onOpenChange={(o) => !finishing && setConfirming(o)}>
        <DialogContent
          title="Submit your exam?"
          description={answered === items.length ? "You’ve answered every question. You can’t change answers after submitting." : "You can’t change answers after submitting."}
        >
          {(answered < items.length || flaggedNumbers.length > 0) && (
            <div className="grid gap-3 text-sm">
              {answered < items.length && (
                <QuestionLinks label={`${items.length - answered} unanswered`} numbers={unansweredNumbers} onPick={pick} disabled={oneWay} />
              )}
              {flaggedNumbers.length > 0 && <QuestionLinks label={`${flaggedNumbers.length} flagged for review`} numbers={flaggedNumbers} onPick={pick} disabled={oneWay} />}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={finishing}>
              Keep working
            </Button>
            <Button onClick={() => void finish()} disabled={finishing}>
              {finishing ? "Submitting…" : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuestionLinks({ label, numbers, onPick, disabled }: { label: string; numbers: number[]; onPick: (i: number) => void; disabled: boolean }) {
  return (
    <div>
      <p className="mb-1.5 text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {numbers.map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onPick(n - 1)}
            className="flex size-8 items-center justify-center rounded-md border text-xs tabular-nums hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent"
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
