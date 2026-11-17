import { fmtNum } from "../grading/format";
import { generateQuestion, validateQuestion } from "../generate";
import { createRng } from "../rng";
import type { AttemptPoolItem } from "../attempt";
import { type Names, checkBlueprint } from "../selection/check";
import { type Blueprint, blueprintTopics } from "../selection/types";
import type { ExamSettings } from "../exam";
import type { PreflightIssue } from "../types";
import { getQuestionType } from "@/question-types/registry";
import { checkKeys, type WrongRunSummary } from "./simulate";
import { estimateSecondsById } from "./estimate";
import { findSimilarQuestions, similarityIssues } from "./similar-questions";
import { summarizeBlueprint } from "./summary";

export type PreflightStatus = "pass" | "warn" | "fail";

export interface PreflightItem {
  id: string;
  status: PreflightStatus;
  title: string;
  /** One plain sentence on what was checked and found. */
  detail: string;
  /** Specific problems, already worded for educators. */
  problems: string[];
}

export interface PreflightReport {
  items: PreflightItem[];
  /** Publishing is blocked while this is above zero. */
  blocking: number;
  warnings: number;
}

export interface PreflightInput {
  blueprint: Blueprint;
  settings: ExamSettings;
  /** Active questions only. */
  pool: readonly AttemptPoolItem[];
  topicNames?: Names;
  /** Short labels for questions (usually the stem), keyed by question id. */
  questionNames?: Names;
}

export interface PreflightOptions {
  /** Generations per question for the "generates cleanly" check. */
  generations?: number;
  /** Fake perfect/blank students for the key check. */
  keyRuns?: number;
}

function item(
  id: string,
  title: string,
  problems: string[],
  worst: PreflightStatus,
  ok: string,
  bad: string,
): PreflightItem {
  return {
    id,
    title,
    status: problems.length ? worst : "pass",
    detail: problems.length ? bad : ok,
    problems,
  };
}

/** "all zero", or the negative-marking range with the questions that cause it. */
function wrongDetail(w: WrongRunSummary | null, qName: (id: string) => string) {
  if (!w || (w.min === 0 && w.max === 0)) return "all zero";
  const range = w.min === w.max ? fmtNum(w.min) : `${fmtNum(w.min)} to ${fmtNum(w.max)}`;
  const which = w.penalized.slice(0, 3).map(qName).join("; ") + (w.penalized.length > 3 ? ` and ${fmtNum(w.penalized.length - 3)} more` : "");
  return `${range} of ${fmtNum(w.outOf)}, from negative marking on ${which}`;
}

function plural(n: number, one: string, many = `${one}s`) {
  return `${fmtNum(n)} ${n === 1 ? one : many}`;
}

/**
 * The pre-flight checklist: everything that should be true before a single
 * student sees the exam. Each item is data (status + plain-language detail),
 * so the UI shows exactly what was checked and never re-derives it.
 */
