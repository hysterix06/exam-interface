"use client";

import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useId, useState } from "react";
import { cn } from "cn";
import { Prose } from "@/components/ui/prose";

export interface Chip {
  id: string;
  text: string;
}

export interface ChipContainer {
  id: string;
  /** Visible label (a left-hand item, a bucket name, a pin number). */
  label: React.ReactNode;
  /** Plain name for screen readers: "Mitochondrion", "Bucket: Mammals". */
  name: string;
  /** 1 = a slot that holds one chip (placing another sends the old one back). Omit for unlimited. */
  capacity?: number;
}

/** Which container each placed chip is in; chips not listed are in the bank. */
export type Placement = Record<string, string>;

const BANK = "__bank__";

/**
 * Drag chips into slots or buckets. Every action also works without dragging:
 * tap (or press Enter on) a chip to pick it up, then tap a slot, bucket or the
 * bank to put it there. That path is what keyboard, switch and screen-reader
 * users get, and it is just as fast on a phone.
 */
export function ChipBoard({
  chips,
  containers,
  placement,
  onChange,
  readOnly,
  layout = "slots",
  bankLabel = "Choices",
}: {
  chips: Chip[];
  containers: ChipContainer[];
  placement: Placement;
  onChange?: (next: Placement) => void;
  readOnly?: boolean;
  layout?: "slots" | "buckets";
  bankLabel?: string;
}) {
  const [held, setHeld] = useState<string | null>(null);
  const [news, setNews] = useState("");
  // Pointer only: keyboard users take the tap path (Enter on a chip, Enter on a slot),
  // which dnd-kit's keyboard sensor would otherwise swallow.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  // A stable id keeps dnd-kit's accessibility ids the same on server and client (no hydration mismatch).
  const dndId = useId();
  const known = new Set(containers.map((c) => c.id));
  const where = (chipId: string) => (known.has(placement[chipId]) ? placement[chipId] : BANK);
  const inside = (containerId: string) => chips.filter((c) => where(c.id) === containerId);
  const chipText = (id: string) => chips.find((c) => c.id === id)?.text ?? id;
  const nameOf = (id: string) => (id === BANK ? bankLabel : containers.find((c) => c.id === id)?.name ?? id);

  const move = (chipId: string, to: string) => {
    if (readOnly || !onChange) return;
    const next: Placement = { ...placement };
    if (to === BANK) delete next[chipId];
    else {
      const cap = containers.find((c) => c.id === to)?.capacity;
      if (cap !== undefined) {
        // A full slot gives its oldest chip back to the bank.
        const there = Object.keys(next).filter((k) => next[k] === to && k !== chipId);
        for (const k of there.slice(0, Math.max(0, there.length - cap + 1))) delete next[k];
      }
      next[chipId] = to;
    }
    onChange(next);
    setHeld(null);
    setNews(`${chipText(chipId)} placed in ${nameOf(to)}.`);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const chip = String(e.active.id).replace(/^chip:/, "");
    const to = e.over ? String(e.over.id).replace(/^drop:/, "") : null;
    if (to) move(chip, to);
  };

  const tapContainer = (id: string) => {
    if (held) move(held, id);
  };

  const body = (
    <div className="grid gap-4">
      <div className={layout === "buckets" ? "grid gap-3 sm:grid-cols-2" : "grid gap-2"}>
        {containers.map((c) => (
          <Drop key={c.id} id={c.id} disabled={readOnly}>
            {(isOver) => (
              <div
                className={cn(
                  layout === "buckets" ? "grid content-start gap-2 rounded-lg border p-3" : "grid items-center gap-2 text-sm sm:grid-cols-[1fr_1fr]",
                  isOver && "ring-2 ring-ring",
                )}
              >
                <div className={layout === "buckets" ? "text-sm font-medium" : ""}>{c.label}</div>
                <div
                  role={held && !readOnly ? "button" : undefined}
                  tabIndex={held && !readOnly ? 0 : undefined}
                  aria-label={held && !readOnly ? `Put ${chipText(held)} in ${c.name}` : undefined}
                  onClick={() => tapContainer(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      tapContainer(c.id);
                    }
                  }}
                  className={cn(
                    "flex min-h-10 flex-wrap items-center gap-2 rounded-md border border-dashed px-2 py-1.5",
                    held && !readOnly && "cursor-pointer border-ring bg-muted/40",
                  )}
                >
                  {inside(c.id).map((chip) => (
                    <ChipButton key={chip.id} chip={chip} held={held === chip.id} readOnly={readOnly} onTap={() => setHeld(held === chip.id ? null : chip.id)} />
                  ))}
                  {inside(c.id).length === 0 && <span className="text-xs text-muted-foreground">{readOnly ? "nothing placed" : held ? "Put it here" : "Drop here"}</span>}
                </div>
              </div>
            )}
          </Drop>
        ))}
      </div>

      {!readOnly && (
        <Drop id={BANK}>
          {(isOver) => (
            <div className={cn("grid gap-2 rounded-lg bg-muted/40 p-3", isOver && "ring-2 ring-ring")}>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{bankLabel}</span>
                {held && (
                  <button type="button" className="underline underline-offset-2" onClick={() => move(held, BANK)}>
                    Put {chipText(held)} back
                  </button>
                )}
              </div>
              <div className="flex min-h-10 flex-wrap gap-2">
                {inside(BANK).map((chip) => (
                  <ChipButton key={chip.id} chip={chip} held={held === chip.id} onTap={() => setHeld(held === chip.id ? null : chip.id)} />
                ))}
                {inside(BANK).length === 0 && <span className="text-xs text-muted-foreground">All placed.</span>}
              </div>
              <p className="text-xs text-muted-foreground">Drag a choice into place, or tap it and then tap where it goes.</p>
            </div>
          )}
        </Drop>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {held ? `${chipText(held)} picked up. Choose where to put it.` : news}
      </p>
    </div>
  );

  return readOnly ? body : <DndContext id={dndId} sensors={sensors} onDragEnd={onDragEnd}>{body}</DndContext>;
}

/** A drop target; `as="span"` for one that sits inside a sentence. */
export function Drop({ id, disabled, children, as = "div" }: { id: string; disabled?: boolean; children: (isOver: boolean) => React.ReactNode; as?: "div" | "span" }) {
  const { setNodeRef, isOver } = useDroppable({ id: `drop:${id}`, disabled });
  const Tag = as;
  return <Tag ref={setNodeRef}>{children(isOver)}</Tag>;
}

/** The drag context ChipBoard uses, for layouts it doesn't cover (blanks inside a sentence). */
export function ChipDnd({ onDrop, children }: { onDrop: (chipId: string, targetId: string) => void; children: React.ReactNode }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const dndId = useId();
  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      onDragEnd={(e) => {
        if (e.over) onDrop(String(e.active.id).replace(/^chip:/, ""), String(e.over.id).replace(/^drop:/, ""));
      }}
    >
      {children}
    </DndContext>
  );
}

export function ChipButton({ chip, held, readOnly, onTap }: { chip: Chip; held: boolean; readOnly?: boolean; onTap: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `chip:${chip.id}`, disabled: readOnly });
  if (readOnly) {
    return (
      <span className="rounded-md border bg-background px-2 py-1 text-sm">
        <Prose inline>{chip.text}</Prose>
      </span>
    );
  }
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      // The tap path: a click (or Enter/Space) picks the chip up; dragging needs real movement.
      onClick={onTap}
      aria-pressed={held}
      // A half-written question can have a chip with no text yet; it still needs a name.
      aria-label={chip.text.trim() ? undefined : "Empty choice"}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "touch-none rounded-md border bg-background px-2 py-1 text-sm shadow-xs",
        held && "border-foreground ring-2 ring-ring",
        isDragging && "z-10 opacity-80 shadow-md",
      )}
    >
      <Prose inline>{chip.text}</Prose>
    </button>
  );
}
