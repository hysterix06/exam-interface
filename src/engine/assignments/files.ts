import { sniffFile } from "../image-size";
import type { SubmissionFileKind } from "./settings";

// What a handed-in file really is, from its bytes. Extends sniffFile() (which
// treats every zip as a workbook, for the file-task type) by looking inside
// zips, and by accepting PDFs and plain UTF-8 text. SVG and HTML are refused
// even though they are text: they can carry script.

export interface SniffedSubmission {
  kind: SubmissionFileKind;
  mime: string;
  ext: string;
}

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/** Entry names from a zip's central directory, or null if it isn't a readable zip. */
function zipNames(b: Uint8Array): string[] | null {
  const min = Math.max(0, b.length - 22 - 0xffff);
  for (let e = b.length - 22; e >= min; e--) {
    if (u32(b, e) !== 0x06054b50) continue;
    const count = u16(b, e + 10);
    let p = u32(b, e + 16);
    const names: string[] = [];
    const dec = new TextDecoder();
    for (let i = 0; i < count; i++) {
      if (p + 46 > b.length || u32(b, p) !== 0x02014b50) return null;
      const n = u16(b, p + 28);
      const extra = u16(b, p + 30);
      const comment = u16(b, p + 32);
      if (p + 46 + n > b.length) return null;
      names.push(dec.decode(b.subarray(p + 46, p + 46 + n)));
      p += 46 + n + extra + comment;
    }
    return names;
  }
  return null;
}

function plainText(b: Uint8Array): boolean {
  if (b.length === 0 || b.includes(0)) return false;
  let s: string;
  try {
    s = new TextDecoder("utf-8", { fatal: true }).decode(b.subarray(0, 64 * 1024));
  } catch {
    // A multi-byte character cut at the 64 KB mark is fine; anything else isn't.
    if (b.length <= 64 * 1024) return false;
    try { s = new TextDecoder("utf-8", { fatal: true }).decode(b.subarray(0, 64 * 1024 - 4)); } catch { return false; }
  }
  const head = s.trimStart().slice(0, 512).toLowerCase();
  return !/^<(\?xml|!doctype|svg|html)/.test(head) && !head.includes("<svg") && !head.includes("<script");
}

export function sniffSubmission(b: Uint8Array): SniffedSubmission | null {
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) {
    return { kind: "pdf", mime: "application/pdf", ext: "pdf" };
  }
  const known = sniffFile(b);
  if (known?.kind === "image") return { kind: "image", mime: known.mime, ext: known.mime.slice(6).replace("jpeg", "jpg") };
  if (known?.kind === "workbook") {
    const names = zipNames(b);
    if (names?.some((n) => n.startsWith("word/"))) return { kind: "docx", mime: DOCX, ext: "docx" };
    if (names?.some((n) => n.startsWith("xl/"))) return { kind: "workbook", mime: XLSX, ext: "xlsx" };
    return null;
  }
  return plainText(b) ? { kind: "text", mime: "text/plain", ext: "txt" } : null;
}
