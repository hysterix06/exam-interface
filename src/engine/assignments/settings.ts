import { z } from "zod";
import { dueLatePolicySchema } from "./late";

/** What a student may hand in, besides typed text. Checked against the bytes, never the extension. */
export const SUBMISSION_FILE_KINDS = ["pdf", "docx", "image", "text", "workbook"] as const;
export type SubmissionFileKind = (typeof SUBMISSION_FILE_KINDS)[number];

export const FILE_KIND_LABEL: Record<SubmissionFileKind, string> = {
  pdf: "PDF",
  docx: "Word (.docx)",
  image: "Image (PNG, JPEG, WebP)",
  text: "Plain text",
  workbook: "Excel (.xlsx)",
};

/** One upload per file; also the cap on the storage bucket. */
export const MAX_SUBMISSION_FILE_BYTES = 10 * 1024 * 1024;

export const assignmentSettingsSchema = z.object({
  allowText: z.boolean().default(true),
  allowFiles: z.boolean().default(true),
  maxFiles: z.number().int().min(1).max(10).default(3),
  accept: z.array(z.enum(SUBMISSION_FILE_KINDS)).min(1).default(["pdf", "docx", "image", "text"]),
  /** Students may hand in again until the late window closes; the newest version is marked. */
  resubmit: z.boolean().default(true),
  late: dueLatePolicySchema,
});
export type AssignmentSettings = z.infer<typeof assignmentSettingsSchema>;

/** Stored settings, or the defaults if they are missing or invalid. */
export function parseAssignmentSettings(raw: unknown): AssignmentSettings {
  const r = assignmentSettingsSchema.safeParse(raw ?? {});
  return r.success ? r.data : assignmentSettingsSchema.parse({});
}
