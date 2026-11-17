"use client";

import { Paperclip, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { submitAssignmentAction, uploadAssignmentFileAction } from "@/app/(student)/assignments/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { StatusText } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { FILE_KIND_LABEL, type AssignmentSettings } from "@/engine/assignments/settings";
import type { UploadedFile } from "@/server/assignments/submit";

const ACCEPT: Record<string, string> = {
  pdf: ".pdf,application/pdf",
  docx: ".docx",
  image: "image/png,image/jpeg,image/webp",
  text: ".txt,text/plain",
  workbook: ".xlsx",
};

/**
 * Typed answer and/or files. Each file uploads as soon as it's chosen (so a
 * big one can't time out the hand-in), then "Hand in" records them together.
 */
export function HandInForm({ assignmentId, settings, late, again }: { assignmentId: string; settings: AssignmentSettings; late: boolean; again: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const add = async (list: FileList | null) => {
    if (!list) return;
    setMsg(null);
    for (const f of Array.from(list)) {
      if (files.length + uploading.length >= settings.maxFiles) {
        setMsg({ ok: false, text: `At most ${settings.maxFiles} ${settings.maxFiles === 1 ? "file" : "files"}.` });
        break;
      }
      setUploading((u) => [...u, f.name]);
      const form = new FormData();
      form.set("assignmentId", assignmentId);
      form.set("file", f);
      const r = await uploadAssignmentFileAction(form).catch(() => ({ ok: false as const, error: "The upload failed. Check your connection and try again." }));
      setUploading((u) => u.filter((n) => n !== f.name));
      if (!r.ok) setMsg({ ok: false, text: `${f.name}: ${r.error}` });
      else setFiles((x) => (x.some((y) => y.sha256 === r.file.sha256) ? x : [...x, r.file]));
    }
    if (input.current) input.current.value = "";
  };

  const empty = !text.trim() && files.length === 0;
  return (
    <form
      className="grid gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await submitAssignmentAction(assignmentId, { text, files: files.map((f) => ({ sha256: f.sha256, ext: f.ext, name: f.name })) });
          if (!r.ok) return setMsg({ ok: false, text: r.error });
          setText("");
          setFiles([]);
          setMsg({ ok: true, text: r.late ? "Handed in (late)." : "Handed in." });
          router.refresh();
        });
      }}
    >
      {settings.allowText && (
        <Field label="Your answer">
          <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      )}
      {settings.allowFiles && (
        <div className="grid gap-2">
          <p className="text-sm font-medium">Files</p>
          {(files.length > 0 || uploading.length > 0) && (
            <ul className="grid gap-1.5 text-sm">
              {files.map((f) => (
                <li key={f.sha256} className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <Paperclip aria-hidden className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${f.name}`} onClick={() => setFiles((x) => x.filter((y) => y.sha256 !== f.sha256))}>
                    <X />
                  </Button>
                </li>
              ))}
              {uploading.map((n) => (
                <li key={n} className="flex items-center gap-2 rounded-md border px-3 py-2 text-muted-foreground" role="status">
                  <Paperclip aria-hidden className="size-4" /> Uploading {n}…
                </li>
              ))}
            </ul>
          )}
          {files.length + uploading.length < settings.maxFiles && (
            <div>
              <input
                ref={input}
                id="hand-in-file"
                type="file"
                multiple={settings.maxFiles > 1}
                accept={settings.accept.map((k) => ACCEPT[k]).join(",")}
                className="sr-only"
                onChange={(e) => void add(e.target.files)}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
                <Paperclip /> Add a file
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                {settings.accept.map((k) => FILE_KIND_LABEL[k]).join(", ")} · up to 10 MB each · at most {settings.maxFiles}
              </p>
            </div>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" className="bg-brand text-brand-foreground hover:bg-brand/90" disabled={pending || empty || uploading.length > 0}>
          {pending ? "Handing in…" : again ? "Hand in again" : "Hand in"}
        </Button>
        {late && <span className="text-sm text-warning">The due date has passed: this will count as late.</span>}
        {msg && <StatusText ok={msg.ok}>{msg.text}</StatusText>}
      </div>
    </form>
  );
}
