"use client";

import { Play, Plus, X } from "lucide-react";
import { useId, useState } from "react";
import { CodeEditor } from "@/components/code/code-editor";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Prose } from "@/components/ui/prose";
import { Textarea } from "@/components/ui/textarea";
import { type CodeTest, initSandbox, runTests, type TestRun } from "@/engine/sandbox/quickjs";
import { nextOptionId } from "../choice-ui";
import { withFormatHint } from "../hints";
import type { QuestionTypeUi } from "../ui-types";
import type { CodeDef, CodeResponse } from "./core";

type StudentInstance = { stem: string; language: "javascript"; starter: string; tests: Omit<CodeTest, "hidden" | "tolerance">[] };

function Results({ tests, runs }: { tests: { id: string; label: string; call: string; expected: string }[]; runs: TestRun[] }) {
  return (
    <div role="status">
    <ul className="grid gap-1 text-sm">
      {tests.map((t, i) => {
        const r = runs[i];
        return (
          <li key={t.id} className={r?.ok ? "text-success" : "text-destructive"}>
            {r?.ok ? "✓" : "✗"} {t.label || t.call}: <code>{t.call}</code> → <code>{r?.error ?? r?.got}</code>
            {!r?.ok && !r?.error && (
              <>
                {" "}
                (expected <code>{t.expected}</code>)
              </>
            )}
            {r?.output && <pre className="mt-1 max-h-24 overflow-auto rounded bg-muted p-2 text-xs text-muted-foreground">{r.output}</pre>}
          </li>
        );
      })}
    </ul>
    </div>
  );
}

export const codeUi: QuestionTypeUi<CodeDef, StudentInstance, CodeResponse> = {
  id: "code",
  description: "Write a JavaScript function. It runs against test cases in a sandbox; hidden tests stop hard-coding.",

  newDef: () => ({
    stem: "",
    language: "javascript",
    starter: "function solve(input) {\n  // your code\n}\n",
    solution: "",
    tests: [{ id: "a", label: "", call: "solve(1)", expected: "1", hidden: false }],
    stepLimit: 2000,
  }),

  Editor({ def, onChange }) {
    const set = (patch: Partial<CodeDef>) => onChange({ ...def, ...patch });
    const setTest = (id: string, patch: Partial<CodeDef["tests"][number]>) => set({ tests: def.tests.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
    return (
      <div className="grid gap-5">
        <Field label="Task" hint={withFormatHint("Name the function and say what it returns, e.g. “Write `total(prices)` that returns the sum.”")}>
          <Textarea value={def.stem} onChange={(e) => set({ stem: e.target.value })} />
        </Field>
        <div className="grid gap-1.5 text-sm">
          <span className="font-medium">Starter code</span>
          <CodeEditor label="Starter code" value={def.starter} onChange={(starter) => set({ starter })} minLines={5} />
        </div>
        <div className="grid gap-1.5 text-sm">
          <span className="font-medium">Model solution</span>
          <span className="text-xs text-muted-foreground">Must pass every test. It is the answer key, and pre-flight runs it.</span>
          <CodeEditor label="Model solution" value={def.solution} onChange={(solution) => set({ solution })} minLines={6} />
        </div>
        <div className="grid gap-2">
          <span className="text-sm font-medium">Tests</span>
          <p className="text-xs text-muted-foreground">
            A call and the value it must return, as JSON (5, &quot;text&quot;, [1, 2], {"{"}&quot;a&quot;: 1{"}"}). Each test is worth an equal share. Hidden tests aren&apos;t shown to students
            before release.
          </p>
          {def.tests.map((t, i) => (
            <div key={t.id} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_1fr_8rem_auto_auto]">
              <Input className="font-mono" aria-label={`Test ${i + 1} call`} placeholder="total([1, 2])" value={t.call} onChange={(e) => setTest(t.id, { call: e.target.value })} />
              <Input className="font-mono" aria-label={`Test ${i + 1} expected value`} placeholder="3" value={t.expected} onChange={(e) => setTest(t.id, { expected: e.target.value })} />
              <Input aria-label={`Test ${i + 1} label`} placeholder="Label (optional)" value={t.label} onChange={(e) => setTest(t.id, { label: e.target.value })} />
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" className="accent-foreground" checked={t.hidden} onChange={(e) => setTest(t.id, { hidden: e.target.checked })} />
                hidden
              </label>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove test ${i + 1}`} onClick={() => set({ tests: def.tests.filter((x) => x.id !== t.id) })}>
                <X />
              </Button>
            </div>
          ))}
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => set({ tests: [...def.tests, { id: nextOptionId(def.tests.map((x) => ({ id: x.id, text: x.call }))), label: "", call: "", expected: "", hidden: false }] })}>
              <Plus /> Add test
            </Button>
          </div>
        </div>
        <Field label="Step limit" hint="Work allowed per test; about 5,000 operations per step. The default suits ordinary exercises; raise it for heavy computation.">
          <Input type="number" min={10} max={100000} value={def.stepLimit} onChange={(e) => set({ stepLimit: Math.max(10, Math.min(100_000, Math.round(Number(e.target.value)) || 2000)) })} />
        </Field>
      </div>
    );
  },

  Renderer({ instance, value, onChange, readOnly }) {
    const stemId = useId();
    const codeText = value?.code ?? instance.starter;
    const [runs, setRuns] = useState<{ code: string; runs: TestRun[] } | null>(null);
    const [busy, setBusy] = useState(false);
    const run = async () => {
      setBusy(true);
      try {
        await initSandbox();
        setRuns({ code: codeText, runs: runTests(codeText, instance.tests) });
      } finally {
        setBusy(false);
      }
    };
    return (
      <div className="grid gap-3">
        <Prose id={stemId} className="text-base">{instance.stem}</Prose>
        <CodeEditor label="Your code" value={codeText} readOnly={readOnly} onChange={(code) => onChange?.({ code })} minLines={10} />
        {!readOnly && instance.tests.length > 0 && (
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void run()} disabled={busy}>
                <Play /> {busy ? "Running…" : "Run the example tests"}
              </Button>
              <span className="text-xs text-muted-foreground">Runs here, in a sandbox. More tests may be used for marking.</span>
            </div>
            {runs && runs.code === codeText && <Results tests={instance.tests} runs={runs.runs} />}
          </div>
        )}
        {readOnly && instance.tests.length > 0 && <p className="text-xs text-muted-foreground">Example tests: {instance.tests.map((t) => t.call).join(", ")}</p>}
      </div>
    );
  },
};
