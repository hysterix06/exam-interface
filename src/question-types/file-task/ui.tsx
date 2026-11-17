"use client";

import { Download, FileUp } from "lucide-react";
import { useId, useRef, useState, useTransition } from "react";
import { uploadSubmissionAction } from "@/app/attempt/actions";
import { listAssetsAction, readSolutionWorkbookAction, uploadAssetAction } from "@/app/teach/actions";
import { useAssetCourse } from "@/components/assets/asset-context";
import { useServerAnswer } from "@/components/exam/server-answer";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Prose } from "@/components/ui/prose";
import { Textarea } from "@/components/ui/textarea";
import { assetUrl } from "@/engine/asset";
import { MAX_COLS, MAX_ROWS, parseAddr } from "@/engine/sheet";
import { withFormatHint } from "../hints";
import { SheetChecksEditor } from "../sheet-checks-ui";
import type { QuestionTypeUi } from "../ui-types";
import type { FileTaskDef, FileTaskResponse } from "./core";

type StudentInstance = Pick<FileTaskDef, "stem" | "starter" | "sheetName" | "rows" | "cols">;

const XLSX_ACCEPT = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** "A1 = Item" lines <-> cells. */
const toLines = (cells: Record<string, string>) =>
  Object.entries(cells)
    .sort(([a], [b]) => {
      const pa = parseAddr(a);
      const pb = parseAddr(b);
      return pa && pb ? pa.row - pb.row || pa.col - pb.col : a.localeCompare(b);
    })
    .map(([a, v]) => `${a} = ${v}`)
    .join("\n");
const fromLines = (text: string) =>
  Object.fromEntries(
    text
      .split("\n")
      .map((l) => /^\s*([A-Za-z]{1,2}[0-9]+)\s*=\s?(.*)$/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null && m[2].trim() !== "")
      .map((m) => [m[1].toUpperCase(), m[2]]),
  );

function FileButton({ label, onFile, disabled }: { label: string; onFile: (f: File) => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={ref} type="file" accept={XLSX_ACCEPT} className="sr-only" aria-label={label} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => ref.current?.click()}>
        <FileUp /> {label}
      </Button>
    </>
  );
}

