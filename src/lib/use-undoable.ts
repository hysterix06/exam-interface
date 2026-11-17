"use client";

import { useCallback, useEffect, useState } from "react";
import { initHistory, record, redo, reset, undo } from "./undo";

function isTextField(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && (el as HTMLInputElement).type !== "checkbox" && (el as HTMLInputElement).type !== "radio");
}

/**
 * State with undo/redo. Ctrl/⌘+Z and Ctrl/⌘+Shift+Z (or Ctrl+Y) work when the
 * focus is not in a text field, where the browser's own undo applies.
 */
export function useUndoable<T>(initial: T | (() => T)) {
  const [h, setH] = useState(() => initHistory(typeof initial === "function" ? (initial as () => T)() : initial));

  const set = useCallback((next: T | ((prev: T) => T)) => {
    setH((cur) => record(cur, typeof next === "function" ? (next as (p: T) => T)(cur.present) : next, Date.now()));
  }, []);
  const doUndo = useCallback(() => setH(undo), []);
  const doRedo = useCallback(() => setH(redo), []);
  const replace = useCallback((value: T) => setH(reset(value)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || isTextField(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        doUndo();
      } else if ((k === "z" && e.shiftKey) || (k === "y" && e.ctrlKey)) {
        e.preventDefault();
        doRedo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doUndo, doRedo]);

  return {
    value: h.present,
    set,
    undo: doUndo,
    redo: doRedo,
    replace,
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
  };
}
