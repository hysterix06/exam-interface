import { all, create } from "mathjs";

// A locked-down mathjs: authors write formulas, never code. Anything that
// could define functions, load modules or re-enter the parser is disabled.
const math = create(all);
// Keep the real evaluator for ourselves; formulas themselves can't call it.
const evaluate = math.evaluate.bind(math);
const forbidden = () => {
  throw new Error("This function is not allowed in formulas.");
};
math.import(
  {
    import: forbidden,
    createUnit: forbidden,
    evaluate: forbidden,
    parse: forbidden,
    simplify: forbidden,
    derivative: forbidden,
    resolve: forbidden,
    reviver: forbidden,
  },
  { override: true },
);

export class ExprError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExprError";
  }
}

export type Scope = Record<string, number | string | boolean>;

/** Evaluate a formula to a finite number. Division by zero etc. throw ExprError. */
export function evalNumber(expr: string, scope: Scope): number {
  let result: unknown;
  try {
    result = evaluate(expr, { ...scope });
  } catch (e) {
    throw new ExprError(`Can't calculate “${expr}”: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new ExprError(`“${expr}” didn't produce a finite number${typeof result === "number" ? ` (got ${result})` : ""}.`);
  }
  // Strip float noise (0.1 + 0.2) without hiding real digits.
  return Number(result.toPrecision(12)) + 0;
}

/** Evaluate a yes/no condition such as "b != a" or "a*b < 100". */
export function evalCondition(expr: string, scope: Scope): boolean {
  let result: unknown;
  try {
    result = evaluate(expr, { ...scope });
  } catch (e) {
    throw new ExprError(`Can't check “${expr}”: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (typeof result !== "boolean") throw new ExprError(`“${expr}” should be a yes/no condition like a < b.`);
  return result;
}
