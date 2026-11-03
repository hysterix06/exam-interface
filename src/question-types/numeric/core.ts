import { z } from "zod";
import { evalCondition, evalNumber, ExprError, type Scope } from "@/engine/expr";
import { fmtNum, orList, quote } from "@/engine/grading/format";
import { describeTolerance, parseNumberWithUnit, withinTolerance } from "@/engine/grading/numeric";
import { defineQuestionType } from "@/engine/question-type";
import { createRng, type Rng } from "@/engine/rng";
import type { GradeLine, PreflightIssue } from "@/engine/types";

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
/** Names mathjs gives meaning to; a variable called "e" would silently shadow Euler's number. */
const RESERVED = new Set(["answer", "e", "pi", "i", "PI", "E", "Infinity", "NaN", "true", "false", "null", "undefined"]);
const MAX_TRIES = 200;

const variableSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("int"), name: z.string(), min: z.number(), max: z.number() }),
  z.object({ kind: z.literal("float"), name: z.string(), min: z.number(), max: z.number(), decimals: z.number().int().min(0).max(8) }),
  z.object({ kind: z.literal("pick"), name: z.string(), options: z.array(z.string()) }),
]);

const defSchema = z.object({
  /** Text with {name} placeholders, replaced by this student's values. */
  stem: z.string(),
  variables: z.array(variableSchema),
  /** Conditions on the variables (and `answer`), e.g. "b != a", "answer == round(answer)". */
  constraints: z.array(z.string()).default([]),
  /** The formula for the correct answer. */
  answer: z.string(),
  tolerance: z.object({ abs: z.number().min(0).optional(), rel: z.number().min(0).optional() }).default({}),
  units: z.array(z.string()).optional(),
});

const instanceSchema = z.object({
  stem: z.string(),
  answer: z.number(),
  abs: z.number(),
  rel: z.number(),
  units: z.array(z.string()).optional(),
  /** Plain-language working shown to the educator. */
  working: z.string(),
});
const responseSchema = z.object({ text: z.string() });

export type NumericDef = z.infer<typeof defSchema>;
export type NumericInstance = z.infer<typeof instanceSchema>;
export type NumericResponse = z.infer<typeof responseSchema>;
type Variable = NumericDef["variables"][number];

function draw(v: Variable, rng: Rng): number | string {
  if (v.kind === "int") return rng.int(v.min, v.max);
  if (v.kind === "float") return Number(rng.float(v.min, v.max).toFixed(v.decimals));
  return rng.pick(v.options);
}

/** A pick option that is a plain number is used as a number in formulas. */
const asValue = (x: number | string): number | string =>
  typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x)) ? Number(x) : x;

export function fillStem(stem: string, values: Record<string, number | string | boolean>) {
  return stem.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (whole, name: string) =>
    name in values ? (typeof values[name] === "number" ? fmtNum(values[name] as number) : String(values[name])) : whole,
  );
}

export interface Drawn {
  values: Record<string, number | string>;
  answer: number;
  tries: number;
}

/**
 * Draw variable values until every constraint holds and the answer is a
 * finite number. Deterministic: the same rng gives the same values and the
 * same number of tries.
 */
export function drawValues(def: NumericDef, rng: Rng): Drawn {
  let lastProblem = "";
  for (let tries = 1; tries <= MAX_TRIES; tries++) {
    const values: Record<string, number | string> = {};
    for (const v of def.variables) values[v.name] = draw(v, rng);
    const scope: Scope = Object.fromEntries(Object.entries(values).map(([k, x]) => [k, asValue(x)]));
    try {
      const answer = evalNumber(def.answer, scope);
      if (def.constraints.every((c) => evalCondition(c, { ...scope, answer }))) return { values, answer, tries };
      lastProblem = "a constraint was never satisfied";
    } catch (e) {
      if (!(e instanceof ExprError)) throw e;
      lastProblem = e.message;
    }
  }
  throw new Error(`Couldn't generate this question in ${MAX_TRIES} tries (${lastProblem}). Loosen the constraints or widen the ranges.`);
}

