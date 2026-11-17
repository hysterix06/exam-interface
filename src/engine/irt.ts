// Rasch (one-parameter IRT), kept small and checkable by hand. A student's
// ability θ and a question's difficulty b sit on the same scale; the chance
// of a right answer is 1 / (1 + e^-(θ − b)). Ability is estimated by EAP: the
// average of θ over a fixed grid from −4 to 4, weighted by a standard normal
// prior times the likelihood of the answers so far. Deterministic, and it
// copes with all-right or all-wrong runs (where maximum likelihood doesn't).

const GRID = Array.from({ length: 81 }, (_, i) => -4 + i * 0.1);

export const pCorrect = (theta: number, b: number) => 1 / (1 + Math.exp(-(theta - b)));

export interface RaschAnswer {
  b: number;
  correct: boolean;
}

export function eapAbility(answers: readonly RaschAnswer[]): { theta: number; se: number } {
  const w = GRID.map((t) => {
    let like = Math.exp(-(t * t) / 2);
    for (const a of answers) {
      const p = pCorrect(t, a.b);
      like *= a.correct ? p : 1 - p;
    }
    return like;
  });
  const total = w.reduce((s, x) => s + x, 0);
  const theta = GRID.reduce((s, t, i) => s + t * w[i], 0) / total;
  const variance = GRID.reduce((s, t, i) => s + (t - theta) ** 2 * w[i], 0) / total;
  return { theta: Math.round(theta * 1000) / 1000, se: Math.round(Math.sqrt(variance) * 1000) / 1000 };
}

/** Difficulty on the θ scale from the share of points students earned (0–1), clipped to ±3. */
export function difficultyFromShare(p: number): number {
  const q = Math.min(0.95, Math.max(0.05, p));
  return Math.round(Math.max(-3, Math.min(3, -Math.log(q / (1 - q)))) * 100) / 100 + 0; // + 0 turns −0 into 0
}

/** Before there's data: easy −1, medium 0, hard +1. */
export const difficultyFromLevel = (level: number) => Math.max(-3, Math.min(3, level - 2));
