import { fmtNum } from "./grading/format";

export interface MasteryItem {
  topicId: string | null;
  topicName: string | null;
  score: number;
  max: number;
  /** Awaiting a human: left out of the score, counted separately. */
  needsReview: boolean;
}

export interface TopicMastery {
  topicId: string | null;
  name: string;
  score: number;
  max: number;
  /** Rounded percent of the marked points, or null when nothing is marked yet. */
  percent: number | null;
  questions: number;
  pending: number;
  /** The whole result in one sentence, e.g. "Genetics: 4 of 6 points (67%) across 2 questions." */
  line: string;
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;
const plural = (n: number, one: string, many: string) => `${fmtNum(n)} ${n === 1 ? one : many}`;

/**
 * How a student did per topic. Plain sums of the points they earned, no
 * weighting or modelling, so the student and the educator can check it by hand.
 */
export function topicMastery(items: readonly MasteryItem[]): { topics: TopicMastery[]; pending: number; weakest: string | null } {
  const by = new Map<string, { topicId: string | null; name: string; score: number; max: number; marked: number; pending: number }>();
  for (const i of items) {
    const key = i.topicId ?? "";
    const t = by.get(key) ?? { topicId: i.topicId, name: i.topicName ?? "Other", score: 0, max: 0, marked: 0, pending: 0 };
    if (i.needsReview) t.pending++;
    else {
      t.score += i.score;
      t.max += i.max;
      t.marked++;
    }
    by.set(key, t);
  }

  const topics = [...by.values()].map((t): TopicMastery => {
    const score = round(t.score);
    const percent = t.marked > 0 && t.max > 0 ? Math.round((score / t.max) * 100) : null;
    const rest = t.pending > 0 ? `${plural(t.pending, "more", "more")} still to be marked` : "";
    const line =
      t.marked === 0
        ? `${t.name}: ${plural(t.pending, "question", "questions")} still to be marked.`
        : `${t.name}: ${fmtNum(score)} of ${plural(round(t.max), "point", "points")} (${percent ?? 0}%) across ${plural(t.marked, "question", "questions")}${rest ? `; ${rest}` : ""}.`;
    return { topicId: t.topicId, name: t.name, score, max: round(t.max), percent, questions: t.marked + t.pending, pending: t.pending, line };
  });

  // The weakest topic is only worth naming when it stands out.
  const scored = topics.filter((t) => t.percent !== null);
  const low = Math.min(...scored.map((t) => t.percent!));
  const lows = scored.filter((t) => t.percent === low);
  const weakest = scored.length > 1 && lows.length === 1 ? lows[0].topicId : null;

  return { topics, pending: topics.reduce((s, t) => s + t.pending, 0), weakest };
}
