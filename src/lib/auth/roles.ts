export const ROLES = ["admin", "instructor", "student"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  instructor: "Instructor",
  student: "Student",
};

// /widgets holds static, public widget pages (embedded in sandboxed iframes by
// the exam). They must never contain anything secret.
export const PUBLIC_PATHS = ["/login", "/widgets"] as const;

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => matchesPrefix(pathname, p));
}

/**
 * Each role has its own app: admins run the organisation, instructors teach,
 * students take exams. Role checks live in requireRole() (the DB role), not in
 * the proxy, because a JWT role can be up to an hour stale after a change.
 */
export function homeFor(role: Role) {
  if (role === "admin") return "/admin";
  if (role === "instructor") return "/teach";
  return "/";
}
