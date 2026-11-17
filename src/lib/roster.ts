import type { Role } from "@/lib/auth/roles";
import { parsePhone, type StoredPhone } from "@/lib/phone";

export interface RosterRow {
  line: number;
  fullName: string | null;
  email: string;
  role: Role | null;
  /** Present only when the line had a phone number: validated, as stored. */
  phone?: StoredPhone;
}

export interface RosterParse {
  rows: RosterRow[];
  errors: { line: number; text: string; reason: string }[];
}

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
// Only digits and the punctuation people type in numbers; at least 6 digits, so a name never matches.
const PHONE_FIELD = /^\+?[\d\s().-]+$/;
const looksLikePhone = (f: string) => PHONE_FIELD.test(f) && f.replace(/\D/g, "").length >= 6;

/**
 * Parse a pasted list of people, one per line: `email`, `Name, email`, or
 * `Name, email, role`, plus an optional phone number in any column. Commas, tabs or
 * semicolons separate fields, so a column copied from a spreadsheet works. A header row is
 * skipped. Numbers without a leading + are read in `phoneRegion` (a line whose number
 * isn't valid is reported and skipped, like a line with no email).
 */
export function parseRoster(text: string, phoneRegion = ""): RosterParse {
  const rows: RosterRow[] = [];
  const errors: RosterParse["errors"] = [];
  const seen = new Set<string>();

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const fields = raw.split(/[,\t;]/).map((f) => f.trim()).filter(Boolean);
    if (fields.length === 0) return;
    const emailAt = fields.findIndex((f) => EMAIL.test(f));
    if (emailAt === -1) {
      if (i === 0 && /e-?mail/i.test(raw)) return;
      errors.push({ line, text: raw.trim(), reason: "No email address" });
      return;
    }
    const email = fields[emailAt].toLowerCase();
    if (seen.has(email)) {
      errors.push({ line, text: raw.trim(), reason: "Listed twice" });
      return;
    }
    const rest = fields.filter((_, j) => j !== emailAt);
    const phoneField = rest.find(looksLikePhone);
    let phone: StoredPhone | undefined;
    if (phoneField) {
      const parsed = parsePhone(phoneField, phoneRegion);
      if (!parsed.ok) {
        errors.push({ line, text: raw.trim(), reason: parsed.error });
        return;
      }
      phone = { phone: parsed.phone, region: parsed.region };
    }
    seen.add(email);
    const roleField = rest.find((f) => /^(admin|administrator|instructor|teacher|student)$/i.test(f));
    const role = roleField ? normaliseRole(roleField) : null;
    const name = rest.filter((f) => f !== roleField && f !== phoneField).join(" ").trim();
    rows.push({ line, fullName: name || null, email, role, ...(phone ? { phone } : {}) });
  });
  return { rows, errors };
}

function normaliseRole(f: string): Role {
  const v = f.toLowerCase();
  if (v.startsWith("admin")) return "admin";
  if (v === "teacher" || v === "instructor") return "instructor";
  return "student";
}
