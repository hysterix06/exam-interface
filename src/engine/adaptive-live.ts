// Live adaptive attempts: the next question is chosen on the server after each
// answer, reproducibly. Everything that decides the path is frozen in the
// attempt's plan when it starts (the pool and each question's difficulty), and
// each step records the previous result it used, so replaying the seed, the
// plan and those results gives the same exam, even after a later regrade or a
// recalibration.
import { levelsOf, nextTarget, pickAdaptive, startLevel } from "./adaptive";
import { difficultyLabel } from "./authoring/summary";
import { fmtNum } from "./grading/format";
import { eapAbility } from "./irt";
import { createRng } from "./rng";

export type AdaptiveRule = "staircase" | "rasch";

export interface PlanItem {
  id: string;
  versionId: string;
  type: string;
  points: number;
  difficulty: number;
  weight: number;
  groupKey: string | null;
  /** Rasch difficulty, from past results or the level. */
  b: number;
}

export interface AdaptivePlan {
  rule: AdaptiveRule;
  length: number;
  /** An answer earning at least this share of its points counts as right. */
  threshold: number;
  items: PlanItem[];
  /** How the b values were set, for the explanation. */
  calibration: string;
}

export interface StepResult {
  questionId: string;
  score: number;
  max: number;
}

export interface StepTrace {
  step: number;
  rule: AdaptiveRule;
  /** Staircase: the level asked for. Rasch: the ability estimate. */
  target?: number;
  ability?: { theta: number; se: number };
  /** The result of the previous question, as used for this choice. */
  previous: (StepResult & { correct: boolean }) | null;
  reason: string;
}

const right = (r: StepResult, threshold: number) => r.max > 0 && r.score / r.max >= threshold;
const lvl = (n: number) => `${difficultyLabel(n)} (level ${n})`;

/**
 * The question for step `history.length`, from the seed, the plan and the
 * results so far. null when the pool has nothing left to ask.
 */
export function nextAdaptive(seed: string, plan: AdaptivePlan, history: readonly StepResult[]): { item: PlanItem; trace: StepTrace } | null {
  const step = history.length;
  const rng = createRng(seed).fork("adaptive").fork(`step:${step}`);
  const asked = new Set(history.map((h) => h.questionId));
  const byId = new Map(plan.items.map((i) => [i.id, i]));
  const last = history.at(-1);
  const previous = last ? { ...last, correct: right(last, plan.threshold) } : null;

  if (plan.rule === "rasch") {
    const answers = history.flatMap((h) => (byId.has(h.questionId) ? [{ b: byId.get(h.questionId)!.b, correct: right(h, plan.threshold) }] : []));
    const ability = eapAbility(answers);
    const usedGroups = new Set(plan.items.filter((q) => asked.has(q.id) && q.groupKey).map((q) => q.groupKey));
    const open = plan.items.filter((q) => q.weight > 0 && !asked.has(q.id) && !(q.groupKey && usedGroups.has(q.groupKey)));
    if (open.length === 0) return null;
    // Most informative under Rasch: difficulty closest to the ability estimate; ties by the weighted draw.
    const best = open
      .map((q) => ({ q, gap: Math.abs(q.b - ability.theta), key: Math.log(rng.fork(q.id).next() || Number.MIN_VALUE) / q.weight }))
      .sort((a, b) => a.gap - b.gap || b.key - a.key || a.q.id.localeCompare(b.q.id))[0].q;
    const after = step === 0 ? "Started at average ability (0)" : `After ${step} ${step === 1 ? "answer" : "answers"} the ability estimate is ${fmtNum(ability.theta)} ± ${fmtNum(ability.se)}`;
    return {
      item: best,
      trace: { step, rule: "rasch", ability, previous, reason: `${after}; picked the question whose difficulty (${fmtNum(best.b)}) is closest.` },
    };
  }

  const levels = levelsOf(plan.items.filter((q) => q.weight > 0));
  if (levels.length === 0) return null;
  const prevItem = last ? byId.get(last.questionId) : undefined;
  const target = previous && prevItem ? nextTarget(prevItem.difficulty, previous.correct, levels) : startLevel(levels);
  const pick = pickAdaptive(plan.items, target, asked, rng);
  if (!pick) return null;
  const why =
    step === 0
      ? `Started at ${lvl(target)}, the middle of the available levels.`
      : previous!.correct
        ? `The last answer earned ${fmtNum(previous!.score)} of ${fmtNum(previous!.max)}, so one level harder: ${lvl(target)}.`
        : `The last answer earned ${fmtNum(previous!.score)} of ${fmtNum(previous!.max)}, so one level easier: ${lvl(target)}.`;
  return {
    item: byId.get(pick.question.id)!,
    trace: { step, rule: "staircase", target, previous, reason: pick.note ? `${why} ${pick.note}` : why },
  };
}

/**
 * Reproduce: replay every step from the stored results and compare with the
 * questions actually asked. Each stored item carries the previous result it
 * was chosen with, so later regrades don't change the replay.
 */
export function replayAdaptive(seed: string, plan: AdaptivePlan, stored: readonly { questionId: string; previous: StepResult | null }[]): { identical: boolean; differences: string[] } {
  const differences: string[] = [];
  const history: StepResult[] = [];
  stored.forEach((s, i) => {
    if (i > 0) {
      if (!s.previous) differences.push(`Position ${i + 1}: no recorded result for the question before it.`);
      else history.push(s.previous);
    }
    const next = nextAdaptive(seed, plan, history);
    if (!next) differences.push(`Position ${i + 1}: replaying found nothing left to ask.`);
    else if (next.item.id !== s.questionId) differences.push(`Position ${i + 1}: replaying picks a different question.`);
  });
  return { identical: differences.length === 0, differences };
}
