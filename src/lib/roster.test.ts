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
});
