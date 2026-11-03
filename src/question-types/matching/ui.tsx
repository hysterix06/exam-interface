"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { nextOptionId } from "../choice-ui";
import type { QuestionTypeUi } from "../ui-types";
import type { MatchingDef, MatchingInstance, MatchingResponse } from "./core";

type StudentInstance = Omit<MatchingInstance, "key">;

export const matchingUi: QuestionTypeUi<MatchingDef, StudentInstance, MatchingResponse> = {
  id: "matching",
  description: "Match each item on the left to its partner on the right. Equal credit per pair.",

  newDef: () => ({
    stem: "",
    pairs: ["a", "b", "c"].map((id) => ({ id, left: "", right: "" })),
    distractors: [],
  }),

  Editor({ def, onChange }) {
    const set = (patch: Partial<MatchingDef>) => onChange({ ...def, ...patch });
    const setPair = (id: string, patch: Partial<MatchingDef["pairs"][number]>) =>
      set({ pairs: def.pairs.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
    return (
      <div className="grid gap-5">
        <Field label="Question">
          <Textarea value={def.stem} onChange={(e) => set({ stem: e.target.value })} />
        </Field>

        <div className="grid gap-2">
          <span className="text-sm font-medium">Pairs</span>
          <p className="text-xs text-muted-foreground">Each row is one correct match. Students see both sides shuffled.</p>
          {def.pairs.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2">
              <Input value={p.left} placeholder="Left" aria-label={`Pair ${i + 1} left`} onChange={(e) => setPair(p.id, { left: e.target.value })} />
              <span className="text-muted-foreground">↔</span>
              <Input value={p.right} placeholder="Right" aria-label={`Pair ${i + 1} right`} onChange={(e) => setPair(p.id, { right: e.target.value })} />
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove pair ${i + 1}`} onClick={() => set({ pairs: def.pairs.filter((x) => x.id !== p.id) })}>
                <X />
              </Button>
            </div>
          ))}
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => set({ pairs: [...def.pairs, { id: nextOptionId(def.pairs.map((p) => ({ id: p.id, text: p.left }))), left: "", right: "" }] })}>
              <Plus /> Add pair
            </Button>
          </div>
        </div>

        <Field label="Extra wrong choices (optional)" hint="One per line. They appear on the right but match nothing, which stops students solving by elimination.">
          <Textarea
            value={def.distractors.join("\n")}
            onChange={(e) => set({ distractors: e.target.value === "" ? [] : e.target.value.split("\n") })}
          />
        </Field>
      </div>
    );
  },

  Renderer({ instance, value, onChange, readOnly }) {
    const matches = value?.matches ?? {};
    return (
      <div className="grid gap-4">
        <p className="whitespace-pre-wrap text-base">{instance.stem}</p>
        <ul className="grid gap-2">
          {instance.lefts.map((l) => (
            <li key={l.id} className="grid items-center gap-2 text-sm sm:grid-cols-[1fr_1fr]">
              <span>{l.text}</span>
              <Select
                // aria-label, not an id reference: ids would repeat when several matching
                // questions share a page (variants table, results).
                aria-label={`Match for ${l.text.trim() || "this item"}`}
                value={matches[l.id] ?? ""}
                disabled={readOnly}
                onChange={(e) => onChange?.({ matches: { ...matches, [l.id]: e.target.value } })}
              >
                <option value="" disabled>
                  Choose a match…
                </option>
                {instance.rights.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.text}
                  </option>
                ))}
              </Select>
            </li>
          ))}
        </ul>
      </div>
    );
  },
};
