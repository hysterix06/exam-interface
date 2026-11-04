"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/** A password shown exactly once, with a copy button. Nothing is stored in plain text. */
export function OneTimeSecret({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm tracking-wide select-all">{value}</code>
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <span className="text-xs text-muted-foreground">Give this to them now. It won’t be shown again; they can change it in Account.</span>
    </div>
  );
}
