import { z } from "zod";
import { checkBlank, expectedOf, keyOfBlank, wrongOfBlank } from "@/engine/grading/blanks";
import { fmtNum, quote, roundScore } from "@/engine/grading/format";
import { parseCloze } from "@/engine/cloze";
import { defineQuestionType } from "@/engine/question-type";
import type { GradeLine, PreflightIssue } from "@/engine/types";

const defSchema = z.object({
  template: z.string(),
  /** Wrong chips added to the bank so the last chip isn't a giveaway. Only with {{chip:…}} blanks. */
  extraChips: z.array(z.string()).optional(),
});

const blankSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), id: z.string(), accepted: z.array(z.string()) }),
  z.object({ kind: z.literal("num"), id: z.string(), value: z.number(), abs: z.number(), rel: z.number() }),
  z.object({ kind: z.literal("select"), id: z.string(), options: z.array(z.string()), correct: z.string() }),
  z.object({ kind: z.literal("chip"), id: z.string(), answer: z.string() }),
]);
const segmentSchema = z.union([z.object({ kind: z.literal("lit"), text: z.string() }), blankSchema]);

const instanceSchema = z.object({
  segments: z.array(segmentSchema),
  /** The shuffled chip bank: every chip answer plus the extras. Absent when there are no chip blanks. */
  chips: z.array(z.string()).optional(),
});
const responseSchema = z.object({ blanks: z.record(z.string(), z.string()) });

export type ClozeDef = z.infer<typeof defSchema>;
export type ClozeInstance = z.infer<typeof instanceSchema>;
export type ClozeResponse = z.infer<typeof responseSchema>;
type Blank = z.infer<typeof blankSchema>;

const blanksOf = (inst: ClozeInstance) => inst.segments.filter((s): s is Blank => s.kind !== "lit");
export const cloze = defineQuestionType<ClozeDef, ClozeInstance, ClozeResponse>({
  id: "cloze",
  label: "Fill in the blanks",
  defSchema,
  instanceSchema,
  responseSchema,

  generate(def, rng) {
    const { segments } = parseCloze(def.template, { allowChips: true });
    const answers = segments.flatMap((s) => (s.kind === "chip" ? [s.answer] : []));
    const bank = [...answers, ...(answers.length ? (def.extraChips ?? []).map((c) => c.trim()).filter(Boolean) : [])];
    return {
      instance: {
        segments: segments.map((s) => (s.kind === "select" ? { ...s, options: rng.shuffle(s.options) } : s)) as ClozeInstance["segments"],
        // Its own fork, and only when used: questions without chips generate exactly as before.
        ...(bank.length ? { chips: rng.fork("chips").shuffle(bank) } : {}),
      },
      vars: {},
    };
  },

  grade(inst, response, { points }) {
    const blanks = blanksOf(inst);
    const share = points / blanks.length;
    const given = response?.blanks ?? {};
    const answered = blanks.some((b) => (given[b.id] ?? "").trim() !== "");

    const lines = blanks.map((b, i): GradeLine => {
      const label = `Blank ${i + 1}`;
      const got = (given[b.id] ?? "").trim();
      if (!answered || got === "") {
        return { label, expected: expectedOf(b), got: "no answer", verdict: "unanswered", points: 0, max: share };
      }
      const { ok, note } = checkBlank(b, got);
      return { label, expected: expectedOf(b), got: quote(got), verdict: ok ? "correct" : "wrong", points: ok ? share : 0, max: share, note };
    });
    return { score: roundScore(lines.reduce((s, l) => s + l.points, 0)), max: points, needsReview: false, lines };
  },

  keyResponse: (inst) => ({ blanks: Object.fromEntries(blanksOf(inst).map((b) => [b.id, keyOfBlank(b)])) }),

  randomResponse(inst, rng) {
    return {
      blanks: Object.fromEntries(
        blanksOf(inst).map((b) => {
          if (rng.next() < 0.33) return [b.id, keyOfBlank(b)];
          if (b.kind === "select") return [b.id, rng.pick(b.options)];
          if (b.kind === "chip") return [b.id, rng.pick(inst.chips ?? [b.answer])];
          if (b.kind === "num") return [b.id, fmtNum(b.value + rng.int(1, 9))];
          return [b.id, `guess ${rng.int(1, 999)}`];
        }),
      ),
    };
  },

  wrongResponse: (inst) => ({
    blanks: Object.fromEntries(
      blanksOf(inst).map((b) => [b.id, b.kind === "chip" ? ((inst.chips ?? []).find((c) => c !== b.answer) ?? wrongOfBlank(b)) : wrongOfBlank(b)]),
    ),
  }),

  estimateSeconds: (def) => 15 + 25 * parseCloze(def.template, { allowChips: true }).blanks.length,

  // Only blanks with a fixed set of answers (dropdowns, chips); typed text is too varied to tabulate.
  analysisTokens: (inst, r) =>
    blanksOf(inst).flatMap((b) => ((b.kind === "select" || b.kind === "chip") && r.blanks[b.id] ? [`${b.id}=${r.blanks[b.id]}`] : [])),
  tokenUniverse(inst) {
    const blanks = blanksOf(inst);
    const n = (id: string) => blanks.findIndex((b) => b.id === id) + 1;
    const fixed = blanks.flatMap((b): { id: string; choices: string[]; key: string }[] =>
      b.kind === "select" ? [{ id: b.id, choices: b.options, key: b.correct }] : b.kind === "chip" ? [{ id: b.id, choices: inst.chips ?? [], key: b.answer }] : [],
    );
    return {
      tokens: fixed.flatMap(({ id, choices }) => [...new Set(choices)].map((c) => ({ id: `${id}=${c}`, text: `Blank ${n(id)}: ${c}` }))),
      key: fixed.map(({ id, key }) => `${id}=${key}`),
      options: true,
    };
  },

  validateDef(def) {
    const { errors, blanks } = parseCloze(def.template, { allowChips: true });
    const issues: PreflightIssue[] = errors.map((message, i) => ({
      severity: "blocking",
      code: "cloze.syntax",
      message,
      path: `template#${i}`,
    }));
    const chipAnswers = blanks.flatMap((b) => (b.kind === "chip" ? [b.answer] : []));
    const extras = (def.extraChips ?? []).map((c) => c.trim()).filter(Boolean);
    if (extras.length && chipAnswers.length === 0) {
      issues.push({ severity: "warning", code: "cloze.extra-chips-unused", message: "There are extra chips but no {{chip:…}} blanks, so students never see them.", path: "extraChips" });
    }
    const clash = extras.filter((e) => chipAnswers.includes(e));
    if (clash.length) {
      issues.push({
        severity: "warning",
        code: "cloze.extra-chip-is-answer",
        message: `${clash.map(quote).join(", ")} is both an extra chip and a correct answer, so the bank shows it twice.`,
        path: "extraChips",
      });
    }
    if (def.template.replace(/\{\{[\s\S]*?\}\}/g, "").trim() === "" && errors.length === 0) {
      issues.push({ severity: "warning", code: "cloze.no-context", message: "There is no sentence around the blanks to give them context.", path: "template" });
    }
    return issues;
  },

  redact(inst) {
    return {
      segments: inst.segments.map((s) => {
        if (s.kind === "lit") return s;
        return s.kind === "select" ? { kind: "select", id: s.id, options: s.options } : { kind: s.kind, id: s.id };
      }),
      ...(inst.chips ? { chips: inst.chips } : {}),
    };
  },
});
