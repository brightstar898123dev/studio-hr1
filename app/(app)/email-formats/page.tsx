import type { Metadata } from "next";
import Link from "next/link";
import { Pencil, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listTemplates } from "@/lib/data/templates";
import { EMAIL_TYPE_LABELS, TEMPLATE_TYPES } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/misc";
import { formatDate } from "@/components/common/status";

export const metadata: Metadata = { title: "Email Formats" };

export default async function EmailFormatsPage() {
  await requireUser();
  const templates = await listTemplates();
  return (
    <>
      <PageHeader
        title="Email Formats"
        description="How emails look. The AI writes the text; the format adds your branding, the interview button and your signature."
        actions={
          <Button asChild>
            <Link href="/email-formats/edit?type=outreach">
              <Plus /> New format
            </Link>
          </Button>
        }
      />
      <div className="grid gap-4 md:grid-cols-2">
        {TEMPLATE_TYPES.map((type) => {
          const forType = templates.filter((t) => t.type === type);
          const global = forType.find((t) => t.job_id === null);
          const perJob = forType.filter((t) => t.job_id !== null);
          return (
            <Card key={type}>
              <CardHeader>
                <CardTitle>{EMAIL_TYPE_LABELS[type]}</CardTitle>
                <CardDescription>
                  {type === "digest" ? "The evening summary sent to you." : "Used for all jobs unless a job has its own format."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">All jobs</p>
                    <p className="text-xs text-muted-foreground">
                      {global ? `Custom · updated ${formatDate(global.updated_at)}` : "Built-in default"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={global ? "default" : "secondary"}>{global ? "Custom" : "Default"}</Badge>
                    <Button asChild size="sm" variant="outline">
                      <Link href={global ? `/email-formats/edit?id=${global.id}` : `/email-formats/edit?type=${type}`}>
                        <Pencil /> Edit
                      </Link>
                    </Button>
                  </div>
                </div>
                {perJob.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">{t.job_title}</p>
                      <p className="text-xs text-muted-foreground">Job format · updated {formatDate(t.updated_at)}</p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/email-formats/edit?id=${t.id}`}>
                        <Pencil /> Edit
                      </Link>
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
