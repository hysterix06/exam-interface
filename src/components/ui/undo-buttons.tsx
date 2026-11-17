"use client";

import { Redo2, Undo2 } from "lucide-react";
import { Button } from "./button";

/** Undo / Redo for a `useUndoable` value. */
export function UndoButtons({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  disabled,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="ghost" size="xs" onClick={onUndo} disabled={disabled || !canUndo} aria-keyshortcuts="Control+Z Meta+Z" title="Undo (Ctrl/⌘+Z outside a text box)">
        <Undo2 className="size-3.5" aria-hidden /> Undo
      </Button>
      <Button type="button" variant="ghost" size="xs" onClick={onRedo} disabled={disabled || !canRedo} aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z" title="Redo (Ctrl/⌘+Shift+Z)">
        <Redo2 className="size-3.5" aria-hidden /> Redo
      </Button>
    </div>
  );
}
