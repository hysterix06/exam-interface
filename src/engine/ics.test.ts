import { describe, expect, it } from "vitest";
import { toIcs } from "./ics";

const now = new Date("2026-11-17T12:00:00Z");

describe("toIcs", () => {
  it("writes a valid calendar with CRLF line ends", () => {
    const out = toIcs({ name: "Modus · Sam", now, events: [
      { uid: "a1@modus", title: "Lab report due", start: "2026-11-20T23:59:00Z", description: "BIO 101", url: "https://x.test/assignments/1" },
      { uid: "e1@modus", title: "No class", start: "2026-11-26T00:00:00Z", allDay: true },
    ] });
    const lines = out.split("\r\n");
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines).toContain("X-WR-CALNAME:Modus · Sam");
    expect(lines).toContain("DTSTART:20261120T235900Z");
    expect(lines).toContain("DTSTAMP:20261117T120000Z");
    expect(lines).toContain("DTSTART;VALUE=DATE:20261126");
    expect(lines).toContain("DTEND;VALUE=DATE:20261127");
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(2);
    expect(out.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(out).not.toMatch(/[^\r]\n/);
  });
  it("escapes text and folds long lines at 75 octets without splitting characters", () => {
    const out = toIcs({ name: "x", now, events: [{ uid: "u", title: "A; B, C\\D\nE", start: "2026-11-20T10:00:00Z", end: "2026-11-20T11:00:00Z", description: "é".repeat(80) }] });
    expect(out).toContain("SUMMARY:A\; B\\, C\\\\D\\nE");
    expect(out).toContain("DTEND:20261120T110000Z");
    const enc = new TextEncoder();
    for (const l of out.split("\r\n")) expect(enc.encode(l).length).toBeLessThanOrEqual(75);
    const unfolded = out.replace(/\r\n /g, "");
    expect(unfolded).toContain(`DESCRIPTION:${"é".repeat(80)}`);
  });
});
