"use client";

import Link from "next/link";
import { examplesFor } from "@/question-types/examples";
import { questionTypes } from "@/question-types/registry";
import { questionTypeUis } from "@/question-types/ui-registry";

export function TypePicker({ topicId }: { topicId?: string }) {
  const href = (type: string, example?: number) =>
    `/teach/questions/new?type=${type}${example !== undefined ? `&example=${example}` : ""}${topicId ? `&topic=${topicId}` : ""}`;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {[...questionTypes.values()].map((t) => {
        const examples = examplesFor(t.id);
        return (
          <li key={t.id} className="rounded-lg border">
            <Link href={href(t.id)} className="block p-4 pb-2 hover:bg-muted/50">
              <span className="block font-medium">{t.label}</span>
              <span className="text-sm text-muted-foreground">{questionTypeUis.get(t.id)?.description}</span>
            </Link>
            {examples.length > 0 && (
              <div className="px-4 pb-3 text-sm">
                <span className="text-xs text-muted-foreground">Or start from an example:</span>
                <ul className="mt-1 grid gap-0.5">
                  {examples.map((e, i) => (
                    <li key={i} className="truncate">
                      <Link href={href(t.id, i)} className="text-brand underline-offset-2 hover:underline">
                        {e.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
