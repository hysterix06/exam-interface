import { describe, expect, it } from "vitest";
import { describeMeeting, parseCourseInfo } from "./course";

describe("course info", () => {
  it("parses what's stored and falls back to empty", () => {
    expect(parseCourseInfo(null)).toEqual({ meetings: [], links: [] });
    expect(parseCourseInfo({ links: [{ label: "x", url: "javascript:alert(1)" }] })).toEqual({ meetings: [], links: [] });
    const ok = parseCourseInfo({ officeHours: "Tue 2–4", meetings: [{ days: "Mon, Wed", start: "10:00", end: "11:15", location: "Room 204" }] });
    expect(ok.officeHours).toBe("Tue 2–4");
    expect(describeMeeting(ok.meetings[0])).toBe("Mon, Wed 10:00–11:15 · Room 204");
    expect(describeMeeting({ days: "Fri" })).toBe("Fri");
  });
});
