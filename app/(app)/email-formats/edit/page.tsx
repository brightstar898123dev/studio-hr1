import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getTemplate } from "@/lib/data/templates";
import { listJobOptions } from "@/lib/data/jobs";
import { getSettings } from "@/lib/data/settings";
import { buildTemplateData } from "@/lib/email/data";
import { EMAIL_TYPE_LABELS, TEMPLATE_TYPES, type TemplateType } from "@/lib/types";
import { PageHeader } from "@/components/ui/misc";
import { TemplateEditor } from "./editor";

export const metadata: Metadata = { title: "Edit email format" };

export default async function EditTemplatePage({ searchParams }: { searchParams: Promise<{ id?: string; type?: string; job?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const template = sp.id ? await getTemplate(sp.id) : null;
  if (sp.id && !template) notFound();
  const type: TemplateType = template?.type ?? ((TEMPLATE_TYPES as readonly string[]).includes(sp.type ?? "") ? (sp.type as TemplateType) : "outreach");
  const [jobs, settings] = await Promise.all([listJobOptions(), getSettings()]);
  const d = buildTemplateData({ settings, job: null, candidate: { name: "Asha Rao" }, subject: "", body: "" });
  const branding = { company_name: d.company_name, logo_url: d.logo_url, brand_color: d.brand_color, signature: d.signature, sender_name: d.sender_name };
  return (
    <>
      <PageHeader
        title={template ? `Edit: ${EMAIL_TYPE_LABELS[template.type]}` : "New email format"}
        description="Paste or upload your own HTML or text, or adjust the built-in design. Changes apply to new drafts."
      />
      <TemplateEditor
        key={template?.id ?? `${type}-${sp.job ?? ""}`}
        template={template}
        initialType={type}
        initialJobId={sp.job ?? null}
        jobs={jobs}
        branding={branding}
      />
    </>
  );
}
