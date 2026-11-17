import type { BlankSpec } from "../cloze";
import { fmtNum, quote } from "./format";
import { describeTolerance, parseNumberWithUnit, withinTolerance, wrongNumber } from "./numeric";
import { matchAccepted, WRONG_TEXT } from "./text";

export type Blank = BlankSpec & { id: string };

const TEXT_OPTS = { caseSensitive: false, collapseWhitespace: true };

/** What the key says, in words. */
export function expectedOf(b: BlankSpec) {
  if (b.kind === "text") return b.accepted.map(quote).join(" or ");
  if (b.kind === "num") return `${fmtNum(b.value)}, ${describeTolerance({ abs: b.abs || undefined, rel: b.rel || undefined })}`;
  if (b.kind === "chip") return quote(b.answer);
  return b.correct;
}

/** The answer a perfect student types or picks. */
export function keyOfBlank(b: BlankSpec) {
  return b.kind === "text" ? b.accepted[0] : b.kind === "num" ? String(b.value) : b.kind === "chip" ? b.answer : b.correct;
}

/** Check one non-empty answer against one blank. */
export function checkBlank(b: BlankSpec, got: string): { ok: boolean; note?: string } {
  if (b.kind === "text") return { ok: matchAccepted(got, b.accepted, TEXT_OPTS) !== null };
  if (b.kind === "select") return { ok: got === b.correct };
  if (b.kind === "chip") return { ok: got === b.answer };
  const parsed = parseNumberWithUnit(got);
  if (!parsed || parsed.unit) return { ok: false, note: "Not a plain number." };
  const ok = withinTolerance(b.value, parsed.value, { abs: b.abs || undefined, rel: b.rel || undefined });
  return { ok, note: `Off by ${fmtNum(Math.abs(parsed.value - b.value))}.` };
}

/** An answer the blank marks wrong; "" (unanswered) when no wrong option exists. */
export function wrongOfBlank(b: BlankSpec): string {
  if (b.kind === "text") return WRONG_TEXT;
  if (b.kind === "num") return fmtNum(wrongNumber(b.value, { abs: b.abs || undefined, rel: b.rel || undefined }));
  if (b.kind === "chip") return WRONG_TEXT;
  return b.options.find((o) => o !== b.correct) ?? "";
}
