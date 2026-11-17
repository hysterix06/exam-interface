import { type ExamSettings, examSettingsSchema } from "./exam";
import type { Blueprint } from "./selection/types";

export interface ExamTemplate {
  id: string;
  label: string;
  /** One line: what it sets up, for the picker. */
  description: string;
  /** Overrides on top of the organisation's defaults. */
  settings: Partial<ExamSettings>;
  /** Questions drawn from each topic that has enough active questions; 0 = no sections. */
  perTopic: number;
}

export const EXAM_TEMPLATES: readonly ExamTemplate[] = [
  { id: "blank", label: "Blank", description: "Your organisation's default settings and no sections.", settings: {}, perTopic: 0 },
  {
    id: "quiz",
    label: "Quick quiz",
    description: "2 questions from every topic, 10 minutes, full explanations on release.",
    settings: { timeLimitMinutes: 10, attemptsAllowed: 1, release: "explanations" },
    perTopic: 2,
  },
  {
    id: "practice",
    label: "Practice",
    description: "3 questions from every topic, untimed, 3 attempts, full explanations on release.",
    settings: { timeLimitMinutes: null, attemptsAllowed: 3, release: "explanations" },
    perTopic: 3,
  },
  {
    id: "midterm",
    label: "Midterm",
    description: "5 questions from every topic, 60 minutes, single-use entry codes, score and answers on release.",
    settings: { timeLimitMinutes: 60, attemptsAllowed: 1, requireCode: true, release: "answers" },
    perTopic: 5,
  },
];

export function templateById(id: string | undefined): ExamTemplate {
  return EXAM_TEMPLATES.find((t) => t.id === id) ?? EXAM_TEMPLATES[0];
}

export interface TemplateTopic {
  id: string;
  /** Active questions with weight above 0. */
  drawable: number;
}

/**
 * A template's starting point for one course: settings over the org defaults,
 * and one section per topic, never asking for more than the topic holds.
 * Topics with no drawable questions are left out.
 */
export function applyTemplate(template: ExamTemplate, defaults: unknown, topics: readonly TemplateTopic[]): { settings: ExamSettings; blueprint: Blueprint } {
  const base = examSettingsSchema.parse(defaults ?? {});
  const settings = examSettingsSchema.parse({ ...base, ...template.settings });
  const sections =
    template.perTopic === 0
      ? []
      : topics.filter((t) => t.drawable > 0).map((t) => ({ topicId: t.id, count: Math.min(template.perTopic, t.drawable) }));
  return { settings, blueprint: { sections, shuffleQuestions: true } };
}
