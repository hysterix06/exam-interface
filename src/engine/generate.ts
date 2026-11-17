// The one way to turn a stored question definition into an instance. On top
// of the type's own generator it applies *wording variants*: an optional
// `textVars` block in the stored definition, so any type can swap names,
// contexts and units per student without the plugin knowing.
//
//   textVars: {
//     table: [{ name: "Ana", place: "Lisbon" }, { name: "Kofi", place: "Accra" }],   // one row per student
//     lists: [{ name: "unit", options: ["kg", "g"] }],                              // each drawn on its own
//   }
//   stem: "[[name]] flies from [[place]]..."
//
// Determinism: values come from rng.fork("text-vars"), which does not consume
// the question's stream, and a definition without textVars takes exactly the
// old path. So every existing exam generates byte-for-byte the same.
import { z } from "zod";
import type { AnyQuestionType } from "./question-type";
import type { Rng } from "./rng";
import type { GenerateResult, PreflightIssue } from "./types";
import { getQuestionType } from "@/question-types/registry";

/** Reserved key in a stored definition; never part of a type's own schema. */
export const TEXT_VARS_KEY = "textVars";

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PLACEHOLDER_RE = /\[\[([A-Za-z_][A-Za-z0-9_]*)\]\]/g;
/** Values may not smuggle in template syntax of their own. */
const FORBIDDEN_IN_VALUE = /\[\[|\]\]|\{\{|\}\}/;
/** Wording rows/options checked through the type's own pre-flight, at most. */
const MAX_VALIDATED = 50;

const textVarsSchema = z.object({
  table: z.array(z.record(z.string(), z.string())).max(200).default([]),
  lists: z.array(z.object({ name: z.string(), options: z.array(z.string()).max(200) })).max(20).default([]),
});
export type TextVars = z.infer<typeof textVarsSchema>;

/** Separate the wording variants from the type's own definition. */
export function splitDef(raw: unknown): { def: unknown; textVars: TextVars | null } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !(TEXT_VARS_KEY in raw)) return { def: raw, textVars: null };
  const { [TEXT_VARS_KEY]: tv, ...def } = raw as Record<string, unknown>;
  const parsed = textVarsSchema.safeParse(tv);
  if (!parsed.success) return { def, textVars: null };
  const empty = parsed.data.table.length === 0 && parsed.data.lists.length === 0;
  return { def, textVars: empty ? null : parsed.data };
}

/** Put wording variants back onto a definition (or drop the key when there are none). */
export function joinDef(def: unknown, textVars: TextVars | null): unknown {
  const base = { ...(def as Record<string, unknown>) };
  delete base[TEXT_VARS_KEY];
  return textVars && (textVars.table.length || textVars.lists.length) ? { ...base, [TEXT_VARS_KEY]: textVars } : base;
}

/** Every variable name a wording block defines: table columns, then lists. */
function textVarNames(tv: TextVars): string[] {
  const cols = [...new Set(tv.table.flatMap((row) => Object.keys(row)))];
  return [...cols, ...tv.lists.map((l) => l.name)];
}

/** One student's wording values. */
function drawTextVars(tv: TextVars, rng: Rng): Record<string, string> {
  const r = rng.fork("text-vars");
  const values: Record<string, string> = {};
  if (tv.table.length) Object.assign(values, r.fork("table").pick(tv.table));
  for (const l of tv.lists) {
    const options = l.options.filter((o) => o.trim());
    if (options.length) values[l.name] = r.fork(`list:${l.name}`).pick(options);
  }
  return values;
}

/** Replace [[name]] in every string of a definition (object keys too: accepted-answer maps). */
export function substitute(value: unknown, values: Readonly<Record<string, string>>): unknown {
  const sub = (s: string) => s.replace(PLACEHOLDER_RE, (whole, name: string) => (name in values ? values[name] : whole));
  if (typeof value === "string") return sub(value);
  if (Array.isArray(value)) return value.map((v) => substitute(v, values));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [sub(k), substitute(v, values)]));
  }
  return value;
}

/** Placeholder names used anywhere in a definition. */
export function placeholdersIn(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === "string") for (const [, name] of value.matchAll(PLACEHOLDER_RE)) out.add(name);
  else if (Array.isArray(value)) value.forEach((v) => placeholdersIn(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      placeholdersIn(k, out);
      placeholdersIn(v, out);
    }
  }
  return out;
}

const typeOf = (t: string | AnyQuestionType) => (typeof t === "string" ? getQuestionType(t) : t);

/** The type's definition for these wording values, parsed. Throws on a malformed definition. */
export function resolveDef(type: string | AnyQuestionType, raw: unknown, values: Readonly<Record<string, string>> = {}): unknown {
  const t = typeOf(type);
  const { def } = splitDef(raw);
  return t.defSchema.parse(Object.keys(values).length ? substitute(def, values) : def);
}

