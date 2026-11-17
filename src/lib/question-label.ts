/** The text a definition leads with: its stem, or a cloze template with blanks shown as "___". */
function leadText(def: unknown): string {
  if (!def || typeof def !== "object") return "";
  const d = def as Record<string, unknown>;
  if (typeof d.stem === "string" && d.stem.trim()) return d.stem;
  if (typeof d.template === "string") return d.template.replace(/\{\{[\s\S]*?\}\}/g, "___");
  return "";
}

/**
 * Markdown and maths down to plain words, for one-line labels: images become
 * their alt text, links their text, $$x^2$$ its source, and emphasis marks go.
 */
export function plainText(md: string): string {
  return md
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\$\$([\s\S]*?)\$\$/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?=[^\w*]|$)/g, "$1$2")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/^\|?[\s:|-]+\|?$/gm, "")
    .replace(/\|/g, " ");
}

/** Short human label for a question definition: its stem, trimmed. */
export function questionLabel(def: unknown, max = 90) {
  const stem = plainText(leadText(def)).trim().replace(/\s+/g, " ");
  if (!stem) return "Untitled question";
  return stem.length > max ? `${stem.slice(0, max - 1)}…` : stem;
}
