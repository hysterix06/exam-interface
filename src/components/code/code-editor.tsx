"use client";

import type { EditorView } from "codemirror";
import { useEffect, useRef, useState } from "react";
import { cn } from "cn";
import { Textarea } from "@/components/ui/textarea";

/**
 * A JavaScript editor (CodeMirror 6, loaded on first use). Until it arrives,
 * and if it ever fails, a plain textarea does the same job.
 */
export function CodeEditor({
  value,
  onChange,
  readOnly,
  label,
  className,
  minLines = 8,
}: {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  label: string;
  className?: string;
  minLines?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const changeRef = useRef(onChange);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    changeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const [{ EditorView, basicSetup }, { javascript }, { EditorState }] = await Promise.all([import("codemirror"), import("@codemirror/lang-javascript"), import("@codemirror/state")]);
        if (!live || !host.current) return;
        view.current = new EditorView({
          parent: host.current,
          state: EditorState.create({
            doc: value,
            extensions: [
              basicSetup,
              javascript(),
              EditorState.readOnly.of(Boolean(readOnly)),
              EditorView.editable.of(!readOnly),
              EditorView.contentAttributes.of({ "aria-label": label }),
              EditorView.updateListener.of((u) => {
                if (u.docChanged) changeRef.current?.(u.state.doc.toString());
              }),
              EditorView.theme({
                "&": { fontSize: "13px", backgroundColor: "var(--background)", color: "var(--foreground)" },
                ".cm-content": { fontFamily: "var(--font-mono, ui-monospace, monospace)", minHeight: `${minLines * 1.45}em` },
                ".cm-gutters": { backgroundColor: "var(--muted)", color: "var(--muted-foreground)", border: "none" },
                "&.cm-focused": { outline: "2px solid var(--ring)" },
              }),
            ],
          }),
        });
        setLoaded(true);
      } catch {
        // Stay on the textarea.
      }
    })();
    return () => {
      live = false;
      view.current?.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; value is synced below
  }, [readOnly, label]);

  // Outside changes (reset to starter, answer key) replace the document.
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
  }, [value]);

  return (
    <div className={cn("overflow-hidden rounded-md border", className)}>
      <div ref={host} hidden={!loaded} />
      {!loaded && (
        <Textarea
          aria-label={label}
          className="rounded-none border-0 font-mono text-[13px]"
          rows={minLines}
          value={value}
          readOnly={readOnly}
          spellCheck={false}
          onChange={(e) => onChange?.(e.target.value)}
        />
      )}
    </div>
  );
}
