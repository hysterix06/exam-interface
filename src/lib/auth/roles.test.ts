import { describe, expect, it } from "vitest";
import { canAccess, homeFor, isRole, rolesForPath } from "./roles";

describe("canAccess", () => {
  it("lets anyone reach public paths", () => {
    expect(canAccess(null, "/login")).toBe(true);
    expect(canAccess(null, "/widgets/pos-demo.html")).toBe(true);
    // Prefix matching is by path segment, not by string prefix.
    expect(canAccess(null, "/widgetsx")).toBe(false);
  });

  it("requires a session everywhere else", () => {
    expect(canAccess(null, "/")).toBe(false);
    expect(canAccess(null, "/exams")).toBe(false);
  });

  it("keeps students out of authoring and admin", () => {
    expect(canAccess("student", "/author")).toBe(false);
    expect(canAccess("student", "/author/questions/1")).toBe(false);
    expect(canAccess("student", "/admin")).toBe(false);
    expect(canAccess("student", "/exams")).toBe(true);
    expect(canAccess("student", "/exam/abc")).toBe(true);
  });

  it("lets staff reach every area", () => {
    for (const role of ["admin", "instructor"] as const) {
      expect(canAccess(role, "/author")).toBe(true);
      expect(canAccess(role, "/admin/exams/1/live")).toBe(true);
      expect(canAccess(role, "/exams")).toBe(true);
    }
  });

  it("matches whole path segments only", () => {
    expect(rolesForPath("/authority")).toBeNull();
    expect(rolesForPath("/examsx")).toBeNull();
    expect(rolesForPath("/exam")).not.toBeNull();
  });
});

describe("homeFor", () => {
  it("routes students to their exams and staff to authoring", () => {
    expect(homeFor("student")).toBe("/exams");
    expect(homeFor("instructor")).toBe("/author");
    expect(homeFor("admin")).toBe("/author");
  });
});

describe("isRole", () => {
  it("accepts only known roles", () => {
    expect(isRole("admin")).toBe(true);
    expect(isRole("superuser")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});
