import { useId } from "react";
import type { TopicMastery } from "@/engine/mastery";

/** Points per topic, as plain sums with a bar. The sentence is the content; the bar is decoration. */
export function TopicBreakdown({
  topics,
  weakest,
  title = "By topic",
  min = 2,
}: {
  topics: TopicMastery[];
  weakest: string | null;
  title?: string;
  /** Below this many groups the breakdown says nothing the total doesn't. */
  min?: number;
}) {
  const id = useId();
  if (topics.length < min) return null;
  return (
    <section aria-labelledby={id} className="grid gap-3 print:break-inside-avoid">
      <h2 id={id} className="text-sm font-medium">
        {title}
      </h2>
      <ul className="grid gap-3 text-sm">
        {topics.map((t) => (
          <li key={t.topicId ?? "other"} className="grid gap-1">
            <p>
              {t.line}
              {weakest !== null && t.topicId === weakest && <span className="text-muted-foreground"> Your lowest topic on this exam.</span>}
            </p>
            {t.percent !== null && (
              <div className="h-1.5 w-full max-w-sm rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-foreground/70" style={{ width: `${t.percent}%` }} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
