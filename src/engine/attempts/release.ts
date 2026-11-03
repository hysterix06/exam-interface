import type { ExamSettings } from "../exam";

export interface Visibility {
  score: boolean;
  answers: boolean;
  feedback: boolean;
  explanations: boolean;
}

export const HIDDEN: Visibility = { score: false, answers: false, feedback: false, explanations: false };

const LEVELS: Record<ExamSettings["release"], Visibility> = {
  score: { score: true, answers: false, feedback: false, explanations: false },
  answers: { score: true, answers: true, feedback: false, explanations: false },
  feedback: { score: true, answers: true, feedback: true, explanations: false },
  explanations: { score: true, answers: true, feedback: true, explanations: true },
};

/** What a student may see of a finished attempt: nothing until the exam is released. */
export function visibility(examState: string, release: ExamSettings["release"]): Visibility {
  return examState === "released" ? LEVELS[release] : HIDDEN;
}
