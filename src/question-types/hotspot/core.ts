import { z } from "zod";
import { assetRefSchema, checkAssetRef } from "@/engine/asset";
import { interiorPoint, pointInShape, shapeSchema } from "@/engine/geometry";
import { fmtPoints, orList, quote, roundScore, sumPoints } from "@/engine/grading/format";
import { defineQuestionType } from "@/engine/question-type";
import type { GradeLine, PreflightIssue } from "@/engine/types";

// Click the right place on an image. Regions are rectangles, circles or
// polygons in 0–1 coordinates; they never reach the student.

const regionSchema = z.object({ id: z.string().min(1), label: z.string(), shape: shapeSchema, correct: z.boolean() });
const defSchema = z.object({
  stem: z.string(),
  image: assetRefSchema.nullable(),
  regions: z.array(regionSchema),
  /** Students mark every correct region (one click each) instead of one. */
  multiple: z.boolean().default(false),
  /** Fraction of a share lost per wrong click. */
  penalty: z.number().min(0).max(1).default(0),
});
const instanceSchema = defSchema.extend({ multiple: z.boolean(), penalty: z.number() });
const pointSchema = z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) });
const responseSchema = z.object({ points: z.array(pointSchema).max(20) });

export type HotspotDef = z.infer<typeof defSchema>;
export type HotspotInstance = z.infer<typeof instanceSchema>;
export type HotspotResponse = z.infer<typeof responseSchema>;
type P = z.infer<typeof pointSchema>;

const correctRegions = (inst: HotspotInstance) => inst.regions.filter((r) => r.correct);
const regionsAt = (inst: HotspotInstance, p: P) => inst.regions.filter((r) => pointInShape(r.shape, p));
const describeClick = (inst: HotspotInstance, p: P) => {
  const hit = regionsAt(inst, p);
  return hit.length ? orList(hit.map((r) => quote(r.label))) : "outside every marked region";
};
const at = (p: P) => `(${Math.round(p.x * 100)}%, ${Math.round(p.y * 100)}%)`;

/** A spot outside every correct region, for the wrong-answer run; null if the correct regions cover everything. */
function outsidePoint(inst: HotspotInstance): P | null {
  for (let i = 1; i < 32; i++) for (let j = 1; j < 32; j++) {
    const p = { x: i / 32, y: j / 32 };
    if (!correctRegions(inst).some((r) => pointInShape(r.shape, p))) return p;
  }
  return null;
}

