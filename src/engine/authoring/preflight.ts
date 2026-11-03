import { fmtNum } from "../grading/format";
import { createRng } from "../rng";
import type { AttemptPoolItem } from "../attempt";
import { type Names, checkBlueprint } from "../selection/check";
import type { Blueprint } from "../selection/types";
import type { ExamSettings } from "../exam";
import type { PreflightIssue } from "../types";
import { getQuestionType } from "@/question-types/registry";
import { checkKeys } from "./simulate";
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
  const pools = checkBlueprint(blueprint, pool, topicNames);
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
  const topics = new Set(blueprint.sections.map((s) => s.topicId));
  const drawable = pool.filter((q) => topics.has(q.topicId) && q.weight > 0);

  // 2. Answer keys and definitions.
  const keyProblems: string[] = [];
  for (const q of drawable) {
    const type = getQuestionType(q.type);
    const parsed = type.defSchema.safeParse(q.def);
    if (!parsed.success) {
      keyProblems.push(`${qName(q.id)}: the question is incomplete or malformed.`);
      continue;
    }
    for (const issue of type.validateDef(parsed.data)) {
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
      const def = type.defSchema.parse(q.def);
      try {
        for (let s = 0; s < generations; s++) {
          const { instance } = type.generate(def, createRng(`preflight:${q.id}:${s}`));
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
  const summary = summarizeBlueprint(blueprint, pool, topicNames);
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

  // 5. Time limit.
  items.push({
    id: "time",
    title: "Time limit is set",
    status: settings.timeLimitMinutes === null ? "warn" : "pass",
    detail:
      settings.timeLimitMinutes === null
        ? "No time limit: students can take as long as they like once they start."
        : `${plural(settings.timeLimitMinutes, "minute")} per attempt.`,
    problems: [],
  });

  // 6. Access.
  items.push({
    id: "access",
    title: "Access settings are chosen",
    status: "pass",
    detail: `${settings.requireCode ? "A single-use code is required to enter" : "Any enrolled student can enter"}; ${plural(settings.attemptsAllowed, "attempt")} allowed.`,
    problems: [],
  });

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
          : `${qName(f.questionId)}: leaving it blank scored ${fmtNum(f.score)}, not 0.`,
      );
    }
    if (result.failures.length > 5) keyProblemsRun.push(`…and ${fmtNum(result.failures.length - 5)} more.`);
    runDetail = `${plural(result.runs, "fake student")} answered with the key (all full marks) and ${fmtNum(result.runs)} left everything blank (all zero).`;
  }
  items.push({
    id: "perfect",
    title: "A perfect student scores 100%, a blank one scores 0",
    status: !canRun ? "warn" : keyProblemsRun.length ? "fail" : "pass",
    detail: keyProblemsRun.length ? "The answer key or grader disagrees with itself." : runDetail,
    problems: keyProblemsRun,
  });

  const blocking = items.filter((i) => i.status === "fail").length;
  const warnings = items.filter((i) => i.status === "warn").length;
  return { items, blocking, warnings };
}
