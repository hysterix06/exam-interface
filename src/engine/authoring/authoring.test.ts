import { describe, expect, it } from "vitest";
import { fixturesByType } from "@/question-types/fixtures";
import type { AttemptPoolItem } from "../attempt";
import { examSettingsSchema } from "../exam";
import type { Blueprint } from "../selection/types";
import { estimateSecondsById } from "./estimate";
import { preflightExam } from "./preflight";
import { checkKeys, estimateOdds, oddsOf, simulate } from "./simulate";
import { summarizeBlueprint } from "./summary";
import { exploreVariants } from "./variants";

// Two topics: "bio" (4 mcq-ish questions) and "gen" (3 questions).
const mcq = fixturesByType["mcq"][0];
function q(id: string, topicId: string, extra: Partial<AttemptPoolItem> = {}): AttemptPoolItem {
  return { id, versionId: `${id}-v1`, topicId, type: "mcq", def: mcq, weight: 1, difficulty: 2, points: 2, ...extra };
}
const POOL: AttemptPoolItem[] = [
  q("b1", "bio"),
  q("b2", "bio"),
  q("b3", "bio", { difficulty: 1 }),
  q("b4", "bio", { difficulty: 3 }),
  q("g1", "gen"),
  q("g2", "gen"),
  q("g3", "gen"),
];
const NAMES = { bio: "Cell Biology", gen: "Genetics" };
const BLUEPRINT: Blueprint = {
  sections: [
    { topicId: "bio", count: 2 },
    { topicId: "gen", count: 2 },
  ],
  shuffleQuestions: true,
};
const SETTINGS = examSettingsSchema.parse({ timeLimitMinutes: 30 });

describe("examSettingsSchema", () => {
  it("parses {} to safe defaults", () => {
    expect(examSettingsSchema.parse({})).toEqual({
      timeLimitMinutes: null,
      attemptsAllowed: 1,
      requireCode: false,
      oneWayNavigation: false,
      release: "score",
      questionTimeLimitSeconds: null,
      late: { mode: "reject" },
      adaptive: null,
    });
  });
});

describe("summarizeBlueprint", () => {
  it("explains an empty blueprint", () => {
    const s = summarizeBlueprint({ sections: [], shuffleQuestions: true }, POOL, NAMES);
    expect(s.questionCount).toBe(0);
    expect(s.sentences[0]).toMatch(/No sections yet/);
  });

  it("describes counts, points and ordering in plain language", () => {
    const s = summarizeBlueprint(BLUEPRINT, POOL, NAMES);
    expect(s.sentences).toEqual([
      "Each student gets 4 questions: 2 from Cell Biology, 2 from Genetics.",
      "Total 8 points.",
      "Each student sees the questions in a different random order.",
    ]);
    expect([s.pointsMin, s.pointsMax]).toEqual([8, 8]);
  });

  it("lists the difficulty mix and reports a points range", () => {
    const pool = [q("b1", "bio", { difficulty: 1, points: 1 }), q("b2", "bio", { difficulty: 1, points: 3 }), q("b3", "bio", { difficulty: 3, points: 5 })];
    const s = summarizeBlueprint(
      { sections: [{ topicId: "bio", count: 2, difficultyMix: { "1": 1, "3": 1 } }], shuffleQuestions: false },
      pool,
      NAMES,
    );
    expect(s.sentences[0]).toBe("Each student gets 2 questions: 2 from Cell Biology (1 easy, 1 hard).");
    expect([s.pointsMin, s.pointsMax]).toEqual([6, 8]);
    expect(s.sentences[1]).toBe("Total between 6 and 8 points, depending on which questions are drawn.");
    expect(s.sentences[2]).toBe("Questions appear in section order for every student.");
  });

  it("flags a partial count when a pool is too small, and singularises", () => {
    const s = summarizeBlueprint({ sections: [{ topicId: "gen", count: 1 }, { topicId: "nope", count: 2 }], shuffleQuestions: true }, POOL, NAMES);
    expect(s.incomplete).toBe(true);
    expect(s.sentences[1]).toMatch(/partial count/);
    const one = summarizeBlueprint({ sections: [{ topicId: "gen", count: 1 }], shuffleQuestions: true }, [q("g1", "gen", { points: 1 })], NAMES);
    expect(one.sentences.slice(0, 2)).toEqual(["Each student gets 1 question: 1 from Genetics.", "Total 1 point."]);
  });

  it("uses a generic label for unusual difficulty levels", () => {
    const pool = [q("a", "bio", { difficulty: 5 })];
    const s = summarizeBlueprint({ sections: [{ topicId: "bio", count: 1, difficultyMix: { "5": 1 } }], shuffleQuestions: true }, pool, NAMES);
    expect(s.sentences[0]).toContain("1 level 5");
  });
});

