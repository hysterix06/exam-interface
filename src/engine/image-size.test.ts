import { describe, expect, it } from "vitest";
import { sniffFile } from "./image-size";

const bytes = (...xs: number[]) => new Uint8Array(xs);
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n: number) => [(n >>> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >>> 8) & 255];
const le24 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255];

const png = (w: number, h: number) => bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0);
const jpeg = (w: number, h: number) =>
  bytes(0xff, 0xd8, 0xff, 0xe0, ...be16(16), ...new Array(14).fill(0), 0xff, 0xc0, ...be16(17), 8, ...be16(h), ...be16(w), 3, ...new Array(9).fill(0));
const webpVp8x = (w: number, h: number) =>
  bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, ...le16(10), 0, 0, 0, 0, 0, 0, ...le24(w - 1), ...le24(h - 1));

describe("sniffFile", () => {
  it("reads PNG, JPEG and WebP dimensions from the header", () => {
    expect(sniffFile(png(640, 480))).toEqual({ kind: "image", mime: "image/png", width: 640, height: 480 });
    expect(sniffFile(jpeg(1024, 768))).toEqual({ kind: "image", mime: "image/jpeg", width: 1024, height: 768 });
    expect(sniffFile(webpVp8x(300, 200))).toEqual({ kind: "image", mime: "image/webp", width: 300, height: 200 });
  });

  it("recognises .xlsx (a zip) and rejects everything else, SVG included", () => {
    expect(sniffFile(bytes(0x50, 0x4b, 0x03, 0x04, 0, 0))).toEqual({ kind: "workbook", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    expect(sniffFile(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffFile(bytes(1, 2, 3))).toBeNull();
    expect(sniffFile(bytes())).toBeNull();
  });

  it("rejects truncated or absurd images", () => {
    expect(sniffFile(png(640, 480).slice(0, 20))).toBeNull();
    expect(sniffFile(png(0, 480))).toBeNull();
    expect(sniffFile(png(100_000, 10))).toBeNull();
    expect(sniffFile(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 2))).toBeNull();
  });
});
