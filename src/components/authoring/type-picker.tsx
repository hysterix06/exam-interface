"use client";

import Link from "next/link";
import { questionTypes } from "@/question-types/registry";
import { questionTypeUis } from "@/question-types/ui-registry";

export function TypePicker({ topicId }: { topicId?: string }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {[...questionTypes.values()].map((t) => (
        <li key={t.id}>
          <Link
            href={`/teach/questions/new?type=${t.id}${topicId ? `&topic=${topicId}` : ""}`}
            className="block rounded-lg border p-4 hover:bg-muted/50"
          >
            <span className="block font-medium">{t.label}</span>
            <span className="text-sm text-muted-foreground">{questionTypeUis.get(t.id)?.description}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
