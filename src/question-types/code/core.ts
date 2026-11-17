import { z } from "zod";
import { fmtNum, roundScore } from "@/engine/grading/format";
import { defineQuestionType } from "@/engine/question-type";
import { DEFAULT_STEP_LIMIT, initSandbox, runTests, SANDBOX_VERSION, sandboxReady } from "@/engine/sandbox/quickjs";
import type { GradeLine, PreflightIssue } from "@/engine/types";

// Write a JavaScript function; it is run against test cases in a sandbox
// (QuickJS in WebAssembly) and each passing test earns an equal share. Hidden
// tests never reach the student, so the visible ones can't simply be hard-coded.

const testSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  call: z.string(),
  expected: z.string(),
  tolerance: z.number().min(0).optional(),
  hidden: z.boolean().default(false),
});
const defSchema = z.object({
  stem: z.string(),
  language: z.literal("javascript").default("javascript"),
  /** What the editor starts with. */
  starter: z.string(),
  /** A correct solution: must pass every test (it is the answer key). */
  solution: z.string(),
  tests: z.array(testSchema),
  /** Work budget per test, in sandbox steps (about 5,000 operations each). */
  stepLimit: z.number().int().min(10).max(100_000).default(DEFAULT_STEP_LIMIT),
});
const instanceSchema = defSchema;
const responseSchema = z.object({ code: z.string().max(50_000) });

export type CodeDef = z.infer<typeof defSchema>;
export type CodeInstance = z.infer<typeof instanceSchema>;
export type CodeResponse = z.infer<typeof responseSchema>;

export const code = defineQuestionType<CodeDef, CodeInstance, CodeResponse>({
  id: "code",
  label: "Code (JavaScript)",
  defSchema,
  instanceSchema,
  responseSchema,

  init: initSandbox,

  generate: (def) => ({ instance: def, vars: {} }),

  grade(inst, response, { points }) {
    const share = inst.tests.length ? points / inst.tests.length : points;
    const answered = (response?.code ?? "").trim() !== "" && response!.code.trim() !== inst.starter.trim();
    if (!answered) {
      const lines = inst.tests.map((t, i): GradeLine => ({ label: t.hidden ? `Hidden test ${i + 1}` : t.label || t.call, expected: t.hidden ? "hidden" : t.expected, got: "no answer", verdict: "unanswered", points: 0, max: share }));
      return { score: 0, max: points, needsReview: false, lines };
    }
    const runs = runTests(response!.code, inst.tests, inst.stepLimit);
    const lines = inst.tests.map((t, i): GradeLine => {
      const r = runs[i];
      return {
        label: t.hidden ? `Hidden test ${i + 1}` : t.label || t.call,
        expected: t.hidden ? "hidden" : t.expected,
        got: t.hidden ? (r.ok ? "passed" : "failed") : r.error ?? r.got,
        verdict: r.ok ? "correct" : "wrong",
        points: r.ok ? share : 0,
        max: share,
        // Visible tests show the error as the result; hidden ones say only why they failed.
        note: [t.hidden ? (r.error ?? "") : `Ran ${t.call}.`, `${fmtNum(r.steps)} of ${fmtNum(inst.stepLimit)} steps (${SANDBOX_VERSION}).`].filter(Boolean).join(" "),
      };
    });
    return { score: roundScore(lines.reduce((s, l) => s + l.points, 0)), max: points, needsReview: false, lines };
  },

  keyResponse: (inst) => ({ code: inst.solution }),
  randomResponse: (inst, rng) => (rng.next() < 0.33 ? { code: inst.solution } : { code: `${inst.starter}\n// attempt ${rng.int(1, 999)}\n` }),
  // Every function the tests could call throws, so every test fails.
  wrongResponse: (inst) => ({ code: `${inst.starter}\n;${[...new Set(inst.tests.map((t) => /^\s*([A-Za-z_$][\w$]*)\s*\(/.exec(t.call)?.[1]).filter(Boolean))].map((f) => `${f} = () => { throw new Error("wrong-answer run"); };`).join("\n")}` }),
  estimateSeconds: (def) => 300 + 60 * def.tests.length,

  validateDef(def) {
    const issues: PreflightIssue[] = [];
    const block = (codeId: string, message: string, path?: string) => issues.push({ severity: "blocking", code: codeId, message, path });
    if (!def.stem.trim()) block("code.empty-stem", "The question has no text.", "stem");
    if (def.tests.length === 0) block("code.no-tests", "Add at least one test case, so the code can be graded.", "tests");
    if (new Set(def.tests.map((t) => t.id)).size !== def.tests.length) block("code.duplicate-test", "Two tests share the same id.", "tests");
    def.tests.forEach((t, i) => {
      if (!t.call.trim()) block("code.empty-call", `Test ${i + 1} needs a call, e.g. add(2, 3).`, `tests[${i}].call`);
      try {
        JSON.parse(t.expected);
      } catch {
        block("code.bad-expected", `Test ${i + 1}: the expected value must be JSON, e.g. 5, "text", [1, 2] or {"a": 1}.`, `tests[${i}].expected`);
      }
    });
    if (!def.solution.trim()) block("code.no-solution", "Add a model solution: it is the answer key and proves the tests are right.", "solution");
    if (def.tests.length > 0 && def.tests.every((t) => t.hidden)) issues.push({ severity: "warning", code: "code.all-hidden", message: "Every test is hidden, so students have no example of what's expected.", path: "tests" });
    if (issues.some((i) => i.severity === "blocking")) return issues;
    if (!sandboxReady()) {
      issues.push({ severity: "warning", code: "code.not-checked", message: "The tests couldn't be run here; they run when the exam is checked before publishing." });
      return issues;
    }
    const runs = runTests(def.solution, def.tests, def.stepLimit);
    runs.forEach((r, i) => {
      if (!r.ok) block("code.solution-fails", `The model solution fails test ${i + 1} (${def.tests[i].call}): ${r.error ?? `got ${r.got}, expected ${def.tests[i].expected}`}.`, `tests[${i}]`);
    });
    const starter = runTests(def.starter, def.tests, def.stepLimit);
    if (def.starter.trim() && starter.every((r) => r.ok)) issues.push({ severity: "warning", code: "code.starter-passes", message: "The starter code already passes every test.", path: "starter" });
    return issues;
  },

  redact: ({ stem, language, starter, tests }) => ({
    stem,
    language,
    starter,
    // Visible tests are examples; hidden ones stay on the server.
    tests: tests.filter((t) => !t.hidden).map(({ id, label, call, expected }) => ({ id, label, call, expected })),
  }),
});
