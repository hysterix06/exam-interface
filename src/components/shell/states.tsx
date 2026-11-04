import Link from "next/link";
import { Button } from "@/components/ui/button";

export function NotFoundState({ home }: { home: string }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold tracking-tight">We can’t find that</h1>
      <p className="mt-2 text-sm text-muted-foreground">It may have been removed, or it belongs to a course you don’t have access to.</p>
      <Button asChild variant="outline" className="mt-6">
        <Link href={home}>Go back home</Link>
      </Button>
    </div>
  );
}

/** Quiet placeholder bars while a page loads inside its shell. */
export function LoadingState() {
  return (
    <div role="status" aria-label="Loading" className="animate-pulse">
      <div className="h-7 w-56 rounded-md bg-muted" />
      <div className="mt-3 h-4 w-80 max-w-full rounded-md bg-muted/70" />
      <div className="mt-10 grid gap-3">
        <div className="h-14 rounded-lg bg-muted/60" />
        <div className="h-14 rounded-lg bg-muted/60" />
        <div className="h-14 rounded-lg bg-muted/60" />
      </div>
    </div>
  );
}
