"use client";

import { Plus, X } from "lucide-react";
import { ChipBoard } from "@/components/dnd/chip-board";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Prose } from "@/components/ui/prose";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { nextOptionId } from "../choice-ui";
import { withFormatHint } from "../hints";
import type { QuestionTypeUi } from "../ui-types";
import type { CategorizationDef, CategorizationInstance, CategorizationResponse } from "./core";

type StudentInstance = Omit<CategorizationInstance, "key" | "penalty">;

export const categorizationUi: QuestionTypeUi<CategorizationDef, StudentInstance, CategorizationResponse> = {
  id: "categorization",
  description: "Sort items into categories by dragging them into buckets. Equal credit per item.",

  newDef: () => ({
    stem: "",
    categories: [
      { id: "a", name: "" },
      { id: "b", name: "" },
    ],
    items: ["1", "2", "3"].map((id) => ({ id, text: "", category: "a" })),
    penalty: 0,
  }),

  Editor({ def, onChange }) {
    const set = (patch: Partial<CategorizationDef>) => onChange({ ...def, ...patch });
    const setCat = (id: string, name: string) => set({ categories: def.categories.map((c) => (c.id === id ? { ...c, name } : c)) });
    const setItem = (id: string, patch: Partial<CategorizationDef["items"][number]>) =>
      set({ items: def.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
    return (
      <div className="grid gap-5">
        <Field label="Question" hint={withFormatHint("Say what decides the category, e.g. “Sort each organism into its kingdom.”")}>
          <Textarea value={def.stem} onChange={(e) => set({ stem: e.target.value })} />
        </Field>

        <div className="grid gap-2">
          <span className="text-sm font-medium">Categories</span>
          <p className="text-xs text-muted-foreground">The buckets students sort into. A category may end up empty.</p>
          {def.categories.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2">
              <Input value={c.name} placeholder={`Category ${i + 1}`} aria-label={`Category ${i + 1} name`} onChange={(e) => setCat(c.id, e.target.value)} />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove category ${i + 1}`}
                onClick={() => set({ categories: def.categories.filter((x) => x.id !== c.id) })}
              >
                <X />
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => set({ categories: [...def.categories, { id: nextOptionId(def.categories.map((c) => ({ id: c.id, text: c.name }))), name: "" }] })}
            >
              <Plus /> Add category
            </Button>
          </div>
        </div>

        <div className="grid gap-2">
          <span className="text-sm font-medium">Items</span>
          <p className="text-xs text-muted-foreground">Each item and the category it belongs in. Students see the items shuffled.</p>
          {def.items.map((it, i) => (
            <div key={it.id} className="flex items-center gap-2">
              <Input value={it.text} placeholder={`Item ${i + 1}`} aria-label={`Item ${i + 1} text`} onChange={(e) => setItem(it.id, { text: e.target.value })} />
              <Select className="w-44" aria-label={`Item ${i + 1} category`} value={it.category} onChange={(e) => setItem(it.id, { category: e.target.value })}>
                {def.categories.map((c, j) => (
                  <option key={c.id} value={c.id}>
                    {c.name.trim() || `Category ${j + 1}`}
                  </option>
                ))}
              </Select>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove item ${i + 1}`} onClick={() => set({ items: def.items.filter((x) => x.id !== it.id) })}>
                <X />
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                set({ items: [...def.items, { id: nextOptionId(def.items.map((x) => ({ id: x.id, text: x.text }))), text: "", category: def.categories[0]?.id ?? "" }] })
              }
            >
              <Plus /> Add item
            </Button>
          </div>
        </div>

        <Field label="Wrong-placement penalty (%)" hint="Share of an item's points lost when it goes in the wrong bucket. 0 = none. The total never goes below 0.">
          <Input
            type="number"
            min={0}
            max={100}
            value={Math.round(def.penalty * 100)}
            onChange={(e) => set({ penalty: Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100 })}
          />
        </Field>
      </div>
    );
  },

  Renderer({ instance, value, onChange, readOnly }) {
    return (
      <div className="grid gap-4">
        <Prose className="text-base">{instance.stem}</Prose>
        <ChipBoard
          layout="buckets"
          bankLabel="Items to sort"
          chips={instance.items}
          containers={instance.categories.map((c) => ({ id: c.id, name: c.name, label: <Prose inline>{c.name}</Prose> }))}
          placement={value?.placement ?? {}}
          readOnly={readOnly}
          onChange={(placement) => onChange?.({ placement })}
        />
      </div>
    );
  },
};
