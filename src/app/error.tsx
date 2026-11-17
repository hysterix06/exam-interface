"use client";

import { Button } from "@/components/ui/button";
import { type ErrorProps, errorDigest } from "@/components/shell/error-state";

// Shown when a page with no closer boundary throws, such as login. The message
// is deliberately generic: details stay in the server logs.
export default function RootError({ error, retry }: ErrorProps) {
  const digest = errorDigest(error);
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="font-serif text-[1.875rem] leading-tight font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        Your work is saved on the server. Try again, and if it keeps happening, tell your instructor
        {digest ? ` and quote reference ${digest}` : ""}.
      </p>
      <div>
        <Button onClick={() => retry()}>Try again</Button>
      </div>
    </main>
  );
}
