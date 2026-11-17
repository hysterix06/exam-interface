// A sandbox for students' JavaScript: QuickJS compiled to WebAssembly, so code
// runs with no network, no file system and no access to the page or server.
// Work is limited by a *step count* (QuickJS's interrupt callback), not the
// wall clock, so the same code gives the same result on any machine; memory
// and stack are capped too. Date and Math.random are fixed. Loading the
// engine is async (initSandbox); running tests afterwards is synchronous, so
// grading stays a pure function.
import type { QuickJSWASMModule } from "quickjs-emscripten-core";

/** Version stamp shown in explanations, so a result can be reproduced with the same engine. */
export const SANDBOX_VERSION = "quickjs-emscripten 0.32.0";
export const DEFAULT_STEP_LIMIT = 2_000;
const MEMORY_BYTES = 16 * 1024 * 1024;
const STACK_BYTES = 512 * 1024;
const MAX_OUTPUT = 2_000;

let mod: QuickJSWASMModule | null = null;
let loading: Promise<void> | null = null;

/** Load the engine once (dynamic import: pages without code questions never fetch it). */
export function initSandbox(): Promise<void> {
  loading ??= (async () => {
    const [{ newQuickJSWASMModuleFromVariant }, variant] = await Promise.all([import("quickjs-emscripten-core"), import("@jitl/quickjs-singlefile-browser-release-sync")]);
    mod = await newQuickJSWASMModuleFromVariant(variant.default);
  })();
  return loading;
}

export const sandboxReady = () => mod !== null;

export interface CodeTest {
  id: string;
  label: string;
  /** An expression using the student's code, e.g. "add(2, 3)". */
  call: string;
  /** The expected value as JSON, e.g. "5" or "[1,2]" or "\"hi\"". */
  expected: string;
  /** Numbers within this distance count as equal. */
  tolerance?: number;
  /** Not shown to students before release (stops hard-coding the visible cases). */
  hidden?: boolean;
}

export interface TestRun {
  id: string;
  ok: boolean;
  /** The value the call produced, as JSON, or the error. */
  got: string;
  error: string | null;
  steps: number;
  /** console.log output, capped. */
  output: string;
}

// Fixed clock and seeded randomness, so a test can't pass or fail by luck or by time of day.
const PRELUDE = `
(() => {
  const RealDate = Date;
  class FixedDate extends RealDate { constructor(...a) { super(...(a.length ? a : [Date.UTC(2026, 0, 1)])); } static now() { return Date.UTC(2026, 0, 1); } }
  globalThis.Date = FixedDate;
  let s = 42;
  Math.random = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
  const out = [];
  globalThis.__out = out;
  globalThis.console = { log: (...a) => { if (out.join("\\n").length < ${MAX_OUTPUT}) out.push(a.map((x) => typeof x === "string" ? x : JSON.stringify(x)).join(" ")); } };
})();
`;

/** Canonical JSON (sorted keys) so {a,b} equals {b,a}. */
function canon(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])]));
  return v;
}

/** Deep equality on JSON values, with an optional tolerance for numbers anywhere inside. */
export function sameJson(a: unknown, b: unknown, tol = 0): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= tol + 1e-12 * Math.max(1, Math.abs(b));
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameJson(x, b[i], tol));
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], tol));
  }
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

const cache = new Map<string, TestRun[]>();
const CACHE_MAX = 512;

/**
 * Run each test against the student's code in a fresh context. Synchronous;
 * throws if initSandbox() hasn't finished (callers await ensureTypesReady()).
 */
export function runTests(code: string, tests: readonly CodeTest[], stepLimit = DEFAULT_STEP_LIMIT): TestRun[] {
  if (!mod) throw new Error("The code sandbox isn't loaded yet (await ensureTypesReady() first).");
  const key = JSON.stringify([code, tests, stepLimit]);
  const hit = cache.get(key);
  if (hit) return hit;

  const runs = tests.map((t): TestRun => {
    const rt = mod!.newRuntime();
    let steps = 0;
    rt.setInterruptHandler(() => ++steps > stepLimit);
    rt.setMemoryLimit(MEMORY_BYTES);
    rt.setMaxStackSize(STACK_BYTES);
    const ctx = rt.newContext();
    try {
      const program = `${PRELUDE}\n${code}\n;JSON.stringify({ v: (${t.call}) })`;
      const r = ctx.evalCode(program, "answer.js");
      const outHandle = ctx.getProp(ctx.global, "__out");
      const output = (ctx.dump(outHandle) as string[] | undefined)?.join("\n").slice(0, MAX_OUTPUT) ?? "";
      outHandle.dispose();
      if (r.error) {
        const e = ctx.dump(r.error) as { name?: string; message?: string } | string;
        r.error.dispose();
        const msg = typeof e === "string" ? e : `${e?.name ?? "Error"}: ${e?.message ?? ""}`;
        const friendly = /interrupted/.test(msg) ? `Stopped after ${stepLimit} steps: the code ran too long (an endless loop?).` : /out of memory/i.test(msg) ? "Stopped: the code used too much memory." : msg;
        return { id: t.id, ok: false, got: "error", error: friendly, steps, output };
      }
      const text = ctx.dump(r.value) as string;
      r.value.dispose();
      const got = (JSON.parse(text) as { v?: unknown }).v;
      let expected: unknown;
      try {
        expected = JSON.parse(t.expected);
      } catch {
        return { id: t.id, ok: false, got: JSON.stringify(got) ?? "undefined", error: "The test's expected value isn't valid JSON.", steps, output };
      }
      return { id: t.id, ok: sameJson(got, expected, t.tolerance ?? 0), got: JSON.stringify(got) ?? "undefined", error: null, steps, output };
    } catch (e) {
      return { id: t.id, ok: false, got: "error", error: e instanceof Error ? e.message : String(e), steps, output: "" };
    } finally {
      ctx.dispose();
      rt.dispose();
    }
  });
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, runs);
  return runs;
}
