import { type AttemptPoolItem, buildAttempt } from "../attempt";
import { roundScore } from "../grading/format";
import { createRng } from "../rng";
import { BlueprintError, selectQuestions } from "../selection/select";
import type { Blueprint, PoolItem } from "../selection/types";
import { getQuestionType } from "@/question-types/registry";

export interface OddsResult {
  runs: number;
  /** Runs where the blueprint could not be filled. */
  failures: number;
  /** Times each question was drawn, across successful runs. */
  drawn: Record<string, number>;
}

/**
 * How often each question lands on an exam, measured by running the real
 * selector on many fixed seeds. "Appears on about 33% of exams" is
 * drawn / (runs - failures) from this result.
 */
export function estimateOdds(
  blueprint: Blueprint,
  pool: readonly PoolItem[],
  runs = 1000,
): OddsResult {
  const drawn: Record<string, number> = {};
  let failures = 0;
  for (let i = 0; i < runs; i++) {
    try {
      const { questionIds } = selectQuestions(blueprint, pool, createRng(`odds:${i}`).fork("selection"));
      for (const id of questionIds) drawn[id] = (drawn[id] ?? 0) + 1;
    } catch (e) {
      if (!(e instanceof BlueprintError)) throw e;
      failures++;
    }
  }
  return { runs, failures, drawn };
}

/** Share of successful runs in which a question appeared (0–1). */
export function oddsOf(odds: OddsResult, questionId: string) {
  const ok = odds.runs - odds.failures;
  return ok === 0 ? 0 : (odds.drawn[questionId] ?? 0) / ok;
}

export interface TopicBalance {
  min: number;
  max: number;
  mean: number;
}

export interface SimulationResult {
  runs: number;
  failures: number;
  firstFailure: string | null;
  drawn: Record<string, number>;
  topicBalance: Record<string, TopicBalance>;
  /** Students per 10%-wide score band: [0–10%) ... [90–100%]. */
  histogram: number[];
  scores: { mean: number; median: number; min: number; max: number } | null;
}

/**
 * N fake students with random answers: draw counts, topic balance and the
 * score distribution. Fully deterministic (fixed seeds).
 */
export function simulate(
  blueprint: Blueprint,
  pool: readonly AttemptPoolItem[],
  runs = 200,
): SimulationResult {
  const drawn: Record<string, number> = {};
  const topicOf = new Map(pool.map((q) => [q.id, q.topicId]));
  const topicCounts: Record<string, number[]> = {};
  const percents: number[] = [];
  let failures = 0;
  let firstFailure: string | null = null;

  for (let i = 0; i < runs; i++) {
    const seed = `sim:${i}`;
    let items;
    try {
      items = buildAttempt(seed, blueprint, pool).items;
    } catch (e) {
      if (!(e instanceof BlueprintError)) throw e;
      failures++;
      firstFailure ??= e.message;
      continue;
    }

    const perTopic: Record<string, number> = {};
    let score = 0;
    let max = 0;
    for (const item of items) {
      drawn[item.questionId] = (drawn[item.questionId] ?? 0) + 1;
      const topic = topicOf.get(item.questionId)!;
      perTopic[topic] = (perTopic[topic] ?? 0) + 1;

      const type = getQuestionType(item.type);
      const response = type.randomResponse(item.instance, createRng(`${seed}:answer:${item.questionId}`));
      score += type.grade(item.instance, response, { points: item.points }).score;
      max += item.points;
    }
    for (const section of blueprint.sections) {
      (topicCounts[section.topicId] ??= []).push(perTopic[section.topicId] ?? 0);
    }
    percents.push(max === 0 ? 0 : (score / max) * 100);
  }

  const topicBalance: Record<string, TopicBalance> = {};
  for (const [topic, counts] of Object.entries(topicCounts)) {
    topicBalance[topic] = {
      min: Math.min(...counts),
      max: Math.max(...counts),
      mean: roundScore(counts.reduce((s, n) => s + n, 0) / counts.length),
    };
  }

  const histogram = Array<number>(10).fill(0);
  for (const p of percents) histogram[Math.min(9, Math.max(0, Math.floor(p / 10)))]++;

  const sorted = [...percents].sort((a, b) => a - b);
  const scores = sorted.length
    ? {
        mean: roundScore(sorted.reduce((s, p) => s + p, 0) / sorted.length),
        median: roundScore(
          sorted.length % 2
            ? sorted[(sorted.length - 1) / 2]
            : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2,
        ),
        min: roundScore(sorted[0]),
        max: roundScore(sorted[sorted.length - 1]),
      }
    : null;

  return { runs, failures, firstFailure, drawn, topicBalance, histogram, scores };
}

export interface KeyCheckFailure {
  seed: string;
  questionId: string;
  kind: "perfect" | "blank";
  score: number;
  expected: number;
}

export interface KeyCheckResult {
  runs: number;
  /** Runs where the blueprint could not be filled. */
  buildFailures: number;
  firstBuildFailure: string | null;
  failures: KeyCheckFailure[];
}

/**
 * "Take it as a perfect student": answer every question with its own key and
 * require full marks; submit blanks and require zero. Any miss means a broken
 * answer key or grader.
 */
export function checkKeys(
  blueprint: Blueprint,
  pool: readonly AttemptPoolItem[],
  runs = 200,
): KeyCheckResult {
  const failures: KeyCheckFailure[] = [];
  let buildFailures = 0;
  let firstBuildFailure: string | null = null;

  for (let i = 0; i < runs; i++) {
    const seed = `perfect:${i}`;
    let items;
    try {
      items = buildAttempt(seed, blueprint, pool).items;
    } catch (e) {
      if (!(e instanceof BlueprintError)) throw e;
      buildFailures++;
      firstBuildFailure ??= e.message;
      continue;
    }
    for (const item of items) {
      const type = getQuestionType(item.type);
      const perfect = type.grade(item.instance, type.keyResponse(item.instance), { points: item.points });
      // Human-graded types can't be checked by machine; blank must still score 0.
      if (!type.manual && perfect.score !== item.points) {
        failures.push({ seed, questionId: item.questionId, kind: "perfect", score: perfect.score, expected: item.points });
      }
      const blank = type.grade(item.instance, null, { points: item.points });
      if (blank.score !== 0) {
        failures.push({ seed, questionId: item.questionId, kind: "blank", score: blank.score, expected: 0 });
      }
    }
  }
  return { runs, buildFailures, firstBuildFailure, failures };
}