export const hotspot = defineQuestionType<HotspotDef, HotspotInstance, HotspotResponse>({
  id: "hotspot",
  label: "Hotspot (click on an image)",
  defSchema,
  instanceSchema,
  responseSchema,

  generate: (def) => ({ instance: { ...def }, vars: {} }),

  grade(inst, response, { points }) {
    const clicks = response?.points ?? [];
    const correct = correctRegions(inst);
    const expected = orList(correct.map((r) => quote(r.label)));

    if (!inst.multiple) {
      const click = clicks[0];
      if (!click) return { score: 0, max: points, needsReview: false, lines: [{ label: "Click", expected, got: "no answer", verdict: "unanswered", points: 0, max: points }] };
      const ok = correct.some((r) => pointInShape(r.shape, click));
      const line: GradeLine = {
        label: "Click",
        expected,
        got: describeClick(inst, click),
        verdict: ok ? "correct" : "wrong",
        points: ok ? points : roundScore(-inst.penalty * points),
        max: points,
        note: `Clicked at ${at(click)} of the image.${!ok && inst.penalty ? ` Wrong clicks lose ${fmtPoints(inst.penalty * points)}.` : ""}`,
      };
      return { score: line.points, max: points, needsReview: false, lines: [line] };
    }

    const share = points / Math.max(1, correct.length);
    if (clicks.length === 0) {
      return { score: 0, max: points, needsReview: false, lines: correct.map((r) => ({ label: r.label, expected: "clicked", got: "no answer", verdict: "unanswered" as const, points: 0, max: share })) };
    }
    const lines: GradeLine[] = correct.map((r) => {
      const hit = clicks.some((c) => pointInShape(r.shape, c));
      return { label: r.label, expected: "clicked", got: hit ? "clicked" : "missed", verdict: hit ? "correct" : "wrong", points: hit ? share : 0, max: share };
    });
    const stray = clicks.filter((c) => !correct.some((r) => pointInShape(r.shape, c)));
    stray.forEach((c, i) => {
      lines.push({
        label: `Extra click ${i + 1}`,
        expected: "no click here",
        got: describeClick(inst, c),
        verdict: "wrong",
        points: inst.penalty ? -inst.penalty * share : 0,
        max: 0,
        note: `At ${at(c)}.${inst.penalty ? ` Each wrong click loses ${fmtPoints(inst.penalty * share)}.` : ""}`,
      });
    });
    const raw = sumPoints(lines);
    if (raw < 0) lines.push({ label: "Minimum score", expected: "0 or more", got: fmtPoints(raw), verdict: "wrong", points: -raw, max: 0, note: "This question's score can't go below 0." });
    return { score: sumPoints(lines), max: points, needsReview: false, lines };
  },

  keyResponse(inst) {
    const correct = correctRegions(inst);
    return { points: (inst.multiple ? correct : correct.slice(0, 1)).map((r) => interiorPoint(r.shape)) };
  },

  randomResponse(inst, rng) {
    const n = inst.multiple ? rng.int(1, Math.max(1, correctRegions(inst).length)) : 1;
    return { points: Array.from({ length: n }, () => ({ x: rng.next(), y: rng.next() })) };
  },

  wrongResponse(inst) {
    const p = outsidePoint(inst);
    return p ? { points: [p] } : null;
  },

  estimateSeconds: (def) => 30 + 15 * Math.max(1, def.regions.filter((r) => r.correct).length),

  analysisTokens: (inst, r) => r.points.flatMap((p) => {
    const hit = regionsAt(inst, p);
    return hit.length ? hit.map((h) => h.id) : ["outside"];
  }),
  tokenUniverse: (inst) => ({
    tokens: [...inst.regions.map((r) => ({ id: r.id, text: r.label })), { id: "outside", text: "Outside every region" }],
    key: (inst.multiple ? correctRegions(inst) : correctRegions(inst).slice(0, 1)).map((r) => r.id),
  }),

  validateDef(def) {
    const issues: PreflightIssue[] = [...checkAssetRef(def.image, "hotspot", "image")];
    const block = (code: string, message: string, path?: string) => issues.push({ severity: "blocking", code, message, path });
    if (!def.stem.trim()) block("hotspot.empty-stem", "The question has no text.", "stem");
    if (def.regions.length === 0) block("hotspot.no-regions", "Draw at least one region on the image.", "regions");
    else if (!def.regions.some((r) => r.correct)) block("hotspot.no-correct", "Mark at least one region as correct.", "regions");
    def.regions.forEach((r, i) => {
      if (!r.label.trim()) block("hotspot.empty-label", `Region ${i + 1} needs a name, so the marking can say what was clicked.`, `regions[${i}].label`);
    });
    const ids = def.regions.map((r) => r.id);
    if (new Set(ids).size !== ids.length) block("hotspot.duplicate-id", "Two regions share the same id.", "regions");
    if (!def.multiple && def.regions.filter((r) => r.correct).length > 1) {
      issues.push({ severity: "warning", code: "hotspot.several-correct", message: "Several regions are correct but students click once: a click on any of them earns full marks.", path: "regions" });
    }
    if (def.regions.some((r) => r.correct) && !outsidePoint({ ...def })) {
      issues.push({ severity: "warning", code: "hotspot.covers-everything", message: "The correct regions cover the whole image, so every click is right.", path: "regions" });
    }
    return issues;
  },

  redact: ({ stem, image, multiple }) => ({ stem, image, multiple }),
});