describe("estimateOdds", () => {
  it("matches the blueprint: 2 of 4 equal questions is about 50% each", () => {
    const odds = estimateOdds(BLUEPRINT, POOL, 2000);
    expect(odds.failures).toBe(0);
    expect(oddsOf(odds, "b1")).toBeGreaterThan(0.42);
    expect(oddsOf(odds, "b1")).toBeLessThan(0.58);
    // 2 of 3 in Genetics.
    expect(oddsOf(odds, "g1")).toBeGreaterThan(0.6);
    expect(oddsOf(odds, "g1")).toBeLessThan(0.74);
  });

  it("is deterministic", () => {
    expect(estimateOdds(BLUEPRINT, POOL, 100)).toEqual(estimateOdds(BLUEPRINT, POOL, 100));
  });

  it("counts failures when the pool is too small and reports 0 odds", () => {
    const odds = estimateOdds({ sections: [{ topicId: "gen", count: 5 }], shuffleQuestions: true }, POOL, 10);
    expect(odds.failures).toBe(10);
    expect(oddsOf(odds, "g1")).toBe(0);
  });

  it("rethrows unexpected errors", () => {
    const bad = { sections: null } as unknown as Blueprint;
    expect(() => estimateOdds(bad, POOL, 1)).toThrow();
  });
});

describe("simulate", () => {
  it("balances topics, spreads scores and is reproducible", () => {
    const a = simulate(BLUEPRINT, POOL, 200);
    expect(a).toEqual(simulate(BLUEPRINT, POOL, 200));
    expect(a.failures).toBe(0);
    expect(a.topicBalance.bio).toEqual({ min: 2, max: 2, mean: 2 });
    expect(a.histogram).toHaveLength(10);
    expect(a.histogram.reduce((s, n) => s + n, 0)).toBe(200);
    expect(Object.values(a.drawn).reduce((s, n) => s + n, 0)).toBe(800);
    expect(a.scores!.min).toBeLessThanOrEqual(a.scores!.median);
    expect(a.scores!.median).toBeLessThanOrEqual(a.scores!.max);
  });

  it("reports build failures instead of throwing", () => {
    const r = simulate({ sections: [{ topicId: "gen", count: 9 }], shuffleQuestions: true }, POOL, 5);
    expect(r.failures).toBe(5);
    expect(r.firstFailure).toMatch(/needs 9 question/);
    expect(r.scores).toBeNull();
  });

  it("takes the median of an even number of runs", () => {
    const r = simulate(BLUEPRINT, POOL, 2);
    expect(r.scores!.median).toBeCloseTo((r.scores!.min + r.scores!.max) / 2);
  });

  it("adds a rule-of-thumb time estimate when given one", () => {
    const secondsById = estimateSecondsById(POOL);
    // mcq fixture: 30 s + 8 s per option, times the difficulty factor.
    const options = (mcq as { options: unknown[] }).options.length;
    expect(secondsById.b2).toBe(30 + 8 * options);
    expect(secondsById.b3).toBe((30 + 8 * options) * 0.75);
    expect(secondsById.b4).toBe((30 + 8 * options) * 1.5);
    const s = summarizeBlueprint(BLUEPRINT, POOL, NAMES, secondsById);
    expect(s.estimatedMinutes).toBeGreaterThan(0);
    expect(s.sentences).toContain(`Estimated time about ${s.estimatedMinutes} min for a typical student (a rule of thumb per question type and difficulty).`);
    expect(summarizeBlueprint(BLUEPRINT, POOL, NAMES).estimatedMinutes).toBeNull();
  });

  it("rethrows unexpected errors", () => {
    expect(() => simulate({ sections: [{ topicId: "bio", count: 1 }], shuffleQuestions: true }, [q("x", "bio", { type: "nope" })], 1)).toThrow(/Unknown question type/);
  });
});

