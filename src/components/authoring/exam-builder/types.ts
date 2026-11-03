import type { ExamSettings } from "@/engine/exam";
import type { Blueprint } from "@/engine/selection/types";

export interface BuilderTopic {
  id: string;
  name: string;
}

export interface BuilderExam {
  id: string;
  title: string;
  description: string;
  state: "draft" | "scheduled" | "open" | "closed" | "graded" | "released";
  courseTitle: string;
  blueprint: Blueprint;
  settings: ExamSettings;
  /** Question versions locked at publish (0 while a draft). */
  lockedCount: number;
}
