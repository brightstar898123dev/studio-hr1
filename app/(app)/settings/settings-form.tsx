"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { Switch } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useActionToast } from "@/components/forms/use-action-toast";
import type { Settings } from "@/lib/types";
import { saveSettingsAction } from "./actions";

export function SettingsForm({ settings }: { settings: Settings }) {
  const { formAction, pending, errors } = useActionToast(saveSettingsAction);
  const [autoSend, setAutoSend] = useState(settings.auto_send);
  const [color, setColor] = useState(settings.brand_color);

  return (
    <form action={formAction} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Company and branding</CardTitle>
          <CardDescription>Shown in every email header and signature.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" htmlFor="company_name" error={errors.company_name}>
            <Input id="company_name" name="company_name" defaultValue={settings.company_name} required />
          </Field>
          <Field label="Logo link (optional)" htmlFor="logo_url" error={errors.logo_url} help="A https:// link to your logo image. Leave empty to show the company name instead.">
            <Input id="logo_url" name="logo_url" type="url" defaultValue={settings.logo_url ?? ""} placeholder="https://company.com/logo.png" />
          </Field>
          <Field label="Brand colour" htmlFor="brand_color" error={errors.brand_color}>
            <div className="flex items-center gap-2">
              <input
                aria-label="Pick brand colour"
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(color) ? color : "#2563eb"}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border"
              />
              <Input id="brand_color" name="brand_color" value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
          </Field>
          <Field label="Signature" htmlFor="signature" error={errors.signature} help="Added to the end of every email. The AI never writes its own sign-off." className="sm:col-span-2">
            <Textarea id="signature" name="signature" rows={4} defaultValue={settings.signature} placeholder={"Best regards,\nPriya Sharma\nHR, Company"} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sender</CardTitle>
          <CardDescription>Who the emails come from, and where replies go.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Sender name" htmlFor="sender_name" error={errors.sender_name}>
            <Input id="sender_name" name="sender_name" defaultValue={settings.sender_name} required />
          </Field>
          <Field label="Sender email" htmlFor="sender_email" error={errors.sender_email} help="Your Zoho address, e.g. hr@company.com. Its domain must be verified in Brevo.">
            <Input id="sender_email" name="sender_email" type="email" defaultValue={settings.sender_email} placeholder="hr@company.com" />
          </Field>
          <Field label="Reply domain" htmlFor="reply_domain" error={errors.reply_domain} help="Replies go to an address at this domain and are read by the app. Example: reply.company.com">
            <Input id="reply_domain" name="reply_domain" defaultValue={settings.reply_domain} placeholder="reply.company.com" />
          </Field>
          <Field label="Daily digest goes to" htmlFor="hr_digest_email" error={errors.hr_digest_email} help="Your inbox for the 7 pm summary.">
            <Input id="hr_digest_email" name="hr_digest_email" type="email" defaultValue={settings.hr_digest_email ?? ""} placeholder="hr@company.com" />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Writing and interviews</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Tone" htmlFor="tone" error={errors.tone} help="How emails should sound. Jobs can override this.">
            <Input id="tone" name="tone" defaultValue={settings.tone} required />
          </Field>
          <Field label="Default interview link" htmlFor="default_interview_link" error={errors.default_interview_link} help="Used only when a job and candidate have no Flowmingo link.">
            <Input id="default_interview_link" name="default_interview_link" type="url" defaultValue={settings.default_interview_link ?? ""} placeholder="https://..." />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Automation</CardTitle>
          <CardDescription>Limits keep you inside the free plans and protect your sender reputation.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Field label="Follow up after (days)" htmlFor="followup_days" error={errors.followup_days}>
            <Input id="followup_days" name="followup_days" type="number" min={1} max={60} defaultValue={settings.followup_days} />
          </Field>
          <Field label="Max follow-ups" htmlFor="max_followups" error={errors.max_followups}>
            <Input id="max_followups" name="max_followups" type="number" min={0} max={10} defaultValue={settings.max_followups} />
          </Field>
          <Field label="Daily send limit" htmlFor="daily_send_limit" error={errors.daily_send_limit} help="Brevo free plan: 300 per day.">
            <Input id="daily_send_limit" name="daily_send_limit" type="number" min={0} max={300} defaultValue={settings.daily_send_limit} />
          </Field>
          <Field label="Outreach batch size" htmlFor="outreach_batch_size" error={errors.outreach_batch_size} help="New candidates drafted per run.">
            <Input id="outreach_batch_size" name="outreach_batch_size" type="number" min={1} max={200} defaultValue={settings.outreach_batch_size} />
          </Field>
          <Field label="Checker pass mark (0-10)" htmlFor="checker_pass_mark" error={errors.checker_pass_mark} help="AI quality score needed to pass.">
            <Input id="checker_pass_mark" name="checker_pass_mark" type="number" min={0} max={10} defaultValue={settings.checker_pass_mark} />
          </Field>
          <div className="sm:col-span-3 space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">Send automatically</p>
                <p className="text-sm text-muted-foreground">
                  When on, emails that pass both checks are sent without your approval.
                </p>
              </div>
              <input type="hidden" name="auto_send" value={autoSend ? "on" : "off"} />
              {autoSend ? (
                <Switch checked aria-label="Send automatically" onCheckedChange={() => setAutoSend(false)} />
              ) : (
                <ConfirmDialog
                  trigger={<Switch checked={false} aria-label="Send automatically" />}
                  title="Turn on automatic sending?"
                  description="Emails that pass the checker will go to candidates without you seeing them first. Emails that need review, have a missing link, or answer an unclear reply will still wait for you. You must click Save to apply this."
                  confirmLabel="Turn on"
                  onConfirm={() => setAutoSend(true)}
                />
              )}
            </div>
            {autoSend ? (
              <Alert variant="warning" title="Automatic sending is on">
                Emails that pass the checks will be sent without your approval. Keep this off until you have tested with your own email address.
              </Alert>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex justify-end border-t bg-background/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : "Save settings"}
        </Button>
      </div>
    </form>
  );
}
