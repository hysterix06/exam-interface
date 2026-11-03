"use client";

import { Button } from "@/components/ui/button";

// Shown when a page throws. The message is deliberately generic: details stay in the server logs.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        Your work is saved on the server. Try again, and if it keeps happening, tell your instructor
        {error.digest ? ` and quote reference ${error.digest}` : ""}.
      </p>
      <div>
        <Button onClick={reset}>Try again</Button>
      </div>
    </main>
  );
}
