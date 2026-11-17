// Shapes on an image, in 0–1 coordinates (fractions of the image's width and
// height), so a region drawn on a 2000-px upload still fits a phone screen.
import { z } from "zod";

const unit = z.number().min(0).max(1);
export const pointSchema = z.tuple([unit, unit]);

export const shapeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("rect"), x: unit, y: unit, w: unit, h: unit }),
  z.object({ kind: z.literal("circle"), cx: unit, cy: unit, r: z.number().gt(0).max(1) }),
  z.object({ kind: z.literal("polygon"), points: z.array(pointSchema).min(3) }),
]);
export type Shape = z.infer<typeof shapeSchema>;
export interface Point {
  x: number;
  y: number;
}

export function pointInShape(s: Shape, p: Point): boolean {
  if (s.kind === "rect") return p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h;
  if (s.kind === "circle") return (p.x - s.cx) ** 2 + (p.y - s.cy) ** 2 <= s.r ** 2;
  // Ray casting, with points on an edge counted as inside.
  let inside = false;
  const pts = s.points;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (onSegment(p, xi, yi, xj, yj)) return true;
    if (yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function onSegment(p: Point, x1: number, y1: number, x2: number, y2: number) {
  const cross = (p.x - x1) * (y2 - y1) - (p.y - y1) * (x2 - x1);
  if (Math.abs(cross) > 1e-12) return false;
  return p.x >= Math.min(x1, x2) - 1e-12 && p.x <= Math.max(x1, x2) + 1e-12 && p.y >= Math.min(y1, y2) - 1e-12 && p.y <= Math.max(y1, y2) + 1e-12;
}

/**
 * A point guaranteed to be inside the shape (the answer key's click). For a
 * polygon the centroid can fall outside a concave shape, so scan horizontal
 * lines through it and take the middle of the widest inside span.
 */
export function interiorPoint(s: Shape): Point {
  if (s.kind === "rect") return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
  if (s.kind === "circle") return { x: s.cx, y: s.cy };
  const ys = s.points.map(([, y]) => y);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  let best: { x: number; y: number; width: number } | null = null;
  for (let k = 1; k < 64; k++) {
    const y = top + ((bottom - top) * k) / 64;
    const xs: number[] = [];
    for (let i = 0, j = s.points.length - 1; i < s.points.length; j = i++) {
      const [xi, yi] = s.points[i];
      const [xj, yj] = s.points[j];
      if (yi > y !== yj > y) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
    }
    xs.sort((a, b) => a - b);
    for (let m = 0; m + 1 < xs.length; m += 2) {
      const width = xs[m + 1] - xs[m];
      if (!best || width > best.width) best = { x: (xs[m] + xs[m + 1]) / 2, y, width };
    }
  }
  return best ? { x: best.x, y: best.y } : { x: s.points[0][0], y: s.points[0][1] };
}

/** Ramer–Douglas–Peucker: fewer points, same drawing (within `epsilon`). Keeps saved drawings small. */
export function simplifyStroke(points: readonly [number, number][], epsilon: number): [number, number][] {
  if (points.length < 3) return points.map((p) => [p[0], p[1]]);
  const [x1, y1] = points[0];
  const [x2, y2] = points[points.length - 1];
  const len = Math.hypot(x2 - x1, y2 - y1);
  let far = 0;
  let at = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const d = len === 0 ? Math.hypot(x - x1, y - y1) : Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / len;
    if (d > far) {
      far = d;
      at = i;
    }
  }
  if (far <= epsilon) return [[x1, y1], [x2, y2]];
  return [...simplifyStroke(points.slice(0, at + 1), epsilon).slice(0, -1), ...simplifyStroke(points.slice(at), epsilon)];
}
