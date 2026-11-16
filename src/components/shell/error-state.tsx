"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

/** The reference Next attaches to a server error, if any. A thrown value may not be an Error at all. */
export function errorDigest(error: unknown): string | undefined {
  if (error instanceof Error && "digest" in error && typeof error.digest === "string") return error.digest;
  return undefined;
}

export interface ErrorProps {
  error: unknown;
  retry: () => void;
}

export function ErrorState({ error, retry, message, back }: ErrorProps & { message?: string; back?: { href: string; label: string } }) {
  const digest = errorDigest(error);
  return (
    <div role="alert" className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {message ?? "Nothing you saved was lost."} Try again{digest ? `, and if it keeps happening, quote reference ${digest}` : ""}.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <Button variant="outline" onClick={() => retry()}>
          Try again
        </Button>
        {back && (
          <Button asChild variant="ghost">
            <Link href={back.href}>{back.label}</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
