/**
 * Kendall-tau-style ordering credit: every pair of items is worth an equal
 * share, earned when the student puts the two in the same relative order as
 * the key. Items the student left out earn nothing for any pair they are in.
 */
export interface OrderScore {
  concordant: number;
  pairs: number;
  /** 0–1 */
  fraction: number;
  placed: number;
  total: number;
}

export function scoreOrder(key: readonly string[], answer: readonly string[] | null): OrderScore {
  const total = key.length;
  const pairs = (total * (total - 1)) / 2;
  const valid = new Set(key);
  // First occurrence wins; ids not in the key are ignored.
  const seen: string[] = [];
  for (const id of answer ?? []) if (valid.has(id) && !seen.includes(id)) seen.push(id);

  const rank = new Map(seen.map((id, i) => [id, i]));
  let concordant = 0;
  for (let i = 0; i < key.length; i++) {
    for (let j = i + 1; j < key.length; j++) {
      const a = rank.get(key[i]);
      const b = rank.get(key[j]);
      if (a !== undefined && b !== undefined && a < b) concordant++;
    }
  }
  return { concordant, pairs, fraction: pairs === 0 ? (seen.length === total ? 1 : 0) : concordant / pairs, placed: seen.length, total };
}
