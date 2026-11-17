// Seed images, drawn in code so the repo holds no binary files: a minimal PNG
// encoder (zlib from Node) and a few raster shapes. Coordinates match the
// regions and pins in field-content.ts (which use 0–1 fractions of 800×600).
import { deflateSync } from "node:zlib";
import ExcelJS from "exceljs";

const W = 800;
const H = 600;

type RGB = [number, number, number];
const INK: RGB = [40, 40, 40];
const SOFT: RGB = [205, 205, 205];
const PALE: RGB = [238, 238, 238];

class Canvas {
  px = new Uint8Array(W * H * 3).fill(255);
  set(x: number, y: number, c: RGB) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (Math.round(y) * W + Math.round(x)) * 3;
    this.px[i] = c[0];
    this.px[i + 1] = c[1];
    this.px[i + 2] = c[2];
  }
  /** An ellipse at (cx, cy) with radii rx, ry: filled, and/or outlined `line` px thick. */
  ellipse(cx: number, cy: number, rx: number, ry: number, opts: { fill?: RGB; stroke?: RGB; line?: number }) {
    const line = opts.line ?? 3;
    for (let y = Math.floor(cy - ry - line); y <= cy + ry + line; y++) {
      for (let x = Math.floor(cx - rx - line); x <= cx + rx + line; x++) {
        const d = Math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2);
        if (opts.stroke && Math.abs(d - 1) * Math.min(rx, ry) <= line / 2) this.set(x, y, opts.stroke);
        else if (opts.fill && d < 1) this.set(x, y, opts.fill);
      }
    }
  }
  rect(x: number, y: number, w: number, h: number, c: RGB) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c);
  }
  png(): Uint8Array {
    const raw = new Uint8Array(H * (W * 3 + 1));
    for (let y = 0; y < H; y++) {
      raw[y * (W * 3 + 1)] = 0; // no filter
      raw.set(this.px.subarray(y * W * 3, (y + 1) * W * 3), y * (W * 3 + 1) + 1);
    }
    const ihdr = new Uint8Array(13);
    const v = new DataView(ihdr.buffer);
    v.setUint32(0, W);
    v.setUint32(4, H);
    ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
    return concat([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", new Uint8Array(deflateSync(raw))), chunk("IEND", new Uint8Array())]);
  }
}

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(b: Uint8Array) {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
const concat = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

/** Animal cell: membrane, nucleus at the centre, two mitochondria (see field-content.ts regions). */
function cell() {
  const c = new Canvas();
  c.ellipse(400, 300, 340, 228, { fill: PALE, stroke: INK, line: 4 }); // membrane: top at y = 0.12
  c.ellipse(400, 300, 112, 84, { fill: SOFT, stroke: INK, line: 4 }); // nucleus: circle r 0.14 in 0–1 units
  c.ellipse(400, 300, 30, 24, { fill: INK }); // nucleolus
  c.ellipse(216, 198, 56, 26, { fill: PALE, stroke: INK, line: 3 }); // mitochondrion, left (0.20–0.34, 0.28–0.38)
  c.ellipse(568, 414, 56, 26, { fill: PALE, stroke: INK, line: 3 }); // mitochondrion, right (0.64–0.78, 0.64–0.74)
  return c.png();
}

/** Empty graph axes to sketch on. */
function axes() {
  const c = new Canvas();
  c.rect(80, 40, 4, 500, INK); // y axis
  c.rect(80, 536, 680, 4, INK); // x axis
  for (let i = 1; i <= 10; i++) {
    c.rect(80 + i * 66, 536, 2, 12, INK);
    c.rect(68, 536 - i * 48, 12, 2, INK);
  }
  return c.png();
}

export const SEED_PNGS: Record<string, () => Uint8Array> = { cell, axes };

/** The starter workbook for the field-counts upload task. */
export async function fieldCountsWorkbook(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const s = wb.addWorksheet("Counts");
  s.addRow(["Quadrat", "Snails"]);
  [12, 7, 15, 9, 11].forEach((n, i) => s.addRow([i + 1, n]));
  s.getCell("A8").value = "Total";
  s.getCell("A9").value = "Mean";
  s.getColumn(1).width = 12;
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
