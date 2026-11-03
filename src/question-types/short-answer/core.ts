import { z } from "zod";
import { fmtNum, orList, quote, roundScore } from "@/engine/grading/format";
import {
  describeTolerance,
  parseNumberWithUnit,
  withinTolerance,
} from "@/engine/grading/numeric";
import { compileRegex, matchAccepted, matchRegex, normalizeText } from "@/engine/grading/text";
import { defineQuestionType } from "@/engine/question-type";
import type { GradeLine, PreflightIssue } from "@/engine/types";

const textMatch = z.object({
  kind: z.literal("text"),
  accepted: z.array(z.string()),
  caseSensitive: z.boolean().default(false),
  collapseWhitespace: z.boolean().default(true),
});

const regexMatch = z.object({
  kind: z.literal("regex"),
  pattern: z.string(),
  caseSensitive: z.boolean().default(false),
  /** A sample correct answer: shown as the key and used by pre-flight. */
  example: z.string(),
});

const numericMatch = z.object({
  kind: z.literal("numeric"),
  value: z.number(),
  tolerance: z
    .object({ abs: z.number().min(0).optional(), rel: z.number().min(0).optional() })
    .default({}),
  /** If set, the answer must carry one of these units (compared case-sensitively). */
  units: z.array(z.string()).optional(),
});

const matchSchema = z.discriminatedUnion("kind", [textMatch, regexMatch, numericMatch]);

const defSchema = z.object({
  stem: z.string(),
  match: matchSchema,
});

const instanceSchema = z.object({
  stem: z.string(),
  match: matchSchema,
});

const responseSchema = z.object({ text: z.string() });

export type ShortAnswerDef = z.infer<typeof defSchema>;
export type ShortAnswerInstance = z.infer<typeof instanceSchema>;
export type ShortAnswerResponse = z.infer<typeof responseSchema>;
type Match = z.infer<typeof matchSchema>;

function expectedText(m: Match) {
  switch (m.kind) {
    case "text":
      return orList(m.accepted.map(quote));
    case "regex":
      return `${quote(m.example)} (pattern ${m.pattern})`;
    case "numeric": {
      const unit = m.units?.length ? ` ${orList(m.units)}` : "";
      return `${fmtNum(m.value)}${unit}, ${describeTolerance(m.tolerance)}`;
    }
  }
}

function keyResponse(inst: ShortAnswerInstance): ShortAnswerResponse {
  const m = inst.match;
  if (m.kind === "text") return { text: m.accepted[0] ?? "" };
  if (m.kind === "regex") return { text: m.example };
  return { text: `${m.value}${m.units?.length ? ` ${m.units[0]}` : ""}` };
}

function line(points: number, max: number, partial: Omit<GradeLine, "label" | "max" | "points">): GradeLine {
  return { label: "Answer", max, points: roundScore(points), ...partial };
}

export const shortAnswer = defineQuestionType<ShortAnswerDef, ShortAnswerInstance, ShortAnswerResponse>({
  id: "short-answer",
  label: "Short answer",
  defSchema,
  instanceSchema,
  responseSchema,

  generate(def) {
    return { instance: { stem: def.stem, match: def.match }, vars: {} };
  },

  grade(inst, response, { points }) {
    const m = inst.match;
    const expected = expectedText(m);
    const got = response?.text ?? "";
    const done = (l: GradeLine) => ({ score: l.points, max: points, needsReview: false, lines: [l] });

    if (!got.trim()) {
      return done(line(0, points, { expected, got: "no answer", verdict: "unanswered" }));
    }

    if (m.kind === "text") {
      const hit = matchAccepted(got, m.accepted, m);
      const how = [
        m.caseSensitive ? "case-sensitive" : "ignoring case",
        m.collapseWhitespace ? "ignoring extra spaces" : null,
      ]
        .filter(Boolean)
        .join(", ");
      return done(
        line(hit !== null ? points : 0, points, {
          expected,
          got: quote(got),
          verdict: hit !== null ? "correct" : "wrong",
          note: hit !== null ? `Matches ${quote(hit)} (${how}).` : `Compared ${how}.`,
        }),
      );
    }

    if (m.kind === "regex") {
      const ok = matchRegex(got, m.pattern, m.caseSensitive);
      return done(
        line(ok ? points : 0, points, {
          expected,
          got: quote(got),
          verdict: ok ? "correct" : "wrong",
          note: ok ? "Matches the accepted pattern." : "Does not match the accepted pattern.",
        }),
      );
    }

    const parsed = parseNumberWithUnit(got);
    if (!parsed) {
      return done(
        line(0, points, { expected, got: quote(got), verdict: "wrong", note: "Not a number." }),
      );
    }
    if (m.units?.length && !m.units.includes(parsed.unit)) {
      return done(
        line(0, points, {
          expected,
          got: quote(got),
          verdict: "wrong",
          note: parsed.unit
            ? `Unit ${quote(parsed.unit)} is not accepted.`
            : "The answer needs a unit.",
        }),
      );
    }
    const ok = withinTolerance(m.value, parsed.value, m.tolerance);
    const diff = fmtNum(Math.abs(parsed.value - m.value));
    return done(
      line(ok ? points : 0, points, {
        expected,
        got: quote(got),
        verdict: ok ? "correct" : "wrong",
        note: `Off by ${diff}; accepted ${describeTolerance(m.tolerance)}.`,
      }),
    );
  },

  keyResponse,

  randomResponse(inst, rng) {
    // Simulated students are right about a third of the time.
    if (rng.next() < 0.33) return keyResponse(inst);
    const m = inst.match;
    if (m.kind === "numeric") {
      const unit = m.units?.length ? ` ${m.units[0]}` : "";
      return { text: `${fmtNum(m.value * rng.float(0.5, 1.5) + 1)}${unit}` };
    }
    return { text: `guess ${rng.int(1, 999)}` };
  },

  validateDef(def) {
    const issues: PreflightIssue[] = [];
    const m = def.match;
    if (!def.stem.trim()) {
      issues.push({ severity: "blocking", code: "short-answer.empty-stem", message: "The question has no text.", path: "stem" });
    }
    if (m.kind === "text") {
      const accepted = m.accepted.filter((a) => a.trim());
      if (accepted.length === 0) {
        issues.push({ severity: "blocking", code: "short-answer.no-accepted", message: "Add at least one accepted answer.", path: "match.accepted" });
      }
      const normalized = accepted.map((a) => normalizeText(a, m));
      if (new Set(normalized).size !== normalized.length) {
        issues.push({
          severity: "warning",
          code: "short-answer.duplicate-accepted",
          message: "Some accepted answers are the same once case and spacing are ignored.",
          path: "match.accepted",
        });
      }
    }
    if (m.kind === "regex") {
      if (compileRegex(m.pattern, m.caseSensitive) === null) {
        issues.push({ severity: "blocking", code: "short-answer.invalid-regex", message: "The pattern is not a valid regular expression.", path: "match.pattern" });
      } else if (!matchRegex(m.example, m.pattern, m.caseSensitive)) {
        issues.push({
          severity: "blocking",
          code: "short-answer.example-fails",
          message: `The sample answer ${quote(m.example)} does not match the pattern, so no one could get this right.`,
          path: "match.example",
        });
      }
    }
    if (m.kind === "numeric" && m.units?.some((u) => !u.trim())) {
      issues.push({ severity: "blocking", code: "short-answer.empty-unit", message: "One of the accepted units is blank.", path: "match.units" });
    }
    return issues;
  },

  redact({ match: _match, ...rest }) {
    return rest;
  },
});