export const fileTaskUi: QuestionTypeUi<FileTaskDef, StudentInstance, FileTaskResponse> = {
  id: "file-task",
  description: "Students work in real Excel and upload the .xlsx. Graded by cell values, formulas and functions.",

  newDef: () => ({ stem: "", starter: null, sheetName: "", rows: 10, cols: 4, solution: {}, checks: [] }),

  Editor({ def, onChange }) {
    const set = (patch: Partial<FileTaskDef>) => onChange({ ...def, ...patch });
    const courseId = useAssetCourse();
    const [pending, start] = useTransition();
    const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
    const [solutionText, setSolutionText] = useState(() => toLines(def.solution));

    const uploadStarter = (file: File) =>
      start(async () => {
        if (!courseId) return setNote({ tone: "error", text: "Choose the question's topic first." });
        const form = new FormData();
        form.set("courseId", courseId);
        form.set("file", file);
        const r = await uploadAssetAction(form);
        if (!r.ok) return setNote({ tone: "error", text: r.error });
        set({ starter: { assetId: r.asset.id, fileName: r.asset.fileName } });
        setNote({ tone: "ok", text: `Starter workbook “${r.asset.fileName}” attached.` });
        void listAssetsAction(courseId, "workbook");
      });
    const readSolution = (file: File) =>
      start(async () => {
        const form = new FormData();
        form.set("file", file);
        form.set("rows", String(def.rows));
        form.set("cols", String(def.cols));
        form.set("sheetName", def.sheetName);
        const r = await readSolutionWorkbookAction(form);
        if (!r.ok) return setNote({ tone: "error", text: r.error });
        set({ solution: r.cells });
        setSolutionText(toLines(r.cells));
        setNote({ tone: "ok", text: `Read ${Object.keys(r.cells).length} cells from the solution.${r.warnings.length ? ` ${r.warnings.join(" ")}` : ""}` });
      });

    return (
      <div className="grid gap-5">
        <Field label="Task" hint={withFormatHint("Say exactly what to do and in which cells, e.g. “Total the takings in B6 with a formula.”")}>
          <Textarea value={def.stem} onChange={(e) => set({ stem: e.target.value })} />
        </Field>
        <div className="grid gap-2">
          <span className="text-sm font-medium">Starter workbook (optional)</span>
          <div className="flex flex-wrap items-center gap-2">
            <FileButton label="Upload starter .xlsx" onFile={uploadStarter} disabled={pending} />
            {def.starter && (
              <>
                <a className="text-sm text-brand underline underline-offset-2" href={`${assetUrl(def.starter.assetId)}?download`}>
                  {def.starter.fileName}
                </a>
                <Button type="button" variant="ghost" size="sm" onClick={() => set({ starter: null })}>
                  Remove
                </Button>
              </>
            )}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Rows read" hint={`Up to ${MAX_ROWS}.`}>
            <Input type="number" min={1} max={MAX_ROWS} value={def.rows} onChange={(e) => set({ rows: Math.max(1, Math.min(MAX_ROWS, Math.round(Number(e.target.value) || 1))) })} />
          </Field>
          <Field label="Columns read" hint={`Up to ${MAX_COLS}.`}>
            <Input type="number" min={1} max={MAX_COLS} value={def.cols} onChange={(e) => set({ cols: Math.max(1, Math.min(MAX_COLS, Math.round(Number(e.target.value) || 1))) })} />
          </Field>
          <Field label="Sheet name (optional)" hint="Blank = the first sheet.">
            <Input value={def.sheetName} onChange={(e) => set({ sheetName: e.target.value })} />
          </Field>
        </div>
        <div className="grid gap-2">
          <span className="text-sm font-medium">Model solution</span>
          <div className="flex flex-wrap items-center gap-2">
            <FileButton label="Read from a finished .xlsx" onFile={readSolution} disabled={pending} />
            <span className="text-xs text-muted-foreground">or type one cell per line, e.g. <code>B6 = =SUM(B2:B4)</code></span>
          </div>
          <Textarea
            className="min-h-32 font-mono text-xs"
            aria-label="Model solution cells"
            value={solutionText}
            onChange={(e) => {
              setSolutionText(e.target.value);
              set({ solution: fromLines(e.target.value) });
            }}
          />
        </div>
        {note && (
          <p role={note.tone === "error" ? "alert" : "status"} className={`text-sm ${note.tone === "error" ? "text-destructive" : "text-success"}`}>
            {note.text}
          </p>
        )}
        <SheetChecksEditor checks={def.checks} onChange={(checks) => set({ checks })} defaultCell="" />
      </div>
    );
  },

  Renderer({ instance, value, readOnly }) {
    const server = useServerAnswer();
    const id = useId();
    const [pending, start] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const upload = (file: File) =>
      start(async () => {
        if (!server) return setError("Uploads work in a real attempt; this preview can't store files.");
        const form = new FormData();
        form.set("attemptId", server.attemptId);
        form.set("itemId", server.itemId);
        form.set("file", file);
        const r = await uploadSubmissionAction(form);
        if (!r.ok) return setError(r.error);
        setError(null);
        server.onSaved(r.response);
      });
    const filled = value ? Object.keys(value.cells).length : 0;
    return (
      <div className="grid gap-4">
        <Prose id={id} className="text-base">{instance.stem}</Prose>
        {instance.starter && (
          <p>
            <Button asChild variant="outline" size="sm">
              <a href={`${assetUrl(instance.starter.assetId)}?download`}>
                <Download /> Download {instance.starter.fileName}
              </a>
            </Button>
          </p>
        )}
        {!readOnly && (
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <FileButton label={value ? "Upload a new version" : "Upload your .xlsx"} onFile={upload} disabled={pending} />
              {pending && <span className="text-sm text-muted-foreground">Reading your workbook…</span>}
            </div>
            <p className="text-xs text-muted-foreground">
              Save as .xlsx (Excel, Numbers or Google Sheets all can), up to 2 MB. Cells {instance.sheetName ? `on “${instance.sheetName}” ` : ""}up to {`${String.fromCharCode(64 + instance.cols)}${instance.rows}`} are read. You can upload again until you submit.
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {value ? (
          <div role="status" className="rounded-md border bg-muted/30 p-3 text-sm">
            <p>
              <span className="font-medium">{value.fileName}</span> · {filled} {filled === 1 ? "cell" : "cells"} read
              {value.bytes ? ` · ${Math.max(1, Math.round(value.bytes / 1024))} KB` : ""}
            </p>
            {value.warnings.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                {value.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          readOnly && <p className="text-sm text-muted-foreground">No file uploaded.</p>
        )}
      </div>
    );
  },
};
