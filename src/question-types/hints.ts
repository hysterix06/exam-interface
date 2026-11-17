/** Shown under every question-text field: what formatting the renderer understands. */
export const FORMAT_HINT = "Markdown works: **bold**, *italic*, lists, tables. Maths goes between $$ and $$, e.g. $$x^2 + 1$$. Single $ signs stay as money.";

export function withFormatHint(hint?: string) {
  return hint ? `${hint} ${FORMAT_HINT}` : FORMAT_HINT;
}
