import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { configProblems, env } from "@/lib/config/env";
import { getSettings } from "@/lib/data/settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { CopyField } from "@/components/common/copy-field";
import { SettingsForm } from "./settings-form";
import { TestButtons } from "./test-buttons";
import { registerReplyWebhookAction, sendTestEmailAction } from "./actions";
import { WebhookButton } from "./webhook-button";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireUser();
  const settings = await getSettings();
  const e = env();
  const problems = configProblems(e);
  const webhookUrl = e.inboundWebhookSecret
    ? `${e.appUrl}/api/webhooks/brevo-inbound/${e.inboundWebhookSecret}`
    : null;

  return (
    <>
      <PageHeader title="Settings" description="Company details, sender, limits and automation." />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <SettingsForm settings={settings} />
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>System status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant={e.mockDb ? "warning" : "success"}>{e.mockDb ? "Demo database" : "Supabase database"}</Badge>
                <Badge variant={e.mockEmail ? "warning" : "success"}>{e.mockEmail ? "Emails: test mode" : "Emails: live (Brevo)"}</Badge>
                <Badge variant={e.mockAi ? "warning" : "success"}>{e.mockAi ? "AI: simulated" : "AI: OpenRouter"}</Badge>
              </div>
              {!e.mockAi ? (
                <p className="text-muted-foreground">
                  Model: <code>{e.openrouterModel}</code>
                  {e.openrouterFallbackModel ? (
                    <>
                      {" "}
                      (backup: <code>{e.openrouterFallbackModel}</code>)
                    </>
                  ) : null}
                </p>
              ) : null}
              {problems.length ? (
                <Alert variant="warning" title="Needs attention">
                  <ul className="list-disc space-y-1 pl-4">
                    {problems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </Alert>
              ) : (
                <Alert variant="success">Everything is configured.</Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tests</CardTitle>
              <CardDescription>Check that email and AI work before you go live.</CardDescription>
            </CardHeader>
            <CardContent>
              <TestButtons defaultTo={settings.hr_digest_email ?? settings.sender_email} sendTest={sendTestEmailAction} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Brevo inbound webhook</CardTitle>
              <CardDescription>Paste this URL into Brevo so candidate replies reach the app.</CardDescription>
            </CardHeader>
            <CardContent>
              {webhookUrl ? (
                <div className="space-y-3">
                  <CopyField label="Webhook URL" value={webhookUrl} secret />
                  <WebhookButton action={registerReplyWebhookAction} disabled={e.mockEmail} />
                  {e.mockEmail ? <p className="text-xs text-muted-foreground">Available when MOCK_EMAIL is off.</p> : null}
                </div>
              ) : (
                <Alert variant="warning">Set INBOUND_WEBHOOK_SECRET to get your webhook URL.</Alert>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
