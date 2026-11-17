// After-the-fact similarity signals between students. Every student gets
// different numbers and option orders, so "same answer" alone means little;
// the evidence that matters is the same *uncommon wrong* answer on several
// questions, or written answers that share long runs of phrasing. These are
// signals for a person to look at, never penalties, and each comes with its
// reasoning in plain language.

export interface SimilarityItem {
  questionId: string;
  /** Analysis tokens the student chose (null for free text). */
  tokens: readonly string[] | null;
  keyTokens: readonly string[];
  /** Written answer text, for long answers. */
  text?: string;
}

export interface SimilarityAttempt {
  attemptId: string;
  items: readonly SimilarityItem[];
}

export interface SimilarPair {
  a: string;
  b: string;
  /** Strength: sum of −ln(share) over the shared rare wrong answers, plus 5 per overlapping essay. */
  score: number;
  reasons: string[];
  evidence: { questionId: string; kind: "wrong-answer" | "writing"; detail: string; overlap?: number }[];
}

/** A wrong answer at most this share of students gave is "uncommon". */
export const RARE_SHARE = 0.1;
/** Pairs need at least this many shared uncommon wrong answers. */
export const MIN_SHARED = 3;
/** Written answers sharing this share of five-word phrases (and long enough to mean it). */
export const TEXT_OVERLAP = 0.5;
const MIN_WORDS = 20;

const words = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
function shingles(t: string, n = 5) {
  const w = words(t);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
}

/** Share of five-word phrases two texts have in common (Jaccard); 0 for texts too short to have any. */
export function shingleOverlap(x: string, y: string): number {
  const a = shingles(x);
  const b = shingles(y);
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const s of a) if (b.has(s)) shared++;
  return shared / (a.size + b.size - shared);
}

export function findSimilarAttempts(attempts: readonly SimilarityAttempt[]): SimilarPair[] {
  // How often each wrong token was chosen per question.
  const answered = new Map<string, number>();
  const wrongCount = new Map<string, number>();
  const wrongOf = (i: SimilarityItem) => (i.tokens ?? []).filter((t) => !i.keyTokens.includes(t));
  for (const a of attempts) {
    for (const i of a.items) {
      if (!i.tokens || i.tokens.length === 0) continue;
      answered.set(i.questionId, (answered.get(i.questionId) ?? 0) + 1);
      for (const t of new Set(wrongOf(i))) wrongCount.set(`${i.questionId}|${t}`, (wrongCount.get(`${i.questionId}|${t}`) ?? 0) + 1);
    }
  }
  const share = (q: string, t: string) => (wrongCount.get(`${q}|${t}`) ?? 0) / (answered.get(q) ?? 1);

  const pairs: SimilarPair[] = [];
  for (let x = 0; x < attempts.length; x++) {
    for (let y = x + 1; y < attempts.length; y++) {
      const A = attempts[x];
      const B = attempts[y];
      const evidence: SimilarPair["evidence"] = [];
      let score = 0;
      for (const ia of A.items) {
        const ib = B.items.find((i) => i.questionId === ia.questionId);
        if (!ib) continue;
        const shared = wrongOf(ia).filter((t) => wrongOf(ib).includes(t) && share(ia.questionId, t) <= RARE_SHARE);
        if (shared.length) {
          score += shared.reduce((s, t) => s - Math.log(share(ia.questionId, t)), 0);
          evidence.push({ questionId: ia.questionId, kind: "wrong-answer", detail: `both chose ${shared.join(", ")} (${Math.round(Math.max(...shared.map((t) => share(ia.questionId, t))) * 100)}% of students)` });
        }
        if (ia.text && ib.text && words(ia.text).length >= MIN_WORDS && words(ib.text).length >= MIN_WORDS) {
          const o = shingleOverlap(ia.text, ib.text);
          if (o >= TEXT_OVERLAP) {
            score += 5;
            evidence.push({ questionId: ia.questionId, kind: "writing", detail: `${Math.round(o * 100)}% of five-word phrases in common`, overlap: o });
          }
        }
      }
      const wrong = evidence.filter((e) => e.kind === "wrong-answer");
      const writing = evidence.filter((e) => e.kind === "writing");
      if (wrong.length < MIN_SHARED && writing.length === 0) continue;
      const reasons: string[] = [];
      if (wrong.length >= MIN_SHARED) {
        reasons.push(`Both gave the same uncommon wrong answer on ${wrong.length} questions (each given by ${Math.round(RARE_SHARE * 100)}% of students or fewer).`);
      }
      for (const w of writing) reasons.push(`Their written answers to one question share ${Math.round((w.overlap ?? 0) * 100)}% of their five-word phrases.`);
      pairs.push({ a: A.attemptId, b: B.attemptId, score: Math.round(score * 100) / 100, reasons, evidence: wrong.length >= MIN_SHARED ? evidence : writing });
    }
  }
  return pairs.sort((p, q) => q.score - p.score);
}
