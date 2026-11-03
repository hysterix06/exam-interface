export interface TextMatchOpts {
  caseSensitive: boolean;
  /** Trim and collapse runs of whitespace to one space. */
  collapseWhitespace: boolean;
}

export const DEFAULT_TEXT_OPTS: TextMatchOpts = {
  caseSensitive: false,
  collapseWhitespace: true,
};

/** Longest response a regex is ever run against (guards slow patterns). */
export const MAX_REGEX_INPUT = 500;

export function normalizeText(s: string, opts: TextMatchOpts) {
  let t = s.normalize("NFC");
  if (opts.collapseWhitespace) t = t.trim().replace(/\s+/g, " ");
  if (!opts.caseSensitive) t = t.toLocaleLowerCase("en");
  return t;
}

/** The accepted answer the response matches, or null. */
export function matchAccepted(got: string, accepted: readonly string[], opts: TextMatchOpts) {
  const g = normalizeText(got, opts);
  return accepted.find((a) => normalizeText(a, opts) === g) ?? null;
}

/** Full-string regex match. Invalid patterns never match. */
export function matchRegex(got: string, pattern: string, caseSensitive: boolean) {
  if (got.length > MAX_REGEX_INPUT) return false;
  const re = compileRegex(pattern, caseSensitive);
  return re !== null && re.test(got.trim());
}

export function compileRegex(pattern: string, caseSensitive: boolean) {
  try {
    return new RegExp(`^(?:${pattern})$`, caseSensitive ? "u" : "iu");
  } catch {
    return null;
  }
}
