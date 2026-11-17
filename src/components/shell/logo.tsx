import { cn } from "cn";

/** The mark: ∴ ("therefore"), the step from premises to conclusion. Drawn in the current ink. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={cn("size-5 shrink-0", className)} fill="currentColor">
      <circle cx="10" cy="4.75" r="2.35" />
      <circle cx="4.5" cy="14.75" r="2.35" />
      <circle cx="15.5" cy="14.75" r="2.35" />
    </svg>
  );
}

/** Mark + name. `area` is the quiet suffix that says which app you are in ("Teaching", "Admin"). */
export function Wordmark({ area, className }: { area?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className="size-[1.125rem]" />
      <span className="font-serif text-[1.1875rem] leading-none font-semibold tracking-tight">Modus</span>
      {area ? <span className="text-sm leading-none text-muted-foreground">{area}</span> : null}
    </span>
  );
}
