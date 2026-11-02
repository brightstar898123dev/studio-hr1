import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { inboundPayload, login } from "./helpers";

test("pages need a login; cron and webhook need their secrets", async ({ page, request }) => {
  await page.goto("/outbox");
  await expect(page).toHaveURL(/\/login$/);
  expect((await request.post("/api/cron/outreach")).status()).toBe(401);
  expect((await request.post("/api/cron/outreach", { headers: { Authorization: "Bearer wrong" } })).status()).toBe(401);
  const hook = await request.post("/api/webhooks/brevo-inbound/wrong-secret", {
    data: inboundPayload({ uuid: "x", from: "a@example.com", to: "b@example.com", text: "hi" }),
  });
  expect(hook.status()).toBe(404);
  const bad = await request.post("/api/webhooks/brevo-inbound/e2e-inbound-secret", { data: { items: [{}] } });
  expect(bad.status()).toBe(400);
});

test("template editor blocks invalid templates", async ({ page }) => {
  await login(page);
  await page.goto("/email-formats/edit?type=outreach");
  await page.waitForLoadState("networkidle"); // let React take over the editor before typing
  await page.locator("textarea[aria-label=Template]").fill("<div>{{candidate_name}} {{salary}}</div>");
  await expect(page.getByText("Unknown placeholder: {{salary}}")).toBeVisible();
  await expect(page.getByText("The template must include {{body}}")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save format" })).toBeDisabled();
});

test("home and outbox have no accessibility violations", async ({ page }) => {
  await login(page);
  for (const path of ["/", "/outbox", "/candidates", "/settings"]) {
    await page.goto(path);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).exclude("iframe").analyze();
    expect(r.violations.map((v) => v.id), path).toEqual([]);
  }
});
