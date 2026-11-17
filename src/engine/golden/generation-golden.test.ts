// Pins exactly what students get from today's question definitions. The
// fixtures in generation.json are a frozen copy (not the live fixtures.ts,
// which grows), so this fails only when generation itself changes: a new
// field in an instance, a different RNG draw, a reordered selection. Any of
// those silently changes every stored exam's Reproduce result.
//
// Never regenerate the digests to make this pass. New behaviour must be
// opt-in (omitted from the instance when unused, drawn from a new fork label).
import { describe, expect, it } from "vitest";
import golden from "./generation.json";
import { digestCase, goldenCases } from "./golden";

describe("generation golden digest", () => {
  const cases = goldenCases(golden.fixtures as Record<string, unknown[]>);
  const digests = golden.digests as Record<string, string>;

  it("covers every frozen case", () => {
    expect(cases.map((c) => c.name).sort()).toEqual(Object.keys(digests).sort());
  });

  it.each(cases.map((c) => [c.name, c] as const))("%s is unchanged", (_name, c) => {
    expect(digestCase(c)).toBe(digests[c.name]);
  });
});
