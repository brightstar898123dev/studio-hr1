import { z } from "zod";
import { REPLY_CATEGORIES } from "@/lib/types";

export const EmailDraftSchema = z.object({
  subject: z.string().trim().min(1, "subject is empty"),
  body: z.string().trim().min(1, "body is empty"),
});
export type EmailDraft = z.infer<typeof EmailDraftSchema>;

export const ClassificationSchema = z.object({
  category: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase().replace(/[\s-]+/g, "_") : v), z.enum(REPLY_CATEGORIES)),
  confidence: z.coerce.number().min(0).max(1).catch(0.5),
  summary: z.string().trim().catch(""),
});
export type Classification = z.infer<typeof ClassificationSchema>;

export const CheckerResultSchema = z.object({
  score: z.coerce.number().min(0).max(10).transform((n) => Math.round(n * 10) / 10),
  issues: z.array(z.coerce.string()).catch([]),
});
export type CheckerResult = z.infer<typeof CheckerResultSchema>;

export const DocumentSchema = z.object({
  title: z.string().trim().catch(""),
  content: z.string().trim().min(1, "content is empty"),
});
export type DocumentDraft = z.infer<typeof DocumentSchema>;
