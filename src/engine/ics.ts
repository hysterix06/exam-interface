// iCalendar (RFC 5545) for the private calendar feed. Hand-written because the
// subset we need is small: escaped text, UTC times, all-day dates, CRLF line
// ends and 75-octet line folding.

export interface IcsEvent {
  /** Stable across feeds so calendar apps update rather than duplicate. */
  uid: string;
  title: string;
  start: string;
  end?: string | null;
  allDay?: boolean;
  description?: string | null;
  location?: string | null;
  url?: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const utc = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const date = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** Splits a content line into ≤75-octet pieces, never inside a UTF-8 character. */
function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (size + n > limit) {
      out.push(cur);
      cur = "";
      size = 0;
    }
    cur += ch;
    size += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

export function toIcs(cal: { name: string; now: Date; events: readonly IcsEvent[] }): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Modus//Calendar//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escape(cal.name)}`];
  for (const e of cal.events) {
    const start = new Date(e.start);
    lines.push("BEGIN:VEVENT", `UID:${escape(e.uid)}`, `DTSTAMP:${utc(cal.now)}`);
    if (e.allDay) {
      const end = e.end ? new Date(e.end) : start;
      const endExclusive = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() + 1));
      lines.push(`DTSTART;VALUE=DATE:${date(start)}`, `DTEND;VALUE=DATE:${date(endExclusive)}`);
    } else {
      lines.push(`DTSTART:${utc(start)}`);
      if (e.end) lines.push(`DTEND:${utc(new Date(e.end))}`);
    }
    lines.push(`SUMMARY:${escape(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${escape(e.description)}`);
    if (e.location) lines.push(`LOCATION:${escape(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
