import { describe, expect, it } from "vitest";
import {
  formatAsYouType,
  formatPhone,
  guessRegion,
  parsePhone,
  phoneCountries,
  phoneHref,
  resolvePhoneInput,
} from "./phone";

const CHINA = { ok: true, phone: "+8613812345678", region: "CN" } as const;

describe("parsePhone: smart paste", () => {
  it.each(["+8613812345678", "008613812345678", "013812345678", "13812345678"])(
    "resolves %s (country picker on China) to +8613812345678",
    (text) => {
      expect(parsePhone(text, "CN")).toEqual(CHINA);
    },
  );

  it("strips punctuation and spaces before resolving", () => {
    expect(parsePhone("0086-138 1234 5678", "CN")).toEqual(CHINA);
    expect(parsePhone(" +86 (138) 1234-5678 ", "GB")).toEqual(CHINA);
  });

  it("follows an international prefix even when another country is picked", () => {
    expect(parsePhone("+8613812345678", "GB")).toEqual(CHINA);
    // 00 is the UK's IDD
    expect(parsePhone("008613812345678", "GB")).toEqual(CHINA);
  });

  it("reads a 00 prefix as international when the picked country's IDD is different (NANP uses 011)", () => {
    expect(parsePhone("0086-138 1234 5678", "US")).toEqual(CHINA);
    expect(parsePhone("011 86 138 1234 5678", "US")).toEqual(CHINA);
  });

  it("uses the picked country's trunk prefix, not China's", () => {
    // 020 is London in national notation
    expect(parsePhone("020 7946 0958", "GB")).toEqual({
      ok: true,
      phone: "+442079460958",
      region: "GB",
    });
  });
});

describe("parsePhone: validation and storage", () => {
  it("stores the number's own region, not the picked one (+1 is shared)", () => {
    expect(parsePhone("+1 416 555 0123", "US")).toMatchObject({ phone: "+14165550123", region: "CA" });
    expect(parsePhone("(212) 555-0123", "US")).toMatchObject({ phone: "+12125550123", region: "US" });
  });

  it("rejects a number that is too long (E.164 allows 15 digits)", () => {
    expect(parsePhone("+8613812345678000", "CN").ok).toBe(false);
    expect(parsePhone("+1234567890123456", "US").ok).toBe(false);
  });

  it("rejects invalid, empty and letter-only input with a message", () => {
    for (const text of ["", "   ", "abc", "12", "+"]) {
      const r = parsePhone(text, "GB");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.length).toBeGreaterThan(5);
    }
  });

  it("needs a country for a national number but not for a + number", () => {
    expect(parsePhone("020 7946 0958", "").ok).toBe(false);
    expect(parsePhone("+44 20 7946 0958", "")).toMatchObject({ ok: true, phone: "+442079460958", region: "GB" });
  });

  it("always produces E.164: + then at most 15 digits", () => {
    for (const [text, region] of [
      ["+8613812345678", "CN"],
      ["020 7946 0958", "GB"],
      ["(212) 555-0123", "US"],
    ] as const) {
      const r = parsePhone(text, region);
      expect(r.ok && /^\+[1-9]\d{1,14}$/.test(r.phone)).toBe(true);
    }
  });
});

describe("resolvePhoneInput", () => {
  it("treats a blank number as 'no phone'", () => {
    expect(resolvePhoneInput({ raw: "  ", region: "GB" })).toEqual({ ok: true, value: null });
  });
  it("returns the stored pair for a valid number", () => {
    expect(resolvePhoneInput({ raw: "13812345678", region: "CN" })).toEqual({
      ok: true,
      value: { phone: "+8613812345678", region: "CN" },
    });
  });
  it("passes the parse error through", () => {
    expect(resolvePhoneInput({ raw: "12", region: "CN" }).ok).toBe(false);
  });
});

describe("formatPhone", () => {
  const uk = "+442079460958";
  it("uses national notation when the viewer is in the same region", () => {
    expect(formatPhone(uk, "GB", "GB")).toBe("020 7946 0958");
    expect(formatPhone("+12125550123", "US", "US")).toBe("(212) 555-0123");
  });
  it("uses international notation for any other viewer, or none", () => {
    expect(formatPhone(uk, "GB", "US")).toBe("+44 20 7946 0958");
    expect(formatPhone(uk, "GB", null)).toBe("+44 20 7946 0958");
    expect(formatPhone("+12125550123", "US", "GB")).toBe("+1 212 555 0123");
  });
  it("never mixes notations: no parentheses in an international number", () => {
    for (const [p, r] of [["+12125550123", "US"], ["+14165550123", "CA"], [uk, "GB"]] as const) {
      expect(formatPhone(p, r, "CN")).not.toMatch(/[()]/);
      expect(formatPhone(p, r, "CN")).toMatch(/^\+\d/);
    }
  });
  it("falls back to the stored value when it can't be parsed", () => {
    expect(formatPhone("+0", "GB", "GB")).toBe("+0");
  });
});

describe("phoneHref", () => {
  it("is the bare E.164 tel: URI, whatever the display", () => {
    expect(phoneHref("+12125550123")).toBe("tel:+12125550123");
    expect(phoneHref("+442079460958")).toBe("tel:+442079460958");
  });
});

describe("formatAsYouType", () => {
  it("formats progressively in national notation", () => {
    expect(formatAsYouType("02079460958", "GB")).toBe("020 7946 0958");
    expect(formatAsYouType("2125550123", "US")).toBe("(212) 555-0123");
  });
  it("formats a + number internationally", () => {
    expect(formatAsYouType("+442079460958", "US")).toBe("+44 20 7946 0958");
  });
  it("copes with an empty region and with partial input", () => {
    expect(formatAsYouType("+4420", "")).toMatch(/^\+44 20/);
    expect(formatAsYouType("", "GB")).toBe("");
  });
});

describe("guessRegion and phoneCountries", () => {
  it("takes the first supported region subtag from the browser languages", () => {
    expect(guessRegion(["en-GB", "en-US"])).toBe("GB");
    expect(guessRegion(["en", "de-DE"])).toBe("DE");
    expect(guessRegion(["zh-Hans-CN"])).toBe("CN");
  });
  it("returns undefined rather than inventing a country", () => {
    expect(guessRegion(["en", "fr"])).toBeUndefined();
    expect(guessRegion([])).toBeUndefined();
    expect(guessRegion(["not a locale"])).toBeUndefined();
  });
  it("lists countries sorted by name with their calling codes", () => {
    const list = phoneCountries();
    expect(list.length).toBeGreaterThan(200);
    expect(list.find((c) => c.region === "GB")).toMatchObject({ name: "United Kingdom", callingCode: "44" });
    expect(list.find((c) => c.region === "CN")?.callingCode).toBe("86");
    const names = list.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});
