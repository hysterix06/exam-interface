import type { Role } from "@/lib/auth/roles";

export interface RosterRow {
  line: number;
  fullName: string | null;
  email: string;
  role: Role | null;
}

export interface RosterParse {
  rows: RosterRow[];
  errors: { line: number; text: string; reason: string }[];
}

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/**
 * Parse a pasted list of people, one per line: `email`, `Name, email`, or
 * `Name, email, role`. Commas, tabs or semicolons separate fields, so a column
 * copied from a spreadsheet works. A header row is skipped.
 */
export function parseRoster(text: string): RosterParse {
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
    seen.add(email);
    const rest = fields.filter((_, j) => j !== emailAt);
    const roleField = rest.find((f) => /^(admin|administrator|instructor|teacher|student)$/i.test(f));
    const role = roleField ? normaliseRole(roleField) : null;
    const name = rest.filter((f) => f !== roleField).join(" ").trim();
    rows.push({ line, fullName: name || null, email, role });
  });
  return { rows, errors };
}

function normaliseRole(f: string): Role {
  const v = f.toLowerCase();
  if (v.startsWith("admin")) return "admin";
  if (v === "teacher" || v === "instructor") return "instructor";
  return "student";
}