export function preflightExam(input: PreflightInput, opts: PreflightOptions = {}): PreflightReport {
  const { blueprint, settings, pool, topicNames = {}, questionNames = {} } = input;
  const generations = opts.generations ?? 1000;
  const keyRuns = opts.keyRuns ?? 200;
  const qName = (id: string) => questionNames[id] ?? id;
  const items: PreflightItem[] = [];

  // 1. Pools big enough for the blueprint.
  const pools = [
    ...checkBlueprint(blueprint, pool, topicNames),
    ...similarityIssues(findSimilarQuestions(blueprint, pool), questionNames),
  ];
  const blueprintBlocking = pools.filter((i) => i.severity === "blocking");
  const blueprintWarnings = pools.filter((i) => i.severity === "warning");
  items.push({
    id: "pools",
    title: "Every section has enough questions",
    status: blueprintBlocking.length ? "fail" : blueprintWarnings.length ? "warn" : "pass",
    detail: blueprintBlocking.length
      ? "Some students could not get a complete exam."
      : `All ${plural(blueprint.sections.length, "section")} can be filled${blueprintWarnings.length ? ", with notes below" : ""}.`,
    problems: pools.map((i: PreflightIssue) => i.message),
  });

  // Only questions the blueprint can actually draw need checking.
  const topics = new Set(blueprintTopics(blueprint));
  const drawable = pool.filter((q) => topics.has(q.topicId) && q.weight > 0);

  // 2. Answer keys and definitions.
  const keyProblems: string[] = [];
  for (const q of drawable) {
    const type = getQuestionType(q.type);
    const issues = validateQuestion(type, q.def);
    if (issues.some((i) => i.code === "malformed")) {
      keyProblems.push(`${qName(q.id)}: the question is incomplete or malformed.`);
      continue;
    }
    for (const issue of issues) {
      if (issue.severity === "blocking") keyProblems.push(`${qName(q.id)}: ${issue.message}`);
    }
  }
  items.push(
    item(
      "keys",
      "Every question has a complete answer key",
      keyProblems,
      "fail",
      `Checked ${plural(drawable.length, "question")} that can be drawn.`,
      "Fix these questions before publishing.",
    ),
  );

  // 3. Generation: each question must build cleanly, many times over.
  const genProblems: string[] = [];
  if (keyProblems.length === 0) {
    for (const q of drawable) {
      const type = getQuestionType(q.type);
      try {
        for (let s = 0; s < generations; s++) {
          const { instance } = generateQuestion(type, q.def, createRng(`preflight:${q.id}:${s}`));
          type.instanceSchema.parse(JSON.parse(JSON.stringify(instance)));
        }
      } catch (e) {
        genProblems.push(`${qName(q.id)}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  items.push(
    item(
      "generation",
      `Every question generates ${fmtNum(generations)} times without errors`,
      genProblems,
      "fail",
      keyProblems.length
        ? "Skipped until the answer-key problems are fixed."
        : `${plural(drawable.length, "question")} × ${fmtNum(generations)} generations, all valid.`,
      "These questions fail for some seeds, so some students would see a broken question.",
    ),
  );
  if (keyProblems.length) items[items.length - 1].status = "warn";

  // 4. Points.
  const summary = summarizeBlueprint(blueprint, pool, topicNames, estimateSecondsById(pool));
  const pointsProblems: string[] = [];
  if (summary.questionCount > 0 && summary.pointsMax === 0 && !summary.incomplete) {
    pointsProblems.push("The exam is worth 0 points.");
  }
  if (summary.pointsMin !== summary.pointsMax) {
    pointsProblems.push(
      `Students may be worth different totals (${fmtNum(summary.pointsMin)}–${fmtNum(summary.pointsMax)} points). Give questions in a section equal points to keep it fair.`,
    );
  }
  items.push({
    id: "points",
    title: "Points add up",
    status: pointsProblems.some((p) => p.includes("0 points"))
      ? "fail"
      : pointsProblems.length
        ? "warn"
        : "pass",
    detail: pointsProblems.length ? "Check how points are distributed." : `Every student's exam is worth ${fmtNum(summary.pointsMax)} points.`,
    problems: pointsProblems,
  });

  // 5. Time limit, against the rule-of-thumb estimate.
  const limit = settings.timeLimitMinutes;
  const estimate = summary.estimatedMinutes;
  const tight = limit !== null && estimate !== null && estimate > limit * 0.9;
  items.push({
    id: "time",
    title: "Time limit is set",
    status: limit === null || tight ? "warn" : "pass",
    detail:
      limit === null
        ? "No time limit: students can take as long as they like once they start."
        : `${plural(limit, "minute")} per attempt${estimate !== null ? `; a typical student needs about ${plural(estimate, "minute")}` : ""}.`,
    problems: tight
      ? [`The estimate (about ${plural(estimate!, "minute")}) is more than 90% of the limit, so slower students may run out of time.`]
      : [],
  });

  // 6. Access.
  items.push({
    id: "access",
    title: "Access settings are chosen",
    status: "pass",
    detail: `${settings.requireCode ? "A single-use code is required to enter" : "Any enrolled student can enter"}; ${plural(settings.attemptsAllowed, "attempt")} allowed.`,
    problems: [],
  });

  // Adaptive: the pool a live path is chosen from.
  if (settings.adaptive) {
    const topicSet = new Set(blueprintTopics(blueprint));
    const inTopics = pool.filter((q) => topicSet.has(q.topicId) && q.weight > 0);
    const handMarked = inTopics.filter((q) => getQuestionType(q.type).manual || getQuestionType(q.type).review);
    const usable = inTopics.length - handMarked.length;
    const levels = new Set(inTopics.filter((q) => !handMarked.includes(q)).map((q) => q.difficulty)).size;
    const problems: string[] = [];
    if (usable < settings.adaptive.length) problems.push(`Only ${plural(usable, "question")} can be used, but each student is asked ${settings.adaptive.length}.`);
    if (handMarked.length) problems.push(`${plural(handMarked.length, "hand-marked question")} (written answers, drawings, passages with them) can't steer an adaptive path and will be left out.`);
    if (settings.adaptive.rule === "staircase" && levels < 2) problems.push("Every usable question is at the same difficulty, so there is nowhere to step up or down.");
    items.push({
      id: "adaptive",
      title: "The adaptive pool can carry every student through",
      status: usable < settings.adaptive.length ? "fail" : problems.length ? "warn" : "pass",
      detail: `${settings.adaptive.rule === "rasch" ? "Rasch ability estimate" : "Difficulty steps"}, ${plural(settings.adaptive.length, "question")} per student, from ${plural(usable, "usable question")}.`,
      problems,
    });
  }

  // 7. Perfect-student and blank runs (needs the earlier checks to pass).
  const canRun = blueprintBlocking.length === 0 && keyProblems.length === 0 && genProblems.length === 0;
  const keyProblemsRun: string[] = [];
  let runDetail = "Skipped until the problems above are fixed.";
  if (canRun) {
    const result = checkKeys(blueprint, pool, keyRuns);
    if (result.buildFailures > 0) {
      keyProblemsRun.push(
        `${plural(result.buildFailures, "exam")} out of ${fmtNum(result.runs)} could not be built: ${result.firstBuildFailure}`,
      );
    }
    for (const f of result.failures.slice(0, 5)) {
      keyProblemsRun.push(
        f.kind === "perfect"
          ? `${qName(f.questionId)}: answering with its own key scored ${fmtNum(f.score)} of ${fmtNum(f.expected)}.`
          : f.kind === "blank"
            ? `${qName(f.questionId)}: leaving it blank scored ${fmtNum(f.score)}, not 0.`
            : `${qName(f.questionId)}: a deliberately wrong answer scored ${fmtNum(f.score)}. The key accepts answers it shouldn't.`,
      );
    }
    if (result.failures.length > 5) keyProblemsRun.push(`…and ${fmtNum(result.failures.length - 5)} more.`);
    runDetail = `${plural(result.runs, "fake student")} answered with the key (all full marks), ${fmtNum(result.runs)} left everything blank (all zero) and ${fmtNum(result.runs)} answered everything wrong (${wrongDetail(result.wrong, qName)}).`;
  }
  items.push({
    id: "perfect",
    title: "A perfect student scores 100%, a blank or wrong one scores nothing",
    status: !canRun ? "warn" : keyProblemsRun.length ? "fail" : "pass",
    detail: keyProblemsRun.length ? "The answer key or grader disagrees with itself." : runDetail,
    problems: keyProblemsRun,
  });

  const blocking = items.filter((i) => i.status === "fail").length;
  const warnings = items.filter((i) => i.status === "warn").length;
  return { items, blocking, warnings };
}
