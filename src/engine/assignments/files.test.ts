import { describe, expect, it } from "vitest";
import { sniffSubmission } from "./files";

/** A minimal stored zip with empty entries: enough for the central directory walk. */
function zip(names: string[], comment = ""): Uint8Array {
  const enc = new TextEncoder();
  const parts: number[] = [];
  const central: number[] = [];
  const u16 = (a: number[], n: number) => a.push(n & 0xff, (n >> 8) & 0xff);
  const u32 = (a: number[], n: number) => a.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff);
  for (const name of names) {
    const nb = [...enc.encode(name)];
    const offset = parts.length;
    u32(parts, 0x04034b50); for (let i = 0; i < 22; i++) parts.push(0); u16(parts, nb.length); u16(parts, 0); parts.push(...nb);
    u32(central, 0x02014b50); for (let i = 0; i < 24; i++) central.push(0); u16(central, nb.length); u16(central, 0); u16(central, 0);
    for (let i = 0; i < 8; i++) central.push(0); u32(central, offset); central.push(...nb);
  }
  const cdOffset = parts.length;
  const out = [...parts, ...central];
  const cb = [...enc.encode(comment)];
  u32(out, 0x06054b50); u16(out, 0); u16(out, 0); u16(out, names.length); u16(out, names.length);
  u32(out, central.length); u32(out, cdOffset); u16(out, cb.length); out.push(...cb);
  return Uint8Array.from(out);
}

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 10, 0, 0, 0, 20]);

describe("sniffSubmission", () => {
  it("knows PDFs, images and plain text by their bytes", () => {
    expect(sniffSubmission(new TextEncoder().encode("%PDF-1.7\n..."))).toMatchObject({ kind: "pdf", ext: "pdf" });
    expect(sniffSubmission(PNG)).toMatchObject({ kind: "image", mime: "image/png", ext: "png" });
    expect(sniffSubmission(new TextEncoder().encode("My essay — about cells.\n"))).toMatchObject({ kind: "text", mime: "text/plain", ext: "txt" });
  });
  it("tells Word files from workbooks by what's inside the zip", () => {
    expect(sniffSubmission(zip(["[Content_Types].xml", "word/document.xml"]))).toMatchObject({ kind: "docx", ext: "docx" });
    expect(sniffSubmission(zip(["[Content_Types].xml", "xl/workbook.xml"], "hi"))).toMatchObject({ kind: "workbook", ext: "xlsx" });
    expect(sniffSubmission(zip(["notes.txt"]))).toBeNull();
  });
  it("refuses binaries, SVG and broken input", () => {
    expect(sniffSubmission(new Uint8Array())).toBeNull();
    expect(sniffSubmission(Uint8Array.from([0x4d, 0x5a, 0, 0x90, 0]))).toBeNull(); // exe
    expect(sniffSubmission(Uint8Array.from([0xff, 0xfe, 0xfd]))).toBeNull(); // not UTF-8
    expect(sniffSubmission(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'))).toBeNull();
    expect(sniffSubmission(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]))).toBeNull(); // truncated zip
  });
});