describe("checkKeys", () => {
  it("passes on a healthy pool", () => {
    const r = checkKeys(BLUEPRINT, POOL, 50);
    expect(r).toMatchObject({ buildFailures: 0, failures: [] });
  });

  it("reports unfillable blueprints", () => {
    const r = checkKeys({ sections: [{ topicId: "gen", count: 9 }], shuffleQuestions: true }, POOL, 3);
    expect(r.buildFailures).toBe(3);
    expect(r.firstBuildFailure).toBeTruthy();
  });

  it("runs an all-wrong student: zero without penalties", () => {
    const lenient = { ...(mcq as object), penalty: 0 };
    const pool = POOL.map((p) => ({ ...p, def: lenient }));
    const r = checkKeys(BLUEPRINT, pool, 5);
    expect(r.wrong).toEqual({ min: 0, max: 0, outOf: 8, penalized: [] });
  });

  it("reports negative marking in the wrong run", () => {
    const harsh = { ...(mcq as object), multiple: false, penalty: 0.5 };
    const pool = [q("p1", "bio", { def: harsh }), q("p2", "bio", { def: { ...(mcq as object), penalty: 0 } })];
    const r = checkKeys({ sections: [{ topicId: "bio", count: 2 }], shuffleQuestions: true }, pool, 3);
    expect(r.failures).toEqual([]);
    expect(r.wrong).toEqual({ min: -1, max: -1, outOf: 4, penalized: ["p1"] });
  });

  it("flags a key that accepts a wrong answer", () => {
    const anything = { stem: "Say anything", match: { kind: "regex", pattern: ".*", example: "hi", caseSensitive: false } };
    const pool = [q("r1", "bio", { type: "short-answer", def: anything })];
    const r = checkKeys({ sections: [{ topicId: "bio", count: 1 }], shuffleQuestions: true }, pool, 2);
    expect(r.failures.map((f) => f.kind)).toEqual(["wrong", "wrong"]);
    const report = preflightExam({ blueprint: { sections: [{ topicId: "bio", count: 1 }], shuffleQuestions: true }, settings: SETTINGS, pool }, { generations: 2, keyRuns: 2 });
    expect(report.items.find((i) => i.id === "perfect")?.problems[0]).toMatch(/deliberately wrong answer scored 2/);
  });

  it("rethrows unexpected errors", () => {
    expect(() => checkKeys({ sections: [{ topicId: "bio", count: 1 }], shuffleQuestions: true }, [q("x", "bio", { type: "nope" })], 1)).toThrow();
  });
});

// The same pool with genuinely different questions, so "near-identical" stays quiet.
const SUBJECTS = ["mitosis", "osmosis", "ribosomes", "alleles", "meiosis", "codons", "plasmids"];
const DISTINCT_POOL = POOL.map((p, i) => ({
  ...p,
  def: {
    ...(mcq as object),
    stem: `Explain ${SUBJECTS[i]} in your own words, question ${i}.`,
    options: [
      { id: "a", text: `${SUBJECTS[i]} right`, correct: true },
      { id: "b", text: `${SUBJECTS[(i + 3) % 7]} wrong ${i}`, correct: false },
    ],
  },
}));

