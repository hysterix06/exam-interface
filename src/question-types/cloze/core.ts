import { z } from "zod";
import { checkBlank, expectedOf, keyOfBlank } from "@/engine/grading/blanks";
import { fmtNum, quote, roundScore } from "@/engine/grading/format";
import { parseCloze } from "@/engine/cloze";
import { defineQuestionType } from "@/engine/question-type";
import type { GradeLine, PreflightIssue } from "@/engine/types";

const defSchema = z.object({ template: z.string() });

const blankSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), id: z.string(), accepted: z.array(z.string()) }),
  z.object({ kind: z.literal("num"), id: z.string(), value: z.number(), abs: z.number(), rel: z.number() }),
  z.object({ kind: z.literal("select"), id: z.string(), options: z.array(z.string()), correct: z.string() }),
]);
const segmentSchema = z.union([z.object({ kind: z.literal("lit"), text: z.string() }), blankSchema]);

const instanceSchema = z.object({ segments: z.array(segmentSchema) });
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
    const { segments } = parseCloze(def.template);
    return {
      instance: {
        segments: segments.map((s) => (s.kind === "select" ? { ...s, options: rng.shuffle(s.options) } : s)) as ClozeInstance["segments"],
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
          if (b.kind === "num") return [b.id, fmtNum(b.value + rng.int(1, 9))];
          return [b.id, `guess ${rng.int(1, 999)}`];
        }),
      ),
    };
  },

  validateDef(def) {
    const { errors } = parseCloze(def.template);
    const issues: PreflightIssue[] = errors.map((message, i) => ({
      severity: "blocking",
      code: "cloze.syntax",
      message,
      path: `template#${i}`,
    }));
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
    };
  },
});
