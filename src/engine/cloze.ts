// Cloze template parser. Authors write sentences with blanks:
//   The capital of France is {{text:Paris|paris}} and 2+2 is {{num:4±0}}.
//   Water boils at {{num:100±1}} °C in a {{select:vacuum|kettle*|freezer}}.
// Pure and total: bad syntax comes back as errors, never as an exception.

export type BlankSpec =
  | { kind: "text"; accepted: string[] }
  | { kind: "num"; value: number; abs: number; rel: number }
  | { kind: "select"; options: string[]; correct: string };

/** "lit" is a run of plain sentence; every other kind is a blank. */
export type ClozeSegment = { kind: "lit"; text: string } | ({ id: string } & BlankSpec);

export interface ClozeParse {
  segments: ClozeSegment[];
  blanks: (BlankSpec & { id: string })[];
  errors: string[];
}

const NUM_RE = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(?:(?:±|\+-|\+\/-)\s*((?:\d+(?:\.\d*)?|\.\d+))\s*(%)?)?\s*$/i;

function parseBlank(body: string, n: number, errors: string[]): BlankSpec | null {
  const colon = body.indexOf(":");
  const kind = (colon === -1 ? body : body.slice(0, colon)).trim().toLowerCase();
  const rest = colon === -1 ? "" : body.slice(colon + 1);
  const label = `Blank ${n}`;

  if (kind === "text") {
    const accepted = rest.split("|").map((s) => s.trim()).filter(Boolean);
    if (accepted.length === 0) {
      errors.push(`${label}: add at least one accepted answer, e.g. {{text:Paris|paris}}.`);
      return null;
    }
    return { kind: "text", accepted };
  }

  if (kind === "num") {
    const m = NUM_RE.exec(rest);
    if (!m) {
      errors.push(`${label}: write a number, optionally with a margin, e.g. {{num:4±0.1}} or {{num:100±5%}}.`);
      return null;
    }
    const value = Number(m[1]);
    const margin = m[2] === undefined ? 0 : Number(m[2]);
    return { kind: "num", value, abs: m[3] ? 0 : margin, rel: m[3] ? margin / 100 : 0 };
  }

  if (kind === "select") {
    const raw = rest.split("|").map((s) => s.trim()).filter(Boolean);
    const correct = raw.filter((o) => o.endsWith("*")).map((o) => o.slice(0, -1).trim());
    const options = raw.map((o) => (o.endsWith("*") ? o.slice(0, -1).trim() : o));
    if (options.length < 2) {
      errors.push(`${label}: a dropdown needs at least two options, e.g. {{select:red|blue*|green}}.`);
      return null;
    }
    if (correct.length !== 1) {
      errors.push(`${label}: mark exactly one option as correct with a star, e.g. blue*.`);
      return null;
    }
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
      errors.push(`${label}: two dropdown options have the same text.`);
      return null;
    }
    return { kind: "select", options, correct: correct[0] };
  }

  errors.push(`${label}: unknown blank type “${kind}”. Use text, num or select.`);
  return null;
}

export function parseCloze(template: string, opts: { allowNoBlanks?: boolean } = {}): ClozeParse {
  const segments: ClozeSegment[] = [];
  const blanks: ClozeParse["blanks"] = [];
  const errors: string[] = [];

  let i = 0;
  let blankCount = 0; // counts malformed blanks too, so messages match what the author sees
  let text = "";
  while (i < template.length) {
    if (template.startsWith("{{", i)) {
      const end = template.indexOf("}}", i + 2);
      if (end === -1) {
        errors.push("A blank is missing its closing }}.");
        text += template.slice(i);
        break;
      }
      blankCount++;
      const spec = parseBlank(template.slice(i + 2, end), blankCount, errors);
      if (text) segments.push({ kind: "lit", text });
      text = "";
      if (spec) {
        const blank = { id: `b${blankCount}`, ...spec };
        blanks.push(blank);
        segments.push(blank);
      }
      i = end + 2;
    } else {
      text += template[i];
      i++;
    }
  }
  if (text) segments.push({ kind: "lit", text });

  if (blanks.length === 0 && errors.length === 0 && !opts.allowNoBlanks) errors.push("Add at least one blank, e.g. {{text:answer}}.");
  return { segments, blanks, errors };
}
