"use client";

import { Prose } from "@/components/ui/prose";
import { useMemo, useState } from "react";
import { ChipButton, ChipDnd, Drop } from "@/components/dnd/chip-board";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { parseCloze } from "@/engine/cloze";
import type { QuestionTypeUi } from "../ui-types";
import type { ClozeDef, ClozeResponse } from "./core";

type StudentSegment =
  | { kind: "lit"; text: string }
  | { kind: "text" | "num" | "chip"; id: string }
  | { kind: "select"; id: string; options: string[] };
type StudentInstance = { segments: StudentSegment[]; chips?: string[] };

const KIND_LABEL = { text: "text", num: "number", select: "dropdown", chip: "chip" } as const;

export const clozeUi: QuestionTypeUi<ClozeDef, StudentInstance, ClozeResponse> = {
  id: "cloze",
  description: "A sentence with blanks: typed text, numbers with a margin, dropdowns or drag-in chips.",

  newDef: () => ({ template: "" }),

  Editor({ def, onChange }) {
    const parsed = useMemo(() => parseCloze(def.template, { allowChips: true }), [def.template]);
    const hasChips = parsed.blanks.some((b) => b.kind === "chip");
    return (
      <div className="grid gap-5">
        <Field
          label="Sentence with blanks"
          hint={
            <>
              Write the sentence and put each blank in double braces.
              <br />
              Text: <code>{"{{text:Paris|paris}}"}</code> (any of the answers). Number:{" "}
              <code>{"{{num:4±0.1}}"}</code> or <code>{"{{num:100±5%}}"}</code>. Dropdown:{" "}
              <code>{"{{select:red|blue*|green}}"}</code> (star marks the correct one). Drag-in chip:{" "}
              <code>{"{{chip:Paris}}"}</code> (every chip goes into one shared bank). Markdown and $$maths$$ work in the
              sentence.
            </>
          }
        >
          <Textarea
            className="min-h-32 font-mono"
            value={def.template}
            onChange={(e) => onChange({ ...def, template: e.target.value })}
          />
        </Field>

        {(hasChips || (def.extraChips?.length ?? 0) > 0) && (
          <Field label="Extra chips (optional)" hint="One per line. Wrong chips added to the bank, so the last chip isn't a giveaway.">
            <Textarea
              className="min-h-16"
              value={(def.extraChips ?? []).join("\n")}
              onChange={(e) => onChange({ ...def, extraChips: e.target.value === "" ? undefined : e.target.value.split("\n") })}
            />
          </Field>
        )}

        {parsed.errors.length > 0 ? (
          <div role="alert">
            <ul className="grid gap-1 text-sm text-destructive">
              {parsed.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <p className="mb-2 font-medium">
              {parsed.blanks.length} {parsed.blanks.length === 1 ? "blank" : "blanks"}, each worth an equal share
            </p>
            <ol className="grid gap-1 text-muted-foreground">
              {parsed.blanks.map((b, i) => (
                <li key={b.id}>
                  Blank {i + 1} ({KIND_LABEL[b.kind]}):{" "}
                  {b.kind === "text"
                    ? b.accepted.join(" or ")
                    : b.kind === "num"
                      ? `${b.value}${b.abs ? ` ± ${b.abs}` : b.rel ? ` ± ${b.rel * 100}%` : " exactly"}`
                      : b.kind === "chip"
                        ? b.answer
                        : `${b.correct} (of ${b.options.length})`}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    );
  },

  Renderer({ instance, value, onChange, readOnly }) {
    const blanks = useMemo(() => value?.blanks ?? {}, [value]);
    const set = (id: string, v: string) => onChange?.({ blanks: { ...blanks, [id]: v } });
    const [held, setHeld] = useState<string | null>(null);
    const chips = useMemo(() => (instance.chips ?? []).map((text, i) => ({ id: `c${i}`, text })), [instance.chips]);
    // Which chip sits in which blank. Responses store the chip's text, so with
    // duplicate texts the first unused chip of that text is the one shown.
    const placed = useMemo(() => {
      const used = new Map<string, string>();
      for (const s of instance.segments) {
        if (s.kind !== "chip" || !blanks[s.id]) continue;
        const chip = chips.find((c) => c.text === blanks[s.id] && ![...used.values()].includes(c.id));
        if (chip) used.set(s.id, chip.id);
      }
      return used;
    }, [instance.segments, blanks, chips]);
    const inBank = chips.filter((c) => ![...placed.values()].includes(c.id));
    const textOf = (chipId: string) => chips.find((c) => c.id === chipId)?.text ?? "";
    const place = (chipId: string, target: string) => {
      if (readOnly) return;
      const next = { ...blanks };
      for (const [blank, c] of placed) if (c === chipId) delete next[blank];
      if (target !== "bank") next[target] = textOf(chipId);
      onChange?.({ blanks: next });
      setHeld(null);
    };
    let n = 0;
    const sentence = (
      <p className="text-base leading-10">
        {instance.segments.map((s, i) => {
          if (s.kind === "lit") return <LitText key={i} text={s.text} />;
          n++;
          const label = `Blank ${n}`;
          if (s.kind === "chip") {
            const chipId = placed.get(s.id);
            return (
              <Drop key={i} id={s.id} as="span" disabled={readOnly}>
                {(isOver) => (
                  <span
                    role={held && !readOnly ? "button" : undefined}
                    tabIndex={held && !readOnly ? 0 : undefined}
                    aria-label={held && !readOnly ? `Put ${textOf(held)} in ${label}` : `${label}${chipId ? `: ${textOf(chipId)}` : ", empty"}`}
                    onClick={() => held && place(held, s.id)}
                    onKeyDown={(e) => {
                      if (held && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        place(held, s.id);
                      }
                    }}
                    className={`mx-1 inline-flex min-h-8 min-w-24 items-center justify-center rounded-md border border-dashed px-1 align-middle ${isOver ? "ring-2 ring-ring" : ""} ${held && !readOnly ? "cursor-pointer border-ring bg-muted/40" : ""}`}
                  >
                    {chipId ? (
                      <ChipButton chip={{ id: chipId, text: textOf(chipId) }} held={held === chipId} readOnly={readOnly} onTap={() => setHeld(held === chipId ? null : chipId)} />
                    ) : (
                      <span className="px-1 text-xs text-muted-foreground">{readOnly ? "—" : "drop here"}</span>
                    )}
                  </span>
                )}
              </Drop>
            );
          }
          return s.kind === "select" ? (
            <Select
              key={i}
              aria-label={label}
              className="mx-1 inline-block w-auto min-w-28 align-middle"
              value={blanks[s.id] ?? ""}
              disabled={readOnly}
              onChange={(e) => set(s.id, e.target.value)}
            >
              <option value="" disabled>
                Choose…
              </option>
              {s.options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              key={i}
              aria-label={label}
              autoComplete="off"
              inputMode={s.kind === "num" ? "decimal" : undefined}
              className="mx-1 inline-block h-8 w-36 align-middle"
              value={blanks[s.id] ?? ""}
              readOnly={readOnly}
              onChange={(e) => set(s.id, e.target.value)}
            />
          );
        })}
      </p>
    );
    if (chips.length === 0 || readOnly) return sentence;
    return (
      <ChipDnd onDrop={place}>
        <div className="grid gap-4">
          {sentence}
          <Drop id="bank">
            {(isOver) => (
              <div className={`grid gap-2 rounded-lg bg-muted/40 p-3 ${isOver ? "ring-2 ring-ring" : ""}`}>
                <div className="flex min-h-10 flex-wrap gap-2">
                  {inBank.map((c) => (
                    <ChipButton key={c.id} chip={c} held={held === c.id} onTap={() => setHeld(held === c.id ? null : c.id)} />
                  ))}
                  {inBank.length === 0 && <span className="text-xs text-muted-foreground">All chips placed.</span>}
                </div>
                <p className="text-xs text-muted-foreground">
                  Drag a chip into a blank, or tap it and then tap the blank.
                  {held && (
                    <>
                      {" "}
                      <button type="button" className="underline underline-offset-2" onClick={() => place(held, "bank")}>
                        Put {textOf(held)} back
                      </button>
                    </>
                  )}
                </p>
              </div>
            )}
          </Drop>
          <p className="sr-only" role="status" aria-live="polite">
            {held ? `${textOf(held)} picked up. Choose a blank.` : ""}
          </p>
        </div>
      </ChipDnd>
    );
  },
};

/**
 * A run of sentence between blanks, as inline Markdown. Markdown trims the
 * edges, but "is " before a blank needs its space, so the edges are kept as
 * typed and only the middle is rendered.
 */
function LitText({ text }: { text: string }) {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
  return (
    <span className="whitespace-pre-wrap">
      {m[1]}
      {m[2] ? <Prose inline>{m[2]}</Prose> : null}
      {m[3]}
    </span>
  );
}
