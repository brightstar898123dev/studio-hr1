import { expect, test } from "@playwright/test";
import { cron, inboundPayload, LINK, login } from "./helpers";

/**
 * The complete journey from the spec, in mock mode:
 * create job (JD + Flowmingo link) -> import candidate -> run outreach -> draft passes checker
 * -> approve -> mock send -> simulated Brevo reply "interested" -> invite draft has the exact link
 * -> mark interviewed with notes -> feedback draft -> digest generated.
 */
test("full recruiting flow in mock mode", async ({ page, request }) => {
  await login(page);

  // Settings
  await page.goto("/settings");
  await page.fill("#company_name", "Acme Corp");
  await page.fill("#sender_name", "Priya");
  await page.fill("#sender_email", "hr@company.com");
  await page.fill("#reply_domain", "reply.company.com");
  await page.fill("#hr_digest_email", "hr@company.com");
  await page.fill("#signature", "Best regards,\nPriya\nAcme Corp HR");
  await page.click("text=Save settings");
  await expect(page.getByText("Settings saved.")).toBeVisible();

  // 1. Create a job with JD and Flowmingo link
  await page.goto("/jobs/new");
  await page.fill("#title", "Senior Accountant");
  await page.fill("#jd", "# Senior Accountant\n\nOwn the monthly close and work closely with auditors.");
  await page.fill("#location", "Pune");
  await page.selectOption("#work_mode", "hybrid");
  await page.fill("#interview_link", LINK);
  await page.click("text=Create job");
  await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]+$/);

  // 2. Import a candidate from CSV
  await page.goto("/candidates/import");
  await page.click("text=Or paste the CSV text");
  await page.fill("textarea", "Name,Email,Phone\nAsha Rao,asha.rao@example.com,9800000000");
  await page.click("text=Read pasted text");
  await page.selectOption("#import-job", { label: "Senior Accountant" });
  await page.click("button:has-text('Import 1 candidate')");
  await expect(page.getByText("1 imported")).toBeVisible();

  // 3. Run outreach (the scheduled job)
  const outreach = await cron(request, "outreach");
  expect(outreach).toMatchObject({ ok: true, done: true, drafted: 1 });

  // 4. The draft passed the checker and waits for approval
  await page.goto("/outbox?tab=draft");
  const row = page.locator("tbody tr", { hasText: "Asha Rao" });
  await expect(row).toContainText("First outreach");
  await expect(row).toContainText("9/10");
  await row.getByRole("button", { name: "Asha Rao" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Checks (0)")).toBeVisible();
  const preview = drawer.frameLocator("iframe[title='Email preview']");
  await expect(preview.getByText("Hi Asha,")).toBeVisible();

  // 5. Approve, then the mock send
  await drawer.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("1 email approved")).toBeVisible();
  const send = await cron(request, "send-approved");
  expect(send).toMatchObject({ sent: 1, failed: 0 });
  await page.goto("/outbox?tab=sent");
  await expect(page.locator("tbody tr", { hasText: "Asha Rao" })).toBeVisible();

  // The candidate moved to Contacted and we know their reply address
  await page.goto("/candidates");
  await page.getByRole("link", { name: "Asha Rao" }).click();
  await expect(page.getByText("Contacted").first()).toBeVisible();
  const replyTo = (await page.locator("code", { hasText: "@reply.company.com" }).innerText()).trim();
  expect(replyTo).toMatch(/^[a-f0-9]{16}@reply\.company\.com$/);
  const candidateUrl = page.url();

  // 6. Simulated Brevo inbound reply "interested"
  const hook = await request.post("/api/webhooks/brevo-inbound/e2e-inbound-secret", {
    data: inboundPayload({ uuid: "e2e-reply-1", from: "asha.rao@example.com", to: replyTo, text: "Yes, I'm interested. Happy to take the next step." }),
  });
  expect(hook.status()).toBe(200);
  expect(await hook.json()).toMatchObject({ ok: true, results: ["pending"] });

  // 7. The invite draft appears and contains the exact Flowmingo link
  await expect(async () => {
    await page.goto("/outbox?tab=draft");
    await expect(page.locator("tbody tr", { hasText: "Interview invite" })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 60_000 });
  await page.locator("tbody tr", { hasText: "Interview invite" }).getByRole("button", { name: "Asha Rao" }).click();
  const invite = page.getByRole("dialog");
  await expect(invite.frameLocator("iframe[title='Email preview']").locator(`a[href="${LINK}"]`).first()).toBeVisible();
  await invite.getByRole("tab", { name: "Plain text" }).click();
  await expect(invite.locator("pre")).toContainText(LINK);
  await page.keyboard.press("Escape");

  // 8. Mark interviewed with HR notes -> feedback draft
  await page.goto(candidateUrl);
  await expect(page.getByText("Interested").first()).toBeVisible();
  await page.fill("#hr_notes", "Strong month-end close experience. Clear communicator. Could deepen audit knowledge.");
  await page.click("form >> button:has-text('Save')");
  await expect(page.getByText("Candidate saved.")).toBeVisible();
  await page.click("button:has-text('Mark interviewed')");
  await expect(page.getByText("Asha Rao moved.")).toBeVisible();
  const stage = await cron(request, "stage-emails");
  expect(stage).toMatchObject({ ok: true, drafted: 1 });
  await page.goto("/outbox?tab=draft");
  await expect(page.locator("tbody tr", { hasText: "Feedback" })).toBeVisible();

  // 9. Daily digest is generated and sent (to the mock mailbox)
  const digest = await cron(request, "daily-digest");
  expect(digest).toMatchObject({ ok: true, sent: true, to: "hr@company.com" });
  expect(String(digest.subject)).toContain("to approve");
  await page.goto("/activity");
  await expect(page.getByText("Daily digest sent to hr@company.com")).toBeVisible();
  await expect(page.getByText(/Reply classified as interested/)).toBeVisible();
});
