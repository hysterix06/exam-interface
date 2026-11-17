"use client";

import { withFormatHint } from "../hints";
import { Prose } from "@/components/ui/prose";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useId } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { nextOptionId } from "../choice-ui";
import type { QuestionTypeUi } from "../ui-types";
import type { OrderingDef, OrderingInstance, OrderingResponse } from "./core";

type StudentInstance = Omit<OrderingInstance, "key">;

function Row({
  id,
  index,
  last,
  readOnly,
  onMove,
  children,
}: {
  id: string;
  index: number;
  last: boolean;
  readOnly?: boolean;
  onMove: (to: number) => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: readOnly });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-md border bg-background px-2 py-2 text-sm ${isDragging ? "z-10 shadow-md" : ""}`}
    >
      {!readOnly && (
        <button
          type="button"
          aria-label={`Drag to reorder. Space to pick up, arrow keys to move.`}
          className="cursor-grab touch-none text-muted-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      )}
      <span className="w-5 text-muted-foreground tabular-nums">{index + 1}.</span>
      <span className="flex-1">{children}</span>
      {!readOnly && (
        <span className="flex">
          <Button type="button" variant="ghost" size="icon-xs" aria-label="Move up" disabled={index === 0} onClick={() => onMove(index - 1)}>
            <ArrowUp />
          </Button>
          <Button type="button" variant="ghost" size="icon-xs" aria-label="Move down" disabled={last} onClick={() => onMove(index + 1)}>
            <ArrowDown />
          </Button>
        </span>
      )}
    </li>
  );
}

function SortableList({
  items,
  readOnly,
  onReorder,
  render,
  labelFor,
}: {
  items: { id: string }[];
  readOnly?: boolean;
  onReorder: (ids: string[]) => void;
  render: (id: string) => React.ReactNode;
  /** What a screen reader calls an item while it is dragged with the keyboard. */
  labelFor: (id: string) => string;
}) {
  // dnd-kit numbers its aria ids from a global counter, which differs between
  // server and client renders; an explicit id keeps hydration stable.
  const dndId = useId();
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const ids = items.map((i) => i.id);
  const move = (from: number, to: number) => onReorder(arrayMove(ids, from, to));
  // dnd-kit's default announcements read out internal ids ("a"); say the item's text and position instead.
  const name = (id: UniqueIdentifier) => `“${labelFor(String(id)) || "item"}”`;
  const at = (id: UniqueIdentifier | undefined) => (id === undefined ? 0 : ids.indexOf(String(id)) + 1);
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${name(active.id)}, position ${at(active.id)} of ${ids.length}.`,
    onDragOver: ({ active, over }) => (over ? `${name(active.id)} is over position ${at(over.id)} of ${ids.length}.` : `${name(active.id)} is no longer over the list.`),
    onDragEnd: ({ active, over }) => (over ? `Dropped ${name(active.id)} at position ${at(over.id)} of ${ids.length}.` : `Dropped ${name(active.id)}; order unchanged.`),
    onDragCancel: ({ active }) => `Cancelled. ${name(active.id)} is back at position ${at(active.id)}.`,
  };
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    move(ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
  };
  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{ announcements, screenReaderInstructions: { draggable: "To move an item, press space or enter, use the arrow keys, then press space or enter again to drop it. Press escape to cancel." } }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className="grid gap-2">
          {ids.map((id, i) => (
            <Row key={id} id={id} index={i} last={i === ids.length - 1} readOnly={readOnly} onMove={(to) => move(i, to)}>
              {render(id)}
            </Row>
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

export const orderingUi: QuestionTypeUi<OrderingDef, StudentInstance, OrderingResponse> = {
  id: "ordering",
  description: "Put items in the right order. Partial credit for each pair in the right relative order.",

  newDef: () => ({
    stem: "",
    items: ["a", "b", "c"].map((id) => ({ id, text: "" })),
  }),

  Editor({ def, onChange }) {
    const set = (items: OrderingDef["items"]) => onChange({ ...def, items });
    return (
      <div className="grid gap-5">
        <Field label="Question" hint={withFormatHint("Say what decides the order, e.g. “Put the stages of mitosis in order, first to last.”")}>
          <Textarea value={def.stem} onChange={(e) => onChange({ ...def, stem: e.target.value })} />
        </Field>
        <div className="grid gap-2">
          <span className="text-sm font-medium">Items, in the correct order</span>
          <p className="text-xs text-muted-foreground">
            Write them top to bottom as they should end up. Students see them shuffled. Partial credit is the share of
            pairs in the right order: swapping two neighbours in a list of five still earns 90%.
          </p>
          <SortableList
            items={def.items}
            onReorder={(ids) => set(ids.map((id) => def.items.find((i) => i.id === id)!))}
            labelFor={(id) => def.items.find((i) => i.id === id)?.text ?? ""}
            render={(id) => {
              const item = def.items.find((i) => i.id === id)!;
              return (
                <span className="flex items-center gap-2">
                  <Input
                    value={item.text}
                    aria-label="Item text"
                    onChange={(e) => set(def.items.map((i) => (i.id === id ? { ...i, text: e.target.value } : i)))}
                  />
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove item" onClick={() => set(def.items.filter((i) => i.id !== id))}>
                    <X />
                  </Button>
                </span>
              );
            }}
          />
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => set([...def.items, { id: nextOptionId(def.items), text: "" }])}>
              <Plus /> Add item
            </Button>
          </div>
        </div>
      </div>
    );
  },

  Renderer({ instance, value, onChange, readOnly }) {
    // Until the student moves something, they see the shuffled order; the
    // first move saves a full answer.
    const shown = value?.order?.length ? value.order : instance.items.map((i) => i.id);
    const byId = new Map(instance.items.map((i) => [i.id, i.text]));
    return (
      <div className="grid gap-4">
        <Prose className="text-base">{instance.stem}</Prose>
        {!readOnly && <p className="text-xs text-muted-foreground">Drag to reorder, or use the arrows. Your order is saved once you move an item.</p>}
        <SortableList
          items={shown.map((id) => ({ id }))}
          readOnly={readOnly}
          onReorder={(order) => onChange?.({ order })}
          render={(id) => byId.get(id) ?? id}
          labelFor={(id) => byId.get(id) ?? ""}
        />
      </div>
    );
  },
};
