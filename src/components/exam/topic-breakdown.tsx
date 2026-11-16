import type { TopicMastery } from "@/engine/mastery";

/** Points per topic, as plain sums with a bar. The sentence is the content; the bar is decoration. */
export function TopicBreakdown({ topics, weakest }: { topics: TopicMastery[]; weakest: string | null }) {
  if (topics.length < 2) return null;
  return (
    <section aria-labelledby="by-topic" className="grid gap-3 print:break-inside-avoid">
      <h2 id="by-topic" className="text-sm font-medium">
        By topic
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
