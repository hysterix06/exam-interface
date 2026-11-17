/**
 * Phone numbers. The single place that touches libphonenumber-js (lint enforces it).
 *
 * Storage:  E.164 (`+` and at most 15 digits) in `profiles.phone`, plus the ISO 3166-1
 *           alpha-2 region in `profiles.phone_region`. The region is stored, not derived:
 *           +1 covers the US, Canada and ~20 Caribbean countries.
 * Display:  NATIONAL when the viewer's region is the number's region, otherwise
 *           INTERNATIONAL (E.123). Never mixed notations, never hand-built.
 * Link:     `tel:` with the bare E.164 number (RFC 3966 global form).
 *
 * Pure: no React, Next or DB, so it runs in server components, server actions and the browser.
 */
import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  isSupportedCountry,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js/min";
import { z } from "zod";

/** What forms send: the text as typed or pasted, and the country picker's value ("" = none chosen). */
export const phoneInputSchema = z.object({
  raw: z.string().max(64),
  region: z.string().regex(/^([A-Z]{2})?$/),
});
export type PhoneInput = z.infer<typeof phoneInputSchema>;

export type StoredPhone = { phone: string; region: string };
export type ParsedPhone = ({ ok: true } & StoredPhone) | { ok: false; error: string };

const asCountry = (region: string | null | undefined): CountryCode | undefined =>
  region && isSupportedCountry(region) ? (region as CountryCode) : undefined;

/** Smart paste: drop everything except digits and a leading "+". */
function strip(raw: string): string {
  const text = raw.trim();
  const digits = text.replace(/\D/g, "");
  return (text.startsWith("+") ? "+" : "") + digits;
}

/**
 * Resolve typed or pasted text to a stored number.
 * Order: "+" (international) → the picked country's IDD → its trunk prefix, all of which
 * libphonenumber does. One addition: "00" is the IDD almost everywhere but not in the NANP
 * (011), so a "00…" paste that is not valid for the picked country is retried as "+…".
 */
export function parsePhone(raw: string, region: string): ParsedPhone {
  const text = strip(raw);
  if (text.replace(/\D/g, "").length < 4) return { ok: false, error: "Enter a phone number with its area code." };

  const country = asCountry(region);
  if (!country && !text.startsWith("+") && !text.startsWith("00")) {
    return { ok: false, error: "Choose the country, or start the number with +." };
  }

  const attempts = [parsePhoneNumberFromString(text, country)];
  if (text.startsWith("00")) attempts.push(parsePhoneNumberFromString(`+${text.slice(2)}`));

  for (const n of attempts) {
    // `country` is the number's own region (a +1 number resolves to US, CA, …); non-geographic numbers have none.
    if (n?.isValid() && n.country) return { ok: true, phone: n.number, region: n.country };
  }
  return { ok: false, error: "That doesn't look like a valid phone number. Check the country and the digits." };
}

/** Form value → what to store. A blank number means "no phone" (`value: null`). */
export function resolvePhoneInput(
  input: PhoneInput,
): { ok: true; value: StoredPhone | null } | { ok: false; error: string } {
  if (input.raw.trim() === "") return { ok: true, value: null };
  const r = parsePhone(input.raw, input.region);
  return r.ok ? { ok: true, value: { phone: r.phone, region: r.region } } : r;
}

/** E.123 notation: national for a viewer in the same region, international for everyone else. */
export function formatPhone(phone: string, region: string, viewerRegion: string | null | undefined): string {
  const n = parsePhoneNumberFromString(phone);
  if (!n) return phone;
  return viewerRegion && viewerRegion === region ? n.formatNational() : n.formatInternational();
}

/** `tel:` URI: always the bare E.164 number, whatever is displayed. */
export function phoneHref(phone: string): string {
  return `tel:${phone}`;
}

/** Live formatting while typing. A "+" number is formatted internationally; otherwise by the picked country. */
export function formatAsYouType(text: string, region: string): string {
  return new AsYouType(asCountry(region)).input(text);
}

export type PhoneCountry = { region: string; name: string; callingCode: string };

let countries: PhoneCountry[] | undefined;

/** Every region libphonenumber knows, sorted by English name. */
export function phoneCountries(): PhoneCountry[] {
  if (!countries) {
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    countries = getCountries()
      .map((region) => ({ region, name: names.of(region) ?? region, callingCode: getCountryCallingCode(region) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  return countries;
}

/** The first explicit region in the browser's languages ("en-GB" → GB). A bare "en" is not a country. */
export function guessRegion(languages: readonly string[]): string | undefined {
  for (const tag of languages) {
    try {
      const region = new Intl.Locale(tag).region;
      if (region && isSupportedCountry(region)) return region;
    } catch {
      // not a language tag
    }
  }
  return undefined;
}
