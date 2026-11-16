/** The before and after values of an audit entry, folded away until asked for. */
export function AuditChange({ before, after }: { before: unknown; after: unknown }) {
  if (before == null && after == null) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">Details</summary>
      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
        {before != null && (
          <pre className="overflow-x-auto rounded-md border bg-muted/40 p-2 font-mono">
            <span className="text-muted-foreground">Before </span>
            {JSON.stringify(before, null, 2)}
          </pre>
        )}
        {after != null && (
          <pre className="overflow-x-auto rounded-md border bg-muted/40 p-2 font-mono">
            <span className="text-muted-foreground">After </span>
            {JSON.stringify(after, null, 2)}
          </pre>
        )}
      </div>
    </details>
  );
}