export const numeric = defineQuestionType<NumericDef, NumericInstance, NumericResponse>({
  id: "numeric",
  label: "Numeric (parameterized)",
  defSchema,
  instanceSchema,
  responseSchema,

  generate(def, rng) {
    const { values, answer, tries } = drawValues(def, rng);
    const used = Object.entries(values)
      .map(([k, x]) => `${k} = ${typeof x === "number" ? fmtNum(x) : x}`)
      .join(", ");
    return {
      instance: {
        stem: fillStem(def.stem, values),
        answer,
        abs: def.tolerance.abs ?? 0,
        rel: def.tolerance.rel ?? 0,
        units: def.units?.length ? def.units : undefined,
        working: `${def.answer} with ${used || "no variables"} gives ${fmtNum(answer)}.`,
      },
      vars: { ...values, answer, tries },
    };
  },

  grade(inst, response, { points }) {
    const tol = { abs: inst.abs || undefined, rel: inst.rel || undefined };
    const unit = inst.units?.length ? ` ${orList(inst.units)}` : "";
    const expected = `${fmtNum(inst.answer)}${unit}, ${describeTolerance(tol)}`;
    const got = (response?.text ?? "").trim();
    const one = (l: Omit<GradeLine, "label" | "max">, score: number) => ({
      score,
      max: points,
      needsReview: false,
      lines: [{ label: "Answer", max: points, ...l }],
    });

    if (!got) return one({ expected, got: "no answer", verdict: "unanswered", points: 0 }, 0);

    const parsed = parseNumberWithUnit(got);
    if (!parsed) return one({ expected, got: quote(got), verdict: "wrong", points: 0, note: `Not a number. ${inst.working}` }, 0);
    if (inst.units && !inst.units.includes(parsed.unit)) {
      return one(
        { expected, got: quote(got), verdict: "wrong", points: 0, note: parsed.unit ? `Unit ${quote(parsed.unit)} is not accepted.` : "The answer needs a unit." },
        0,
      );
    }
    const ok = withinTolerance(inst.answer, parsed.value, tol);
    return one(
      {
        expected,
        got: quote(got),
        verdict: ok ? "correct" : "wrong",
        points: ok ? points : 0,
        note: `Off by ${fmtNum(Math.abs(parsed.value - inst.answer))}. ${inst.working}`,
      },
      ok ? points : 0,
    );
  },

  keyResponse: (inst) => ({ text: `${inst.answer}${inst.units?.length ? ` ${inst.units[0]}` : ""}` }),

  randomResponse(inst, rng) {
    if (rng.next() < 0.33) return { text: `${inst.answer}${inst.units?.length ? ` ${inst.units[0]}` : ""}` };
    return { text: `${fmtNum(inst.answer * rng.float(0.5, 1.5) + 1)}${inst.units?.length ? ` ${inst.units[0]}` : ""}` };
  },

  validateDef(def) {
    const issues: PreflightIssue[] = [];
    const block = (code: string, message: string, path?: string) => issues.push({ severity: "blocking", code, message, path });

    if (!def.stem.trim()) block("numeric.empty-stem", "The question has no text.", "stem");
    if (!def.answer.trim()) block("numeric.no-answer", "Add a formula for the correct answer.", "answer");

    const names = def.variables.map((v) => v.name);
    def.variables.forEach((v, i) => {
      if (!NAME_RE.test(v.name)) block("numeric.bad-name", `“${v.name}” isn't a valid variable name. Use letters, digits and underscores, starting with a letter.`, `variables[${i}].name`);
      else if (RESERVED.has(v.name)) block("numeric.reserved-name", `“${v.name}” has a special meaning in formulas. Choose another name.`, `variables[${i}].name`);
      if ((v.kind === "int" || v.kind === "float") && v.min > v.max) block("numeric.bad-range", `${v.name}: the minimum is above the maximum.`, `variables[${i}]`);
      if (v.kind === "int" && (!Number.isInteger(v.min) || !Number.isInteger(v.max))) block("numeric.int-range", `${v.name}: whole-number variables need whole-number limits.`, `variables[${i}]`);
      if (v.kind === "pick" && v.options.filter((o) => o.trim()).length === 0) block("numeric.no-options", `${v.name}: add at least one option to pick from.`, `variables[${i}].options`);
    });
    if (new Set(names).size !== names.length) block("numeric.duplicate-name", "Two variables share the same name.", "variables");

    for (const [, name] of def.stem.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) {
      if (!names.includes(name)) block("numeric.unknown-placeholder", `The question mentions {${name}}, but there is no variable with that name.`, "stem");
    }

    if (issues.length === 0) {
      // Prove it works: generate for many seeds and report what goes wrong.
      let failure: string | null = null;
      let failed = 0;
      let triesTotal = 0;
      const runs = 100;
      for (let s = 0; s < runs; s++) {
        try {
          triesTotal += drawValues(def, createRng(`validate:${s}`)).tries;
        } catch (e) {
          failed++;
          failure ??= e instanceof Error ? e.message : String(e);
        }
      }
      if (failed > 0) {
        block(
          "numeric.generation-fails",
          failed === runs
            ? `This question can never be generated. ${failure}`
            : `${failed} of ${runs} test generations failed. ${failure}`,
        );
      } else if (triesTotal / runs > 5) {
        issues.push({
          severity: "warning",
          code: "numeric.many-retries",
          message: `Constraints reject most random draws (about ${fmtNum(Math.round(triesTotal / runs))} tries each). It works, but widen the ranges if you can.`,
        });
      }
    }
    return issues;
  },

  redact: ({ stem }) => ({ stem }),
});
