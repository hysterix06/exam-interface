"use client";

import { Button } from "@/components/ui/button";

export function ErrorState({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Nothing you saved was lost. Try again{error.digest ? `, and if it keeps happening, quote reference ${error.digest}` : ""}.
      </p>
      <Button variant="outline" className="mt-6" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