/**
 * Stored definition + seeded RNG -> instance. The only generation path: the
 * attempt builder, regrade, reproduce, preview, pre-flight and variants all
 * come through here, so wording variants behave the same everywhere.
 */
export function generateQuestion(type: string | AnyQuestionType, raw: unknown, rng: Rng): GenerateResult<unknown> {
  const t = typeOf(type);
  const { def, textVars } = splitDef(raw);
  if (!textVars) return t.generate(t.defSchema.parse(def), rng);
  const values = drawTextVars(textVars, rng);
  const result = t.generate(t.defSchema.parse(substitute(def, values)), rng);
  return { instance: result.instance, vars: { ...values, ...result.vars } };
}

/**
 * Pre-flight for a stored definition: the wording block itself, then the
 * type's own checks, run against several wording rows so a row that breaks
 * the question (an empty answer, a clash) is caught before students see it.
 */
export function validateQuestion(type: string | AnyQuestionType, raw: unknown): PreflightIssue[] {
  const t = typeOf(type);
  const { def, textVars } = splitDef(raw);
  const parsed = t.defSchema.safeParse(def);
  if (!parsed.success) return [{ severity: "blocking", code: "malformed", message: "The question is incomplete." }];
  const used = placeholdersIn(def);

  if (!textVars) {
    const issues = t.validateDef(parsed.data);
    if (used.size) {
      issues.push({
        severity: "blocking",
        code: "text-vars.undefined",
        message: `The question uses ${[...used].map((n) => `[[${n}]]`).join(", ")}, but no wording variants are defined.`,
      });
    }
    return issues;
  }

  const issues: PreflightIssue[] = [];
  const block = (code: string, message: string) => issues.push({ severity: "blocking", code, message, path: TEXT_VARS_KEY });
  const names = textVarNames(textVars);
  for (const n of names) if (!NAME_RE.test(n)) block("text-vars.bad-name", `“${n}” isn't a valid name. Use letters, digits and underscores, starting with a letter.`);
  if (new Set(names).size !== names.length) block("text-vars.duplicate-name", "Two wording variables share a name.");
  const cols = names.slice(0, names.length - textVars.lists.length);
  textVars.table.forEach((row, i) => {
    const missing = cols.filter((c) => !(c in row) || !row[c].trim());
    if (missing.length) block("text-vars.incomplete-row", `Row ${i + 1} has no value for ${missing.join(", ")}.`);
  });
  for (const l of textVars.lists) if (l.options.filter((o) => o.trim()).length === 0) block("text-vars.empty-list", `“${l.name}” has no options.`);
  const values = [...textVars.table.flatMap((r) => Object.values(r)), ...textVars.lists.flatMap((l) => l.options)];
  if (values.some((v) => FORBIDDEN_IN_VALUE.test(v))) block("text-vars.syntax-in-value", "A wording value contains [[ ]] or {{ }}; values must be plain text.");
  for (const n of used) if (!names.includes(n)) block("text-vars.undefined", `The question uses [[${n}]], but no wording variable has that name.`);
  for (const n of names) {
    if (!used.has(n)) issues.push({ severity: "warning", code: "text-vars.unused", message: `The wording variable “${n}” isn't used anywhere in the question.`, path: TEXT_VARS_KEY });
  }
  if (issues.some((i) => i.severity === "blocking")) return issues;

  // The type's own checks, once per distinct wording (bounded), deduplicated.
  const seen = new Map<string, PreflightIssue>();
  for (const values of wordings(textVars).slice(0, MAX_VALIDATED)) {
    const sub = t.defSchema.safeParse(substitute(def, values));
    const found = sub.success ? t.validateDef(sub.data) : [{ severity: "blocking" as const, code: "malformed", message: "The question is incomplete." }];
    for (const issue of found) {
      const key = `${issue.code}|${issue.message}`;
      if (seen.has(key)) continue;
      const label = Object.entries(values).map(([k, v]) => `${k} = “${v}”`).join(", ");
      seen.set(key, wordingCount(textVars) > 1 && label ? { ...issue, message: `${issue.message} (with ${label})` } : issue);
    }
  }
  return [...issues, ...seen.values()];
}

function wordingCount(tv: TextVars) {
  return Math.max(1, tv.table.length) * tv.lists.reduce((n, l) => n * Math.max(1, l.options.length), 1);
}

/** Each table row with each list's first option, then each list option with the first row. */
function wordings(tv: TextVars): Record<string, string>[] {
  const lists = tv.lists.map((l) => ({ name: l.name, options: l.options.filter((o) => o.trim()) }));
  const first = Object.fromEntries(lists.filter((l) => l.options.length).map((l) => [l.name, l.options[0]]));
  const rows = tv.table.length ? tv.table : [{}];
  const out: Record<string, string>[] = rows.map((r) => ({ ...r, ...first }));
  for (const l of lists) for (const o of l.options.slice(1)) out.push({ ...rows[0], ...first, [l.name]: o });
  return out;
}
