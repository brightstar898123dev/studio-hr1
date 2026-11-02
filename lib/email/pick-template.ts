import { builtInTemplate } from "./defaults";
import type { Template, TemplateType } from "@/lib/types";

export type PickedTemplate = {
  source: "job" | "global" | "built-in";
  id: string | null;
  format: "html" | "text";
  subject_template: string;
  body_template: string;
};

/** Job-specific template for that type > global template for that type > built-in default. */
export function pickTemplate(templates: Template[], type: TemplateType, jobId: string | null): PickedTemplate {
  const active = templates.filter((t) => t.type === type && t.is_default);
  const job = jobId ? active.find((t) => t.job_id === jobId) : undefined;
  if (job) return { source: "job", id: job.id, format: job.format, subject_template: job.subject_template, body_template: job.body_template };
  const global = active.find((t) => t.job_id === null);
  if (global)
    return { source: "global", id: global.id, format: global.format, subject_template: global.subject_template, body_template: global.body_template };
  return { source: "built-in", id: null, ...builtInTemplate(type) };
}