describe("preflightExam", () => {
  const run = (over: Partial<Parameters<typeof preflightExam>[0]> = {}) =>
    preflightExam({ blueprint: BLUEPRINT, settings: SETTINGS, pool: DISTINCT_POOL, topicNames: NAMES, ...over }, { generations: 20, keyRuns: 20 });

  it("warns about near-identical questions in the pools item", () => {
    const r = run({ pool: POOL });
    const pools = r.items.find((i) => i.id === "pools")!;
    expect(pools.status).toBe("warn");
    expect(pools.problems.some((p) => /the same text/.test(p))).toBe(true);
  });

  it("passes a healthy exam with every item green", () => {
    const r = run();
    expect(r.blocking).toBe(0);
    expect(r.warnings).toBe(0);
    expect(r.items.map((i) => i.id)).toEqual(["pools", "keys", "generation", "points", "time", "access", "perfect"]);
    expect(r.items.every((i) => i.status === "pass")).toBe(true);
  });

  it("blocks when a pool is too small and skips the runs", () => {
    const r = run({ blueprint: { sections: [{ topicId: "gen", count: 9 }], shuffleQuestions: true } });
    expect(r.blocking).toBe(1);
    expect(r.items[0].problems[0]).toMatch(/Genetics has 3 question\(s\) but 9/);
    expect(r.items.at(-1)!.status).toBe("warn");
  });

  it("blocks on an empty blueprint", () => {
    const r = run({ blueprint: { sections: [], shuffleQuestions: true } });
    expect(r.items[0].status).toBe("fail");
  });

  it("names the question with a broken key", () => {
    const broken = q("b1", "bio", { def: { ...(mcq as object), options: [{ id: "a", text: "A", correct: false }, { id: "b", text: "B", correct: false }] } });
    const r = run({ pool: [broken, ...POOL.slice(1)], questionNames: { b1: "Mitochondria" } });
    const keys = r.items.find((i) => i.id === "keys")!;
    expect(keys.status).toBe("fail");
    expect(keys.problems.join(" ")).toMatch(/Mitochondria: Mark at least one option as correct/);
    expect(r.items.find((i) => i.id === "generation")!.status).toBe("warn");
  });

  it("flags malformed definitions", () => {
    const r = run({ pool: [q("b1", "bio", { def: { nonsense: true } }), ...POOL.slice(1)] });
    expect(r.items.find((i) => i.id === "keys")!.problems[0]).toMatch(/incomplete or malformed/);
  });

  it("warns when the time estimate is close to the limit", () => {
    const r = run({ settings: examSettingsSchema.parse({ timeLimitMinutes: 1 }) });
    const time = r.items.find((i) => i.id === "time")!;
    expect(time.status).toBe("warn");
    expect(time.problems[0]).toMatch(/more than 90% of the limit/);
    expect(run().items.find((i) => i.id === "time")!.status).toBe("pass");
  });

  it("warns, rather than blocks, for no time limit and unequal points", () => {
    const r = run({
      settings: examSettingsSchema.parse({ requireCode: true, attemptsAllowed: 2 }),
      pool: [q("b1", "bio", { points: 1 }), q("b2", "bio", { points: 5 }), ...POOL.slice(2)],
    });
    expect(r.blocking).toBe(0);
    expect(r.items.find((i) => i.id === "time")!.status).toBe("warn");
    expect(r.items.find((i) => i.id === "points")!.status).toBe("warn");
    expect(r.items.find((i) => i.id === "access")!.detail).toMatch(/single-use code.*2 attempts/);
  });

  it("blocks an exam worth 0 points", () => {
    const r = run({ pool: POOL.map((p) => ({ ...p, points: 0 })) });
    expect(r.items.find((i) => i.id === "points")!.status).toBe("fail");
  });

  it("does not crash on a malformed pool", () => {
    const bad = q("b1", "bio", { def: { ...(mcq as object), options: undefined } });
    expect(() => run({ pool: [bad, ...POOL.slice(1)] })).not.toThrow();
  });
});

describe("exploreVariants", () => {
  it("returns 20 labelled variants with keys", () => {
    const r = exploreVariants("mcq", mcq);
    if (!r.ok) throw new Error(r.error);
    expect(r.rows).toHaveLength(20);
    expect(r.rows[0].seed).toBe("variant:1");
    expect(r.rows[0].key).toBeTruthy();
    expect(r.distinct).toBeGreaterThan(1);
  });

  it("returns an error, not an exception, for a bad definition", () => {
    expect(exploreVariants("mcq", { nope: 1 }).ok).toBe(false);
    expect(exploreVariants("nope", {})).toMatchObject({ ok: false });
    expect(exploreVariants("mcq", 5)).toMatchObject({ ok: false });
  });
});

describe("multi-topic sections in the summary", () => {
  it("names every topic and the limits", () => {
    const bp: Blueprint = { sections: [{ topicId: "bio", extraTopicIds: ["gen"], count: 4, limits: { gen: { min: 1, max: 2 } } }], shuffleQuestions: false };
    const s = summarizeBlueprint(bp, POOL, NAMES);
    expect(s.sentences[0]).toBe("Each student gets 4 questions: 4 from Cell Biology or Genetics (at least 1 from Genetics, at most 2 from Genetics).");
    const sim = simulate(bp, POOL, 20);
    expect(Object.keys(sim.topicBalance).sort()).toEqual(["bio", "gen"]);
    expect(sim.topicBalance.gen.min).toBeGreaterThanOrEqual(1);
    expect(sim.topicBalance.gen.max).toBeLessThanOrEqual(2);
  });
});
