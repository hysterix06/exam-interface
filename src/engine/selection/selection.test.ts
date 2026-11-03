import { describe, expect, it } from "vitest";
import { createRng } from "../rng";
import { checkBlueprint } from "./check";
import { explainSelection } from "./explain";
import { BlueprintError, selectQuestions } from "./select";
import type { Blueprint, PoolItem } from "./types";

function item(id: string, topicId: string, extra: Partial<PoolItem> = {}): PoolItem {
  return { id, topicId, weight: 1, difficulty: 2, points: 1, ...extra };
}

const POOL: PoolItem[] = [
  ...Array.from({ length: 8 }, (_, i) => item(`a${i}`, "A", { difficulty: (i % 3) + 1 })),
  ...Array.from({ length: 5 }, (_, i) => item(`b${i}`, "B")),
  ...Array.from({ length: 4 }, (_, i) => item(`c${i}`, "C")),
];

const BLUEPRINT: Blueprint = {
  sections: [
    { topicId: "A", count: 4 },
    { topicId: "B", count: 3 },
    { topicId: "C", count: 2 },
  ],
  shuffleQuestions: true,
};

const select = (bp: Blueprint, pool: PoolItem[], seed: string) =>
  selectQuestions(bp, pool, createRng(seed));

describe("selectQuestions", () => {
  it("is deterministic per seed and independent of pool order", () => {
    const a = select(BLUEPRINT, POOL, "s1");
    expect(select(BLUEPRINT, POOL, "s1")).toEqual(a);
    expect(select(BLUEPRINT, POOL.slice().reverse(), "s1").questionIds).toEqual(a.questionIds);
    expect(select(BLUEPRINT, POOL, "s2").questionIds).not.toEqual(a.questionIds);
  });

  it("always meets section counts with no duplicates", () => {
    for (let s = 0; s < 500; s++) {
      const { questionIds } = select(BLUEPRINT, POOL, `n${s}`);
      expect(questionIds).toHaveLength(9);
      expect(new Set(questionIds).size).toBe(9);
      const perTopic = (t: string) => questionIds.filter((id) => id.startsWith(t.toLowerCase())).length;
      expect([perTopic("A"), perTopic("B"), perTopic("C")]).toEqual([4, 3, 2]);
    }
  });

  it("keeps section order when shuffle is off", () => {
    const { questionIds } = select({ ...BLUEPRINT, shuffleQuestions: false }, POOL, "x");
    expect(questionIds.map((id) => id[0])).toEqual(["a", "a", "a", "a", "b", "b", "b", "c", "c"]);
  });

  it("honors the difficulty mix exactly", () => {
    const bp: Blueprint = {
      sections: [{ topicId: "A", count: 3, difficultyMix: { "1": 2, "3": 1 } }],
      shuffleQuestions: false,
    };
    const byId = new Map(POOL.map((q) => [q.id, q]));
    for (let s = 0; s < 200; s++) {
      const levels = select(bp, POOL, `d${s}`).questionIds.map((id) => byId.get(id)!.difficulty);
      expect(levels.sort()).toEqual([1, 1, 3]);
    }
  });

  it("never draws two questions from the same variant group", () => {
    const pool = [
      item("v1", "T", { groupKey: "g" }),
      item("v2", "T", { groupKey: "g" }),
      item("v3", "T", { groupKey: "g" }),
      item("x", "T"),
    ];
    const bp: Blueprint = { sections: [{ topicId: "T", count: 2 }], shuffleQuestions: false };
    for (let s = 0; s < 200; s++) {
      const { questionIds } = select(bp, pool, `g${s}`);
      expect(questionIds).toContain("x");
      expect(questionIds.filter((id) => id.startsWith("v"))).toHaveLength(1);
    }
  });

  it("never draws conflicting questions together, in either direction", () => {
    const pool = [item("p", "T", { conflictsWith: ["q"] }), item("q", "T"), item("r", "T")];
    const bp: Blueprint = { sections: [{ topicId: "T", count: 2 }], shuffleQuestions: false };
    let sawSkip = false;
    for (let s = 0; s < 200; s++) {
      const { questionIds, trace } = select(bp, pool, `c${s}`);
      expect(questionIds.includes("p") && questionIds.includes("q")).toBe(false);
      sawSkip ||= trace.skips.some((k) => k.reason === "conflict");
    }
    expect(sawSkip).toBe(true);
  });

  it("never draws zero-weight questions", () => {
    const pool = [item("z", "T", { weight: 0 }), item("y", "T"), item("w", "T")];
    const bp: Blueprint = { sections: [{ topicId: "T", count: 2 }], shuffleQuestions: false };
    for (let s = 0; s < 100; s++) expect(select(bp, pool, `z${s}`).questionIds).not.toContain("z");
  });

  it("draws one-of-n in proportion to weight", () => {
    const weights = [1, 2, 3, 4];
    const pool = weights.map((w, i) => item(`w${i}`, "T", { weight: w }));
    const bp: Blueprint = { sections: [{ topicId: "T", count: 1 }], shuffleQuestions: false };
    const n = 20_000;
    const counts = [0, 0, 0, 0];
    for (let s = 0; s < n; s++) counts[Number(select(bp, pool, `p${s}`).questionIds[0][1])]++;
    // Chi-square, 3 dof; 16.27 is the p = 0.001 critical value.
    const total = weights.reduce((a, b) => a + b, 0);
    const chi2 = counts.reduce((s, o, i) => {
      const e = (n * weights[i]) / total;
      return s + (o - e) ** 2 / e;
    }, 0);
    expect(chi2).toBeLessThan(16.27);
  });

  it("includes heavier questions more often when drawing several", () => {
    const pool = [1, 1, 2, 4, 8].map((w, i) => item(`h${i}`, "T", { weight: w }));
    const bp: Blueprint = { sections: [{ topicId: "T", count: 2 }], shuffleQuestions: false };
    const counts = new Map<string, number>();
    for (let s = 0; s < 5000; s++) {
      for (const id of select(bp, pool, `h${s}`).questionIds) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const c = (id: string) => counts.get(id) ?? 0;
    expect(c("h4")).toBeGreaterThan(c("h3"));
    expect(c("h3")).toBeGreaterThan(c("h2"));
    expect(c("h2")).toBeGreaterThan(c("h1"));
  });

  it("throws a plain-language error when the pool cannot satisfy the blueprint", () => {
    const bp: Blueprint = { sections: [{ topicId: "C", count: 5 }], shuffleQuestions: false };
    expect(() => select(bp, POOL, "x")).toThrow(BlueprintError);
    expect(() => select(bp, POOL, "x")).toThrow(/needs 5 question\(s\) but only 4 could be drawn/);
  });
});

describe("checkBlueprint", () => {
  const names = { A: "Cell Biology", B: "Genetics", C: "Ecology" };
  const codes = (bp: Blueprint, pool = POOL) => checkBlueprint(bp, pool, names).map((i) => i.code);

  it("passes a satisfiable blueprint", () => {
    expect(checkBlueprint(BLUEPRINT, POOL, names)).toEqual([]);
  });

  it("names the topic when the pool is too small", () => {
    const [issue] = checkBlueprint({ sections: [{ topicId: "C", count: 5 }], shuffleQuestions: true }, POOL, names);
    expect(issue).toMatchObject({
      severity: "blocking",
      message: "Ecology has 4 question(s) but 5 are requested.",
    });
  });

  it("counts variant groups once", () => {
    const pool = [item("v1", "T", { groupKey: "g" }), item("v2", "T", { groupKey: "g" }), item("x", "T")];
    expect(codes({ sections: [{ topicId: "T", count: 3 }], shuffleQuestions: true }, pool)).toContain(
      "blueprint.groups-too-small",
    );
  });

  it("checks the difficulty mix", () => {
    const bp: Blueprint = {
      sections: [{ topicId: "A", count: 4, difficultyMix: { "1": 1, "2": 1 } }],
      shuffleQuestions: true,
    };
    expect(codes(bp)).toContain("blueprint.mix-mismatch");
    const tooMany: Blueprint = {
      sections: [{ topicId: "A", count: 4, difficultyMix: { "1": 4 } }],
      shuffleQuestions: true,
    };
    expect(codes(tooMany)).toContain("blueprint.difficulty-too-small");
  });

  it("warns about zero weights, unequal totals and empty blueprints", () => {
    const pool = [item("a", "T", { weight: 0 }), item("b", "T", { points: 2 }), item("c", "T")];
    const issues = codes({ sections: [{ topicId: "T", count: 1 }], shuffleQuestions: true }, pool);
    expect(issues).toEqual(expect.arrayContaining(["blueprint.zero-weight", "blueprint.unequal-totals"]));
    expect(codes({ sections: [], shuffleQuestions: true })).toContain("blueprint.empty");
  });

  it("agrees with the selector: no blocking issues means selection succeeds", () => {
    expect(checkBlueprint(BLUEPRINT, POOL).some((i) => i.severity === "blocking")).toBe(false);
    for (let s = 0; s < 200; s++) expect(() => select(BLUEPRINT, POOL, `ok${s}`)).not.toThrow();
  });
});

describe("explainSelection", () => {
  it("describes a real draw", () => {
    const pool = [item("v1", "T"), item("v2", "T")];
    const bp: Blueprint = { sections: [{ topicId: "T", count: 1 }], shuffleQuestions: false };
    const { trace } = selectQuestions(bp, pool, createRng("e"));
    const lines = explainSelection(trace, bp, { topics: { T: "Genetics" } });
    expect(lines[0]).toMatch(
      /^v[12]: drawn from Genetics; ranked 1 of 2 in the weighted draw; its weight is 50% of the candidates\.$/,
    );
    expect(lines.at(-1)).toBe("Questions appear in section order.");
  });

  it("describes skips and shuffling", () => {
    const bp: Blueprint = { sections: [{ topicId: "T", count: 2 }], shuffleQuestions: true };
    const lines = explainSelection(
      {
        picks: [],
        skips: [
          { questionId: "q2", sectionIndex: 0, reason: "variant-group", because: "q1" },
          { questionId: "q3", sectionIndex: 0, reason: "conflict", because: "q1" },
        ],
        shuffled: true,
      },
      bp,
      { questions: { q1: "Photosynthesis A", q2: "Photosynthesis B", q3: "Light reactions" } },
    );
    expect(lines).toEqual([
      "Photosynthesis B: skipped because it is a variant of Photosynthesis A, which was already drawn.",
      "Light reactions: skipped because it can't appear with Photosynthesis A.",
      "Question order was then shuffled for this student.",
    ]);
  });
});
