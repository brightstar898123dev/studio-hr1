import { describe, expect, it } from "vitest";
import { CandidateSchema, isValidEmail, isValidHttpsUrl, JobSchema, SettingsSchema } from "@/lib/validation";
import { renderMarkdown } from "@/lib/markdown";

describe("isValidHttpsUrl", () => {
  it.each([
    ["https://app.flowmingo.ai/interview/abc123", true],
    ["https://example.com", true],
    ["http://example.com", false],
    ["ftp://example.com", false],
    ["https://", false],
    ["https://localhost", false],
    ["https://exa mple.com", false],
    ["example.com", false],
    ["", false],
    [null, false],
  ])("%s -> %s", (url, ok) => {
    expect(isValidHttpsUrl(url as string | null)).toBe(ok);
  });
});

describe("schemas", () => {
  it("job interview link must be https", () => {
    expect(JobSchema.safeParse({ title: "Dev", interview_link: "http://example.com" }).success).toBe(false);
    const ok = JobSchema.parse({ title: " Dev ", interview_link: "", salary_range: "  " });
    expect(ok).toMatchObject({ title: "Dev", interview_link: null, salary_range: null, status: "open", jd: "" });
  });

  it("candidate email is normalised to lower case", () => {
    expect(CandidateSchema.parse({ name: "Asha", email: " Asha@Example.COM " }).email).toBe("asha@example.com");
    expect(CandidateSchema.safeParse({ name: "Asha", email: "not-an-email" }).success).toBe(false);
  });

  it("settings validates numbers, colour and domain", () => {
    const base = {
      company_name: "Acme",
      brand_color: "#2563eb",
      sender_name: "HR",
      sender_email: "hr@company.com",
      reply_domain: "reply.company.com",
      signature: "",
      tone: "warm",
      followup_days: "3",
      max_followups: "2",
      daily_send_limit: "100",
      outreach_batch_size: "20",
      auto_send: false,
      checker_pass_mark: "8",
    };
    expect(SettingsSchema.safeParse(base).success).toBe(true);
    expect(SettingsSchema.safeParse({ ...base, brand_color: "blue" }).success).toBe(false);
    expect(SettingsSchema.safeParse({ ...base, reply_domain: "https://reply.company.com" }).success).toBe(false);
    expect(SettingsSchema.safeParse({ ...base, daily_send_limit: "500" }).success).toBe(false);
  });

  it("isValidEmail", () => {
    expect(isValidEmail("a@mail.example.com")).toBe(true);
    expect(isValidEmail("a@b")).toBe(false);
  });
});

describe("renderMarkdown", () => {
  it("renders markdown but never raw HTML or javascript links", () => {
    const html = renderMarkdown("# Hi\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1)) [y](https://example.com)");
    expect(html).toContain("<h1>Hi</h1>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="https://example.com"');
  });
});
