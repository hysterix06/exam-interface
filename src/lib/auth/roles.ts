export const ROLES = ["admin", "instructor", "student"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

// First matching prefix wins. Staff may open student routes (for previews);
// students never reach authoring or admin routes.
const ROUTE_RULES: { prefix: string; roles: readonly Role[] }[] = [
  { prefix: "/admin", roles: ["admin", "instructor"] },
  { prefix: "/author", roles: ["admin", "instructor"] },
  { prefix: "/exams", roles: ROLES },
  { prefix: "/attempt", roles: ROLES },
  { prefix: "/exam", roles: ROLES },
];

// /widgets holds static, public widget pages (embedded in sandboxed iframes by
// the exam). They must never contain anything secret.
export const PUBLIC_PATHS = ["/login", "/widgets"] as const;

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => matchesPrefix(pathname, p));
}

/** Roles allowed on a path, or null when the path has no role restriction. */
export function rolesForPath(pathname: string): readonly Role[] | null {
  return ROUTE_RULES.find((r) => matchesPrefix(pathname, r.prefix))?.roles ?? null;
}

export function canAccess(role: Role | null, pathname: string) {
  if (isPublicPath(pathname)) return true;
  if (!role) return false;
  const allowed = rolesForPath(pathname);
  return allowed === null || allowed.includes(role);
}

export function homeFor(role: Role) {
  return role === "student" ? "/exams" : "/author";
}
