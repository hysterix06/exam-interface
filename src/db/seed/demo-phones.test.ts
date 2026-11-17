import { describe, expect, it } from "vitest";
import { parsePhone } from "@/lib/phone";
import { DEMO_PHONES } from "./demo-phones";

describe("demo phone numbers", () => {
  it("are all valid, so the seed never stores a number the app would reject", () => {
    for (const [email, p] of Object.entries(DEMO_PHONES)) {
      expect(parsePhone(p.raw, p.region), email).toMatchObject({ ok: true });
    }
  });

  it("cover both notations: a UK number, a US number and a Canadian one entered as +1 under the US", () => {
    const stored = Object.values(DEMO_PHONES).map((p) => parsePhone(p.raw, p.region));
    expect(stored.map((r) => r.ok && r.region)).toEqual(["GB", "US", "CA"]);
  });
});
