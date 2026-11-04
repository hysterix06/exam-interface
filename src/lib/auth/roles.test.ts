import { describe, expect, it } from "vitest";
import { homeFor, isPublicPath, isRole } from "./roles";

describe("isPublicPath", () => {
  it("allows login and widgets without a session", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/widgets")).toBe(true);
    expect(isPublicPath("/widgets/pos-demo.html")).toBe(true);
  });

  it("matches whole path segments only", () => {
    expect(isPublicPath("/widgetsx")).toBe(false);
    expect(isPublicPath("/loginx")).toBe(false);
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/teach")).toBe(false);
  });
});

describe("homeFor", () => {
  it("gives each role its own app", () => {
    expect(homeFor("student")).toBe("/");
    expect(homeFor("instructor")).toBe("/teach");
    expect(homeFor("admin")).toBe("/admin");
  });
});

describe("isRole", () => {
  it("accepts only known roles", () => {
    expect(isRole("admin")).toBe(true);
    expect(isRole("superuser")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});
