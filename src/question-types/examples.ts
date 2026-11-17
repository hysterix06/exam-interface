// Ready-made starting points for "New question": real, working questions from
// the demo bank, one or more per type. Plain data (no React), so server pages,
// the client picker and tests all read the same list.
import { CHEM_QUESTIONS, DEMO_QUESTIONS } from "@/db/seed/demo-content";
import { FIELD_QUESTIONS, SEED_IMAGE_PREFIX } from "@/db/seed/field-content";
import { SHOWCASE_QUESTIONS } from "@/db/seed/showcase-content";
import { questionLabel } from "@/lib/question-label";

export interface QuestionExample {
  label: string;
  def: unknown;
}

const ALL: { type: string; def: unknown }[] = [...FIELD_QUESTIONS, ...SHOWCASE_QUESTIONS, ...DEMO_QUESTIONS, ...CHEM_QUESTIONS];

/** At most this many examples per type, in bank order. */
const PER_TYPE = 3;

/** Seed images only exist in the demo course, so an example starts with the image slot empty. */
function withoutSeedImages(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutSeedImages);
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.assetId === "string" && o.assetId.startsWith(SEED_IMAGE_PREFIX)) return null; // images and starter workbooks alike
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, withoutSeedImages(v)]));
  }
  return value;
}

export function examplesFor(typeId: string): QuestionExample[] {
  return ALL.filter((q) => q.type === typeId)
    .slice(0, PER_TYPE)
    .map((q) => ({ label: questionLabel(q.def, 70), def: withoutSeedImages(structuredClone(q.def)) }));
}
