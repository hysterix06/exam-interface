"use client";

import { Plus, X } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface OptionLike {
  id: string;
  text: string;
}

/** Next option id that isn't taken: "o1", "o2", ... */
export function nextOptionId(options: readonly OptionLike[]) {
  const taken = new Set(options.map((o) => o.id));
  for (let n = options.length + 1; ; n++) if (!taken.has(`o${n}`)) return `o${n}`;
}

/** Radio/checkbox list shared by the choice-type renderers. */
export function ChoiceList({
  options,
  selected,
  multiple,
  readOnly,
  onToggle,
}: {
  options: readonly OptionLike[];
  selected: readonly string[];
  multiple: boolean;
  readOnly?: boolean;
  onToggle?: (id: string) => void;
}) {
  // Unique per instance: radios sharing a name would uncheck each other across
  // rows when many read-only renderers are on one page (variant explorer).
  const name = useId();
  return (
    <div role={multiple ? "group" : "radiogroup"} className="grid gap-2">
      {options.map((o) => (
        <label
          key={o.id}
          className="flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm has-[:checked]:border-foreground has-[:checked]:bg-muted"
        >
          <input
            type={multiple ? "checkbox" : "radio"}
            name={name}
            className="mt-0.5 accent-foreground"
            checked={selected.includes(o.id)}
            disabled={readOnly}
            onChange={() => onToggle?.(o.id)}
          />
          <span>{o.text}</span>
        </label>
      ))}
    </div>
  );
}

/** Editable options list; `mark` renders the per-option correctness control. */
export function OptionRows<T extends OptionLike>({
  options,
  onChange,
  mark,
  extra,
  makeOption,
}: {
  options: T[];
  onChange: (options: T[]) => void;
  mark: (o: T, index: number) => React.ReactNode;
  extra?: (o: T, update: (patch: Partial<T>) => void) => React.ReactNode;
  makeOption: (id: string) => T;
}) {
  const update = (i: number, patch: Partial<T>) =>
    onChange(options.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  return (
    <div className="grid gap-2">
      {options.map((o, i) => (
        <div key={o.id} className="grid gap-1.5">
          <div className="flex items-center gap-2">
            {mark(o, i)}
            <Input
              value={o.text}
              placeholder={`Option ${i + 1}`}
              aria-label={`Option ${i + 1} text`}
              onChange={(e) => update(i, { text: e.target.value } as Partial<T>)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove option ${i + 1}`}
              onClick={() => onChange(options.filter((_, j) => j !== i))}
            >
              <X />
            </Button>
          </div>
          {extra?.(o, (patch) => update(i, patch))}
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...options, makeOption(nextOptionId(options))])}
        >
          <Plus /> Add option
        </Button>
      </div>
    </div>
  );
}
