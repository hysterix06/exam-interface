// What an uploaded file really is, from its first bytes (never trust the
// browser's MIME type or the extension), plus an image's width and height
// from its header. Pure, dependency-free, total: unknown or broken input
// returns null. SVG is never accepted: it can carry script.

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** Larger images are refused; diagrams never need more. */
const MAX_DIMENSION = 10_000;

export type Sniffed =
  | { kind: "image"; mime: "image/png" | "image/jpeg" | "image/webp"; width: number; height: number }
  | { kind: "workbook"; mime: typeof XLSX_MIME };

const be16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const be32 = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const le16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const le24 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const starts = (b: Uint8Array, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);

function image(mime: "image/png" | "image/jpeg" | "image/webp", width: number, height: number): Sniffed | null {
  if (!(width > 0 && height > 0 && width <= MAX_DIMENSION && height <= MAX_DIMENSION)) return null;
  return { kind: "image", mime, width, height };
}

function jpegSize(b: Uint8Array): Sniffed | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    const len = be16(b, i + 2);
    if (len < 2) return null;
    // Start-of-frame markers (baseline, progressive, ...), not DHT/JPG/DAC.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return image("image/jpeg", be16(b, i + 7), be16(b, i + 5));
    }
    i += 2 + len;
  }
  return null;
}

function webpSize(b: Uint8Array): Sniffed | null {
  if (b.length < 30) return null;
  const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
  if (chunk === "VP8X") return image("image/webp", le24(b, 24) + 1, le24(b, 27) + 1);
  if (chunk === "VP8 ") return image("image/webp", le16(b, 26) & 0x3fff, le16(b, 28) & 0x3fff);
  if (chunk === "VP8L" && b[20] === 0x2f) {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return image("image/webp", (bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
  }
  return null;
}

export function sniffFile(b: Uint8Array): Sniffed | null {
  if (b.length >= 24 && starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) && starts(b, [0x49, 0x48, 0x44, 0x52], 12)) {
    return image("image/png", be32(b, 16), be32(b, 20));
  }
  if (b.length >= 4 && starts(b, [0xff, 0xd8, 0xff])) return jpegSize(b);
  if (b.length >= 12 && starts(b, [0x52, 0x49, 0x46, 0x46]) && starts(b, [0x57, 0x45, 0x42, 0x50], 8)) return webpSize(b);
  // .xlsx is a zip; the parser checks it really is a workbook.
  if (b.length >= 4 && starts(b, [0x50, 0x4b, 0x03, 0x04])) return { kind: "workbook", mime: XLSX_MIME };
  return null;
}
