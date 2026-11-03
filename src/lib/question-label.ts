/** Short human label for a question definition: its stem, trimmed. */
export function questionLabel(def: unknown, max = 90) {
  const stem =
    def && typeof def === "object" && "stem" in def && typeof def.stem === "string"
      ? def.stem.trim().replace(/\s+/g, " ")
      : "";
  if (!stem) return "Untitled question";
  return stem.length > max ? `${stem.slice(0, max - 1)}…` : stem;
}
