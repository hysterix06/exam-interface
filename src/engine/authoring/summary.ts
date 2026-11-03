import { fmtNum } from "../grading/format";
import type { Names } from "../selection/check";
import type { Blueprint, PoolItem } from "../selection/types";

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
  /** Plain-language sentences, in reading order. */
  sentences: string[];
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
): BlueprintSummary {
  if (blueprint.sections.length === 0) {
    return {
      questionCount: 0,
      pointsMin: 0,
      pointsMax: 0,
      incomplete: false,
      sentences: ["No sections yet. Add a section to choose how many questions come from a topic."],
    };
  }

  let questionCount = 0;
  let pointsMin = 0;
  let pointsMax = 0;
  let incomplete = false;
  const parts: string[] = [];

  for (const section of blueprint.sections) {
    questionCount += section.count;
    const topic = topicNames[section.topicId] ?? "an unknown topic";
    const drawable = pool.filter((q) => q.topicId === section.topicId && q.weight > 0);

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

    parts.push(`${section.count} from ${topic}${mix}`);
    for (const r of ranges) {
      if (!r) incomplete = true;
      else {
        pointsMin += r.min;
        pointsMax += r.max;
      }
    }
  }

  const sentences = [
    `Each student gets ${questionCount} ${questionCount === 1 ? "question" : "questions"}: ${parts.join(", ")}.`,
  ];

  const total =
    pointsMin === pointsMax
      ? `Total ${fmtNum(pointsMin)} ${pointsMin === 1 ? "point" : "points"}.`
      : `Total between ${fmtNum(pointsMin)} and ${fmtNum(pointsMax)} points, depending on which questions are drawn.`;
  sentences.push(
    incomplete ? `${total} (Some sections don't have enough questions yet, so this is a partial count.)` : total,
  );

  sentences.push(
    blueprint.shuffleQuestions
      ? "Each student sees the questions in a different random order."
      : "Questions appear in section order for every student.",
  );

  return { questionCount, pointsMin, pointsMax, incomplete, sentences };
}
