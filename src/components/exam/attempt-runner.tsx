"use client";

import { Flag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { advanceAttemptAction, attemptClockAction, logEventAction, saveResponseAction, setFlagAction, submitAttemptAction } from "@/app/attempt/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { useTableSignal } from "@/lib/realtime/use-table-signal";
import { getQuestionTypeUi } from "@/question-types/ui-registry";
import { ServerAnswerProvider } from "./server-answer";

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
  hardDeadlineAt,
  itemDeadlineAt,
  cursor,
  total,
  serverNow,
  initialSecondsLeft,
  items: initialItems,
}: {
  attemptId: string;
  examId: string;
  title: string;
  isPreview: boolean;
  oneWay: boolean;
  deadlineAt: string | null;
  /** The deadline plus any late window: when the attempt really closes. */
  hardDeadlineAt: string | null;
  /** Sequential attempts with per-question time: when the current question locks. */
  itemDeadlineAt: string | null;
  /** Sequential attempts: the question the student is on (null = free navigation). */
  cursor: number | null;
  /** How many questions the attempt has (sequential attempts only receive those reached). */
  total: number;
  serverNow: string;
  initialSecondsLeft: number | null;
  items: RunnerItem[];
}) {
  const router = useRouter();
  const sequential = cursor !== null;
  const [items, setItems] = useState(initialItems);
  const [index, setIndex] = useState(cursor ?? 0);
  const [itemEnd, setItemEnd] = useState<number | null>(itemDeadlineAt ? Date.parse(itemDeadlineAt) : null);
  const [itemSecondsLeft, setItemSecondsLeft] = useState<number | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [responses, setResponses] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.response])),
  );
  const [flagged, setFlagged] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.map((i) => [i.id, i.flagged])),
  );
  const [status, setStatus] = useState<SaveStatus>("saved");
  // What the screen reader hears about saving: only trouble, and recovery from
  // it. Announcing "Saving… Saved" after every keystroke would drown the exam.
  const [saveNews, setSaveNews] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [finishing, setFinishing] = useState(false);

  // The countdown follows the server's clock, not the laptop's: the offset is
  // measured against the server and applied on every tick. The deadline itself
  // is re-read from the server, because staff can grant extra time mid-attempt.
  const [clockState, setClockState] = useState({ deadlineAt, hardDeadlineAt, serverNow });
  const deadline = clockState.deadlineAt ? Date.parse(clockState.deadlineAt) : null;
  // Under a late policy the attempt stays open past the deadline, until this.
  const hardEnd = clockState.hardDeadlineAt ? Date.parse(clockState.hardDeadlineAt) : deadline;
  const [lateSeconds, setLateSeconds] = useState(0);
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
          const settled = Object.keys(dirty.current).length === 0;
          setStatus(settled ? "saved" : "saving");
          if (settled) setSaveNews((n) => (n ? "All answers saved." : ""));
        } else if ("closed" in r) {
          router.replace(resultsUrl);
        } else {
          dirty.current[id] ??= value;
          setStatus("error");
          setSaveNews("Your latest answer isn’t saved yet. Retrying.");
        }
      } catch {
        // Offline or a failed request: keep the answer and retry shortly.
        dirty.current[id] ??= value;
        setStatus("error");
        setSaveNews("Your latest answer isn’t saved yet. Retrying.");
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

  // Ask the server for the current deadline. Returns false once the attempt is over.
  const resync = useCallback(async () => {
    try {
      const c = await attemptClockAction(attemptId);
      if (c.finished) {
        router.replace(resultsUrl);
        return false;
      }
      setClockState((prev) => (prev.deadlineAt === c.deadlineAt && prev.hardDeadlineAt === c.hardDeadlineAt ? prev : { deadlineAt: c.deadlineAt, hardDeadlineAt: c.hardDeadlineAt, serverNow: c.serverNow }));
      offset.current = Date.parse(c.serverNow) - Date.now();
      return true;
    } catch {
      return true; // offline: keep the last known deadline
    }
  }, [attemptId, resultsUrl, router]);

  useEffect(() => {
    offset.current = Date.parse(serverNow) - Date.now();
  }, [serverNow]);

  // Countdown. At zero, check with the server first: an extension may have
  // moved the deadline since the last sync. Only then end the attempt.
  const checkingZero = useRef(false);
  useEffect(() => {
    if (deadline === null || hardEnd === null) return;
    const tick = setInterval(() => {
      const now = Date.now() + offset.current;
      setSecondsLeft(Math.max(0, Math.ceil((deadline - now) / 1000)));
      setLateSeconds(Math.max(0, Math.floor((now - deadline) / 1000)));
      const s = Math.max(0, Math.ceil((hardEnd - now) / 1000));
      if (s === 0 && !checkingZero.current) {
        checkingZero.current = true;
        void (async () => {
          const c = await attemptClockAction(attemptId).catch(() => null);
          checkingZero.current = false;
          const end = c && !c.finished ? Date.parse(c.hardDeadlineAt ?? c.deadlineAt ?? "") : NaN;
          if (c && !c.finished && end > hardEnd) {
            offset.current = Date.parse(c.serverNow) - Date.now();
            setClockState({ deadlineAt: c.deadlineAt, hardDeadlineAt: c.hardDeadlineAt, serverNow: c.serverNow });
          } else void finish();
        })();
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [deadline, hardEnd, attemptId, finish]);

  // Pick up extensions (or an early close) as they happen: the attempt row
  // changes, Realtime says so, and the clock is re-read from the server. A
  // one-minute safety poll covers a dropped connection.
  useTableSignal({ table: "attempts", filter: `id=eq.${attemptId}`, onSignal: () => void resync(), fallbackMs: 60_000, connectedMs: 60_000 });

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
    // Idle after two minutes without input; "active" when input resumes.
    const IDLE_MS = 120_000;
    let idle = false;
    let idleTimer = setTimeout(() => {
      idle = true;
      log("idle");
    }, IDLE_MS);
    const onInput = () => {
      if (idle) {
        idle = false;
        log("active");
      }
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        idle = true;
        log("idle");
      }, IDLE_MS);
    };
    const inputs = ["keydown", "pointerdown", "wheel", "touchstart"] as const;
    for (const e of inputs) window.addEventListener(e, onInput, { passive: true });
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
      for (const e of inputs) window.removeEventListener(e, onInput);
      clearTimeout(idleTimer);
    };
  }, [attemptId, isPreview]);

  // Which question is on screen, for "time per question" and the live board (never enforced).
  const viewing = items[index]?.id;
  useEffect(() => {
    if (isPreview || !viewing) return;
    void logEventAction({ attemptId, type: "view", payload: { itemId: viewing } });
  }, [attemptId, isPreview, viewing]);

  // After moving to another question, focus its heading so keyboard and
  // screen-reader users land on the new question rather than on <body>.
  const heading = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    heading.current?.focus();
  }, [index]);

  const go = (to: number) => {
    if (to < 0 || to >= items.length || (oneWay && to < index)) return;
    void flush(items[index].id);
    moved.current = to !== index;
    setIndex(to);
  };

  // Sequential attempts: the server locks this question and hands out the next.
  const advance = useCallback(async () => {
    if (advancing) return;
    setAdvancing(true);
    try {
      await flushAll();
      const r = await advanceAttemptAction(attemptId, index);
      if (!r.ok) {
        if ("closed" in r) router.replace(resultsUrl);
        return;
      }
      if (r.done) {
        setConfirming(true);
        return;
      }
      setItems((list) => (list.some((i) => i.id === r.item.id) ? list : [...list, r.item]));
      setResponses((res) => (r.item.id in res ? res : { ...res, [r.item.id]: r.item.response }));
      setFlagged((f) => (r.item.id in f ? f : { ...f, [r.item.id]: r.item.flagged }));
      seqs.current[r.item.id] ??= r.item.seq;
      setItemEnd(r.itemDeadlineAt ? Date.parse(r.itemDeadlineAt) : null);
      moved.current = true;
      setIndex(r.cursor);
    } finally {
      setAdvancing(false);
    }
  }, [advancing, flushAll, attemptId, index, router, resultsUrl]);

  // Per-question time: at zero the question locks and the next one opens.
  const itemZero = useRef(false);
  useEffect(() => {
    if (itemEnd === null) return;
    itemZero.current = false;
    const tick = setInterval(() => {
      const s = Math.max(0, Math.ceil((itemEnd - (Date.now() + offset.current)) / 1000));
      setItemSecondsLeft(s);
      if (s === 0 && !itemZero.current) {
        itemZero.current = true;
        if (index === total - 1) void finish();
        else void advance();
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [itemEnd, index, total, advance, finish]);

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
  // Spoken once at each threshold: the text only changes when a threshold is crossed.
  const timeNews =
    secondsLeft === null || secondsLeft > 300
      ? ""
      : secondsLeft === 0
        ? "Time is up. Your exam is being submitted."
        : secondsLeft <= 60
          ? "One minute left."
          : "Five minutes left.";
  const unansweredNumbers = items.flatMap((it, i) => (responses[it.id] == null ? [i + 1] : []));
  const flaggedNumbers = items.flatMap((it, i) => (flagged[it.id] ? [i + 1] : []));
  const pick = (i: number) => {
    setConfirming(false);
    go(i);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#question"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:ring-2 focus:ring-ring"
      >
        Skip to question
      </a>
      {isPreview && (
        <p className="border-b bg-muted px-4 py-1.5 text-center text-xs text-muted-foreground">
          Preview. This attempt never counts in results.
        </p>
      )}
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-4 px-4 text-sm">
          <h1 className="truncate font-medium">{title}</h1>
          <span className="text-muted-foreground tabular-nums" aria-hidden>
            {index + 1} / {total}
          </span>
          <span role="status" className={status === "error" ? "text-destructive" : "text-muted-foreground"}>
            <span aria-hidden>{status === "saved" ? "Saved" : status === "saving" ? "Saving…" : "Not saved. Retrying…"}</span>
            <span className="sr-only">{saveNews}</span>
          </span>
          {itemEnd !== null && itemSecondsLeft !== null && (
            <span role="timer" className={`font-mono tabular-nums ${itemSecondsLeft <= 10 ? "font-semibold text-destructive" : "text-muted-foreground"}`} aria-label={`Time left on this question ${clock(itemSecondsLeft)}`}>
              Q {clock(itemSecondsLeft)}
            </span>
          )}
          {secondsLeft !== null && (secondsLeft > 0 || lateSeconds === 0 || hardEnd === deadline) && (
            <span
              role="timer"
              className={`ml-auto font-mono tabular-nums ${urgent ? "font-semibold text-destructive" : ""}`}
              aria-label={`Time left ${clock(secondsLeft)}`}
            >
              {clock(secondsLeft)}
            </span>
          )}
          {secondsLeft === 0 && lateSeconds > 0 && hardEnd !== deadline && (
            <span role="timer" className="ml-auto font-mono font-semibold text-warning tabular-nums" aria-label={`Late by ${clock(lateSeconds)}. A late penalty applies.`}>
              Late +{clock(lateSeconds)}
            </span>
          )}
          <span className="sr-only" aria-live="assertive">
            {timeNews}
          </span>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <div className="grid gap-8">
          <h2 id="question" ref={heading} tabIndex={-1} className="text-xs font-medium text-muted-foreground outline-none">
            Question {index + 1} of {total}
            {flagged[item.id] ? <span className="sr-only">, flagged for review</span> : null}
          </h2>
          {/* A short fade between questions; off for people who ask for reduced motion. */}
          <div key={item.id} className="animate-in fade-in duration-200 motion-reduce:animate-none">
            <ServerAnswerProvider value={{ attemptId, itemId: item.id, onSaved: (v) => setResponses((r) => ({ ...r, [item.id]: v })) }}>
              <Renderer
                instance={item.instance}
                value={responses[item.id] ?? null}
                onChange={(v: unknown) => change(item.id, v)}
              />
            </ServerAnswerProvider>
          </div>
          {/* Outside the keyed block above, so these keep focus when the question changes. */}
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => go(index - 1)} disabled={index === 0 || oneWay}>
              Previous
            </Button>
            {index === total - 1 ? (
              <Button variant="outline" onClick={() => setConfirming(true)}>
                Finish
              </Button>
            ) : sequential ? (
              <Button variant="outline" onClick={() => void advance()} disabled={advancing}>
                {advancing ? "Saving…" : "Next"}
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
                disabled={oneWay && i !== index}
                aria-label={`Question ${i + 1}${responses[it.id] != null ? ", answered" : ""}${flagged[it.id] ? ", flagged" : ""}`}
                aria-current={i === index ? "step" : undefined}
                className="relative flex size-8 items-center justify-center rounded-md border text-xs tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-40 aria-[current=step]:border-foreground aria-[current=step]:font-semibold data-[answered=true]:bg-muted"
                data-answered={responses[it.id] != null}
              >
                {i + 1}
                {flagged[it.id] && <span className="absolute -top-1 -right-1 size-2 rounded-full bg-foreground ring-2 ring-background" />}
              </button>
            ))}
            {/* Questions not reached yet in a sequential attempt: shown, not openable. */}
            {Array.from({ length: total - items.length }, (_, k) => (
              <span key={`later-${k}`} aria-hidden className="flex size-8 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground tabular-nums">
                {items.length + k + 1}
              </span>
            ))}
          </nav>
          <Button onClick={() => setConfirming(true)}>Submit</Button>
        </div>
      </footer>

      <Dialog open={confirming} onOpenChange={(o) => !finishing && setConfirming(o)}>
        <DialogContent
          title="Submit your exam?"
          description={answered === total ? "You’ve answered every question. You can’t change answers after submitting." : "You can’t change answers after submitting."}
        >
          {(answered < items.length || flaggedNumbers.length > 0) && (
            <div className="grid gap-3 text-sm">
              {answered < total && (
                <QuestionLinks label={`${total - answered} unanswered`} numbers={unansweredNumbers} onPick={pick} disabled={oneWay} />
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
            aria-label={`Go to question ${n}`}
            className="flex size-8 items-center justify-center rounded-md border text-xs tabular-nums hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-default disabled:hover:bg-transparent"
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
