import { fmtNum, orList } from "../grading/format";
import type { Names } from "../selection/check";
import { type Blueprint, type PoolItem, sectionTopics } from "../selection/types";
import type { Explanation } from "../types";

export const DIFFICULTY_LABELS: Record<number, string> = { 1: "easy", 2: "medium", 3: "hard" };

export function difficultyLabel(level: number) {
  return DIFFICULTY_LABELS[level] ?? `level ${level}`;
}

export interface BlueprintSummary {
  questionCount: number;
  pointsMin: number;
  pointsMax: number;
  /** True when some section lacks enough questions, so the points are partial. */
  incomplete: boolean;
  /**
   * Expected minutes for a typical student (rule of thumb, rounded to whole
   * minutes); null when no estimates were given.
   */
  estimatedMinutes: number | null;
  /** Plain-language sentences, in reading order. */
  sentences: string[];
  /** Working behind each sentence's number, aligned with `sentences` (null = nothing to explain). */
  explain: (Explanation | null)[];
}

function sum(xs: number[]) {
  return xs.reduce((s, x) => s + x, 0);
}

/** Smallest and largest total of `count` values from `points`, or null if too few. */
function extremes(points: number[], count: number) {
  if (points.length < count) return null;
  const sorted = [...points].sort((a, b) => a - b);
  return {
    min: sum(sorted.slice(0, count)),
    max: sum(sorted.slice(sorted.length - count)),
  };
}

/**
 * The blueprint, rewritten as sentences an educator can check against what
 * they meant: "Each student gets 10 questions: 5 from Cell Biology (2 easy,
 * 3 hard), ... Total 20 points."
 */
export function summarizeBlueprint(
  blueprint: Blueprint,
  pool: readonly PoolItem[],
  topicNames: Names = {},
  /** Estimated seconds per question id (see estimate.ts); omit to skip the time sentence. */
  secondsById?: Readonly<Record<string, number>>,
): BlueprintSummary {
  if (blueprint.sections.length === 0) {
    return {
      questionCount: 0,
      pointsMin: 0,
      pointsMax: 0,
      incomplete: false,
      estimatedMinutes: null,
      sentences: ["No sections yet. Add a section to choose how many questions come from a topic."],
      explain: [null],
    };
  }

  let questionCount = 0;
  let pointsMin = 0;
  let pointsMax = 0;
  let incomplete = false;
  let seconds = 0;
  const parts: string[] = [];
  const pointInputs: Explanation["inputs"] = [];
  const timeInputs: Explanation["inputs"] = [];

  for (const section of blueprint.sections) {
    questionCount += section.count;
    const ids = sectionTopics(section);
    const nameOf = (t: string) => topicNames[t] ?? "an unknown topic";
    const topic = orList(ids.map(nameOf));
    const drawable = pool.filter((q) => ids.includes(q.topicId) && q.weight > 0);

    let mix = "";
    let ranges: ({ min: number; max: number } | null)[];
    if (section.difficultyMix) {
      const levels = Object.entries(section.difficultyMix)
        .map(([level, count]) => ({ level: Number(level), count }))
        .filter((l) => l.count > 0)
        .sort((a, b) => a.level - b.level);
      mix = ` (${levels.map((l) => `${l.count} ${difficultyLabel(l.level)}`).join(", ")})`;
      ranges = levels.map((l) =>
        extremes(drawable.filter((q) => q.difficulty === l.level).map((q) => q.points), l.count),
      );
    } else {
      ranges = [extremes(drawable.map((q) => q.points), section.count)];
    }

    const limits = Object.entries(section.limits ?? {})
      .flatMap(([t, l]) => [
        l.min ? `at least ${l.min} from ${nameOf(t)}` : null,
        l.max !== undefined ? `at most ${l.max} from ${nameOf(t)}` : null,
      ])
      .filter(Boolean);
    if (limits.length) mix = ` (${limits.join(", ")})`;
    parts.push(`${section.count} from ${topic}${mix}`);
    if (secondsById) {
      const each = weightedMean(drawable, secondsById);
      seconds += section.count * each;
      timeInputs.push({ label: topic, value: `${section.count} × about ${fmtNum(Math.round(each))} s` });
    }
    let sMin = 0;
    let sMax = 0;
    let sIncomplete = false;
    for (const r of ranges) {
      if (!r) sIncomplete = true;
      else {
        sMin += r.min;
        sMax += r.max;
      }
    }
    incomplete ||= sIncomplete;
    pointsMin += sMin;
    pointsMax += sMax;
    pointInputs.push({
      label: `${topic} (${section.count})`,
      value: sIncomplete ? "not enough questions" : sMin === sMax ? `${fmtNum(sMin)} pts` : `${fmtNum(sMin)}–${fmtNum(sMax)} pts`,
    });
  }

  const sentences = [
    `Each student gets ${questionCount} ${questionCount === 1 ? "question" : "questions"}: ${parts.join(", ")}.`,
  ];
  const explain: (Explanation | null)[] = [null];

  const total =
    pointsMin === pointsMax
      ? `Total ${fmtNum(pointsMin)} ${pointsMin === 1 ? "point" : "points"}.`
      : `Total between ${fmtNum(pointsMin)} and ${fmtNum(pointsMax)} points, depending on which questions are drawn.`;
  sentences.push(
    incomplete ? `${total} (Some sections don't have enough questions yet, so this is a partial count.)` : total,
  );
  explain.push({
    formula:
      "For each section, add up the points of the questions it draws. When questions are worth different points, the range runs from the cheapest possible draw to the dearest.",
    inputs: [...pointInputs, { label: "Total", value: pointsMin === pointsMax ? `${fmtNum(pointsMin)} pts` : `${fmtNum(pointsMin)}–${fmtNum(pointsMax)} pts` }],
  });

  const estimatedMinutes = secondsById && questionCount > 0 ? Math.max(1, Math.round(seconds / 60)) : null;
  if (estimatedMinutes !== null) {
    sentences.push(`Estimated time about ${estimatedMinutes} min for a typical student (a rule of thumb per question type and difficulty).`);
    explain.push({
      formula:
        "Each question type has a rule of thumb (e.g. multiple choice: 30 s plus 8 s per option), times 0.75 for easy and 1.5 for hard. A section's figure is the average of the questions it can draw, weighted by how likely each is.",
      inputs: [...timeInputs, { label: "Total", value: `about ${fmtNum(Math.round(seconds))} s ≈ ${estimatedMinutes} min` }],
      note: "A planning aid, not a limit. Watch the first real attempts to calibrate.",
    });
  }

  sentences.push(
    blueprint.shuffleQuestions
      ? "Each student sees the questions in a different random order."
      : "Questions appear in section order for every student.",
  );
  explain.push(null);

  return { questionCount, pointsMin, pointsMax, incomplete, estimatedMinutes, sentences, explain };
}

/** Average seconds of a question drawn from `items`, weighted by selection weight. */
function weightedMean(items: readonly PoolItem[], secondsById: Readonly<Record<string, number>>) {
  const total = sum(items.map((q) => q.weight));
  if (total === 0) return 0;
  return sum(items.map((q) => q.weight * (secondsById[q.id] ?? 60))) / total;
}
