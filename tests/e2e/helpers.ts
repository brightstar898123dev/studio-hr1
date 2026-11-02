import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const CRON = { Authorization: "Bearer e2e-cron-secret" };
export const LINK = "https://app.flowmingo.ai/interview/senior-accountant-e2e";

export async function login(page: Page) {
  await page.goto("/login");
  await page.fill("#email", "admin@example.com");
  await page.fill("#password", "e2e-password");
  await page.click("button[type=submit]");
  await expect(page).toHaveURL("/");
}

export async function cron(request: APIRequestContext, job: string) {
  const res = await request.post(`/api/cron/${job}`, { headers: CRON });
  expect(res.status(), `cron ${job}`).toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

export function inboundPayload(opts: { uuid: string; from: string; to: string; text: string; subject?: string }) {
  return {
    items: [
      {
        Uuid: [opts.uuid],
        MessageId: `<${opts.uuid}@mail.example.com>`,
        From: { Name: "Candidate", Address: opts.from },
        To: [{ Name: null, Address: opts.to }],
        Subject: opts.subject ?? "Re: Senior Accountant opportunity",
        RawTextBody: opts.text,
        ExtractedMarkdownMessage: opts.text,
        Headers: {},
      },
    ],
  };
}
