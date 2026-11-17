import { describe, expect, it } from "vitest";
import { parseRoster } from "./roster";

describe("parseRoster", () => {
  it("reads bare emails, names and roles", () => {
    const { rows, errors } = parseRoster("a@x.edu\nAda Lovelace, ada@x.edu\nAlan Turing\tALAN@x.edu\tTeacher");
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 1, fullName: null, email: "a@x.edu", role: null },
      { line: 2, fullName: "Ada Lovelace", email: "ada@x.edu", role: null },
      { line: 3, fullName: "Alan Turing", email: "alan@x.edu", role: "instructor" },
    ]);
  });

  it("skips a header and blank lines, and reports bad rows", () => {
    const { rows, errors } = parseRoster("Name,Email\n\nGrace, grace@x.edu\nno email here\ngrace@x.edu");
    expect(rows.map((r) => r.email)).toEqual(["grace@x.edu"]);
    expect(errors).toEqual([
      { line: 4, text: "no email here", reason: "No email address" },
      { line: 5, text: "grace@x.edu", reason: "Listed twice" },
    ]);
  });

  it("reads a phone number from any column and keeps it out of the name", () => {
    const { rows, errors } = parseRoster(
      "Ada Lovelace, ada@x.edu, +44 20 7946 0958\n020 7946 0958\tAlan Turing\talan@x.edu\tteacher\nWei, wei@x.edu, +86 138 1234 5678",
      "GB",
    );
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { line: 1, fullName: "Ada Lovelace", email: "ada@x.edu", role: null, phone: { phone: "+442079460958", region: "GB" } },
      { line: 2, fullName: "Alan Turing", email: "alan@x.edu", role: "instructor", phone: { phone: "+442079460958", region: "GB" } },
      { line: 3, fullName: "Wei", email: "wei@x.edu", role: null, phone: { phone: "+8613812345678", region: "CN" } },
    ]);
  });

  it("reads a number without + in the chosen country", () => {
    const { rows } = parseRoster("Wei, wei@x.edu, 13812345678", "CN");
    expect(rows[0].phone).toEqual({ phone: "+8613812345678", region: "CN" });
  });

  it("reports a line whose number isn't valid, and one that needs a country", () => {
    const bad = parseRoster("Ada, ada@x.edu, 1234567890123456\nAlan, alan@x.edu", "GB");
    expect(bad.rows.map((r) => r.email)).toEqual(["alan@x.edu"]);
    expect(bad.errors).toEqual([{ line: 1, text: "Ada, ada@x.edu, 1234567890123456", reason: expect.stringContaining("valid phone number") }]);

    const noCountry = parseRoster("Grace, grace@x.edu, 020 7946 0958", "");
    expect(noCountry.rows).toEqual([]);
    expect(noCountry.errors[0].reason).toContain("country");
  });

  it("doesn't mistake a short number-like name for a phone", () => {
    const { rows } = parseRoster("Room 12, a@x.edu, 12345");
    expect(rows[0]).toEqual({ line: 1, fullName: "Room 12 12345", email: "a@x.edu", role: null });
  });
});
