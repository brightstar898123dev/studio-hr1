"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { updateSettings } from "@/lib/data/settings";
import { fieldErrors, SettingsSchema, type ActionResult } from "@/lib/validation";

export async function saveSettingsAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  await requireUser();
  const raw = Object.fromEntries(form.entries());
  const parsed = SettingsSchema.safeParse({ ...raw, auto_send: form.get("auto_send") === "on" });
  if (!parsed.success) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  }
  await updateSettings(parsed.data);
  await logActivity({
    actor: "hr",
    action: "settings.updated",
    entity: "settings",
    details: { auto_send: parsed.data.auto_send, daily_send_limit: parsed.data.daily_send_limit },
  });
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved." };
}

export async function testAiAction(): Promise<ActionResult> {
  await requireUser();
  const { env } = await import("@/lib/config/env");
  const { aiJson, AiError } = await import("@/lib/ai/client");
  const { z } = await import("zod");
  const e = env();
  const started = Date.now();
  try {
    const res = await aiJson(
      {
        kind: "test",
        messages: [
          { role: "system", content: 'You are a connection test. Reply with ONLY this JSON object: {"ok": true}' },
          { role: "user", content: "Connection test." },
        ],
        maxTokens: 200,
        temperature: 0,
      },
      z.object({ ok: z.boolean() }),
    );
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    await logActivity({ actor: "hr", action: "ai.tested", details: { model: res.model, ok: true } });
    if (e.mockAi) return { ok: true, message: "AI is in test mode (MOCK_AI=true): simulated answers work. Set MOCK_AI=false to test OpenRouter." };
    return { ok: true, message: `AI works. Model ${res.model} answered in ${secs}s. This used 1 request.` };
  } catch (err) {
    const msg = err instanceof AiError ? err.message : err instanceof Error ? err.message : String(err);
    await logActivity({ actor: "hr", action: "ai.tested", details: { ok: false, error: msg } });
    return { ok: false, error: `AI test failed: ${msg}` };
  }
}

export async function sendTestEmailAction(): Promise<ActionResult> {
  await requireUser();
  const { getSettings } = await import("@/lib/data/settings");
  const { resolveTemplate } = await import("@/lib/data/templates");
  const { buildTemplateData } = await import("@/lib/email/data");
  const { renderEmail } = await import("@/lib/email/render");
  const { sendMail } = await import("@/lib/mail");
  const { env } = await import("@/lib/config/env");
  const s = await getSettings();
  const to = s.hr_digest_email || s.sender_email;
  if (!to) return { ok: false, error: "Add your email under 'Daily digest goes to' (or the sender email) and save first." };
  if (!s.sender_email && !env().mockEmail) return { ok: false, error: "Add the sender email and save first." };
  const template = await resolveTemplate("outreach", null);
  const email = renderEmail(
    template,
    buildTemplateData({
      settings: s,
      job: { title: "Test Role" },
      candidate: { name: "Test Candidate" },
      subject: `Test email from ${s.company_name}`,
      body: "Hi there,\n\nThis is a **test email** from your HR recruiting app. If you can read this, sending works.\n\nCheck that it arrived in your inbox (not spam), and that the colours, logo and signature look right.",
      interviewLink: "https://interview.example.com/test",
    }),
  );
  try {
    const res = await sendMail({
      to: { email: to },
      from: { email: s.sender_email || "hr@example.com", name: s.sender_name },
      subject: email.subject,
      html: email.html,
      text: email.text,
      kind: "test",
    });
    await logActivity({ actor: "hr", action: "email.test_sent", details: { to, mock: res.mock } });
    return {
      ok: true,
      message: res.mock ? `Test mode: the email to ${to} was recorded but not sent (MOCK_EMAIL=true).` : `Test email sent to ${to}. Check your inbox and spam folder.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logActivity({ actor: "hr", action: "email.test_failed", details: { to, error: msg } });
    return { ok: false, error: `Could not send: ${msg}` };
  }
}

export async function registerReplyWebhookAction(): Promise<ActionResult> {
  await requireUser();
  const { env } = await import("@/lib/config/env");
  const { getSettings } = await import("@/lib/data/settings");
  const { registerBrevoInboundWebhook } = await import("@/lib/mail/brevo-webhook");
  const e = env();
  const s = await getSettings();
  const domain = s.reply_domain || e.replyDomain;
  if (!e.brevoApiKey) return { ok: false, error: "Add BREVO_API_KEY first (in Vercel), then redeploy." };
  if (!e.inboundWebhookSecret) return { ok: false, error: "Add INBOUND_WEBHOOK_SECRET first (in Vercel), then redeploy." };
  if (!domain) return { ok: false, error: "Fill in the reply domain above and save first." };
  if (!e.appUrl.startsWith("https://")) return { ok: false, error: "NEXT_PUBLIC_APP_URL must be your live https:// address for Brevo to reach the app." };
  const url = `${e.appUrl}/api/webhooks/brevo-inbound/${e.inboundWebhookSecret}`;
  const res = await registerBrevoInboundWebhook({ apiKey: e.brevoApiKey, url, domain });
  await logActivity({ actor: "hr", action: "brevo.webhook_registered", details: { ok: res.ok, domain, error: res.ok ? undefined : res.error } });
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, message: res.already ? "Already connected: Brevo sends replies to this app." : `Connected. Replies to ...@${domain} now reach the app.` };
}
