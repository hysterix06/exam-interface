import { describe, expect, it } from "vitest";
import { interiorPoint, pointInShape, shapeSchema, simplifyStroke, type Shape } from "./geometry";

const rect: Shape = { kind: "rect", x: 0.1, y: 0.1, w: 0.2, h: 0.3 };
const circle: Shape = { kind: "circle", cx: 0.5, cy: 0.5, r: 0.1 };
// A "C" shape: its centroid lies outside it.
const cShape: Shape = { kind: "polygon", points: [[0, 0], [1, 0], [1, 0.2], [0.2, 0.2], [0.2, 0.8], [1, 0.8], [1, 1], [0, 1]] };

describe("pointInShape", () => {
  it("handles rectangles, circles and polygons, edges included", () => {
    expect(pointInShape(rect, { x: 0.2, y: 0.2 })).toBe(true);
    expect(pointInShape(rect, { x: 0.1, y: 0.4 })).toBe(true);
    expect(pointInShape(rect, { x: 0.35, y: 0.2 })).toBe(false);
    expect(pointInShape(circle, { x: 0.55, y: 0.55 })).toBe(true);
    expect(pointInShape(circle, { x: 0.65, y: 0.5 })).toBe(false);
    expect(pointInShape(cShape, { x: 0.1, y: 0.5 })).toBe(true);
    expect(pointInShape(cShape, { x: 0.6, y: 0.5 })).toBe(false);
  });
});

describe("interiorPoint", () => {
  it("always lands inside, even for concave polygons", () => {
    for (const s of [rect, circle, cShape]) expect(pointInShape(s, interiorPoint(s))).toBe(true);
    const tri: Shape = { kind: "polygon", points: [[0.1, 0.1], [0.9, 0.1], [0.5, 0.15]] };
    expect(pointInShape(tri, interiorPoint(tri))).toBe(true);
  });
});

describe("shapeSchema", () => {
  it("keeps coordinates between 0 and 1 and polygons at 3+ points", () => {
    expect(() => shapeSchema.parse({ kind: "rect", x: -0.1, y: 0, w: 0.5, h: 0.5 })).toThrow();
    expect(() => shapeSchema.parse({ kind: "polygon", points: [[0, 0], [1, 1]] })).toThrow();
    expect(shapeSchema.parse(circle)).toEqual(circle);
  });
});

describe("simplifyStroke", () => {
  it("drops points on a straight line and keeps corners", () => {
    const line = Array.from({ length: 20 }, (_, i) => [i / 19, i / 19] as [number, number]);
    expect(simplifyStroke(line, 0.001)).toEqual([[0, 0], [1, 1]]);
    const corner: [number, number][] = [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1]];
    expect(simplifyStroke(corner, 0.001)).toEqual([[0, 0], [1, 0], [1, 1]]);
    expect(simplifyStroke([[0.5, 0.5]], 0.01)).toEqual([[0.5, 0.5]]);
  });
});
