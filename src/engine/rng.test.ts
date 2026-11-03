import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createRng, cyrb128 } from "./rng";

describe("golden values", () => {
  // If these change, every stored attempt stops reproducing. Do not update
  // them to make a test pass; find out what changed in rng.ts instead.
  it("cyrb128 is stable", () => {
    expect(cyrb128("golden")).toEqual([2078682433, 2864309052, 4156405215, 2118965325]);
  });

  it("the stream is stable", () => {
    const r = createRng("golden");
    expect([r.next(), r.next(), r.next()]).toEqual([
      0.5727395738940686, 0.5335382099729031, 0.5316337437834591,
    ]);
    expect(Array.from({ length: 8 }, () => r.int(1, 100))).toEqual([
      93, 37, 53, 80, 71, 53, 89, 59,
    ]);
  });

  it("shuffle and fork are stable", () => {
    expect(createRng("golden").fork("s").shuffle(["a", "b", "c", "d", "e", "f"])).toEqual([
      "d", "f", "c", "e", "b", "a",
    ]);
  });
});

describe("createRng", () => {
  it("is deterministic per seed and differs across seeds", () => {
    const a = createRng("x");
    const b = createRng("x");
    const c = createRng("y");
    const seqA = Array.from({ length: 20 }, () => a.next());
    expect(Array.from({ length: 20 }, () => b.next())).toEqual(seqA);
    expect(Array.from({ length: 20 }, () => c.next())).not.toEqual(seqA);
  });

  it("forks independently of prior draws", () => {
    const fresh = createRng("seed").fork("q1").next();
    const used = createRng("seed");
    used.next();
    used.next();
    expect(used.fork("q1").next()).toBe(fresh);
  });

  it("int stays in range and covers it", () => {
    const r = createRng("range");
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(-2, 3);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThanOrEqual(3);
      seen.add(v);
    }
    expect([...seen].sort((x, y) => x - y)).toEqual([-2, -1, 0, 1, 2, 3]);
  });

  it("int rejects bad ranges", () => {
    expect(() => createRng("x").int(5, 1)).toThrow(RangeError);
    expect(() => createRng("x").int(0.5, 1)).toThrow(RangeError);
  });

  it("is roughly uniform", () => {
    const r = createRng("uniform");
    const buckets = new Array(10).fill(0);
    const n = 50_000;
    for (let i = 0; i < n; i++) buckets[Math.floor(r.next() * 10)]++;
    // Chi-square with 9 dof; 27.9 is the p = 0.001 critical value.
    const expected = n / 10;
    const chi2 = buckets.reduce((s, o) => s + (o - expected) ** 2 / expected, 0);
    expect(chi2).toBeLessThan(27.9);
  });

  it("shuffle is a permutation and does not mutate its input", () => {
    fc.assert(
      fc.property(fc.string(), fc.array(fc.integer()), (seed, items) => {
        const copy = items.slice();
        const out = createRng(seed).shuffle(items);
        expect(items).toEqual(copy);
        expect(out.slice().sort()).toEqual(copy.slice().sort());
      }),
    );
  });
});
