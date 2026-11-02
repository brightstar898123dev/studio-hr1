import { describe, expect, it } from "vitest";
import { renderEmail } from "@/lib/email/render";
import { validateTemplate, checkHtml } from "@/lib/email/validate";
import { pickTemplate } from "@/lib/email/pick-template";
import { DEFAULT_HTML_TEMPLATE, DEFAULT_SUBJECT_TEMPLATE, builtInTemplate } from "@/lib/email/defaults";
import { SAMPLE_DATA, firstName } from "@/lib/email/placeholders";
import { bodyToHtml, bodyToText } from "@/lib/email/body";
import { renderTemplate } from "@/lib/email/engine";
import type { Template } from "@/lib/types";

const html = { format: "html" as const, subject_template: DEFAULT_SUBJECT_TEMPLATE, body_template: DEFAULT_HTML_TEMPLATE };

describe("renderEmail with the built-in template", () => {
  it("fills every placeholder and leaves none behind", () => {
    const out = renderEmail(html, SAMPLE_DATA);
    expect(out.subject).toBe(SAMPLE_DATA.subject);
    expect(out.html).not.toMatch(/\{\{|\}\}/);
    expect(out.text).not.toMatch(/\{\{|\}\}/);
    expect(out.html).toContain("Your Company");
    expect(out.html).toContain('href="https://interview.example.com/your-interview"');
    expect(out.html).toContain("Start your interview");
  });

  it("is email-client safe: table layout, 600px, inline styles, no scripts", () => {
    const out = renderEmail(html, SAMPLE_DATA);
    expect(out.html).toContain('role="presentation"');
    expect(out.html).toContain("max-width:600px");
    expect(out.html).not.toMatch(/<script/i);
    expect(checkHtml(out.html)).toEqual([]);
  });

  it("hides the interview button when there is no link", () => {
    const out = renderEmail(html, { ...SAMPLE_DATA, interview_link: "" });
    expect(out.html).not.toContain("Start your interview");
    expect(out.text).not.toContain("Start your interview");
  });

  it("shows the logo when set, else the company name", () => {
    const withLogo = renderEmail(html, { ...SAMPLE_DATA, logo_url: "https://cdn.example.com/logo.png" });
    expect(withLogo.html).toContain('<img src="https://cdn.example.com/logo.png"');
    const noLogo = renderEmail(html, SAMPLE_DATA);
    expect(noLogo.html).not.toContain("<img");
  });

  it("escapes values so data cannot inject HTML", () => {
    const out = renderEmail(html, { ...SAMPLE_DATA, candidate_name: "<b>x</b>", body: "Hi <script>alert(1)</script>", company_name: 'A "Co"' });
    expect(out.html).not.toContain("<script>");
    expect(out.html).toContain("&lt;script&gt;");
    expect(out.html).toContain("A &quot;Co&quot;");
  });

  it("produces a clean plain-text version", () => {
    const out = renderEmail(html, { ...SAMPLE_DATA, body: "Hello **Asha**,\n\n- one\n- two" });
    expect(out.text).toContain("Hello Asha,");
    expect(out.text).toContain("- one");
    expect(out.text).toContain("https://interview.example.com/your-interview");
    expect(out.text).toContain("Best regards");
    expect(out.text).not.toMatch(/<[a-z]/i);
  });

  it("text-format templates also get a simple HTML version", () => {
    const out = renderEmail(
      { format: "text", subject_template: "{{job_title}}: {{subject}}", body_template: "Hi {{candidate_first_name}},\n\n{{body}}\n\n{{interview_link}}\n\n{{signature}}" },
      SAMPLE_DATA,
    );
    expect(out.subject).toBe("Senior Accountant: Next step for the Senior Accountant role");
    expect(out.text.startsWith("Hi Asha,")).toBe(true);
    expect(out.html).toContain('<a href="https://interview.example.com/your-interview">');
  });
});

describe("body formatting", () => {
  it("turns paragraphs, bold and bullets into HTML", () => {
    const h = bodyToHtml("First line\nsame paragraph\n\n**Bold** and *italic*\n\n- a\n- b");
    expect(h).toContain("First line<br>same paragraph");
    expect(h).toContain("<strong>Bold</strong> and <em>italic</em>");
    expect(h).toMatch(/<ul[^>]*><li[^>]*>a<\/li><li[^>]*>b<\/li><\/ul>/);
  });
  it("strips markdown for text", () => {
    expect(bodyToText("**Bold** *it*\n\n\n\nEnd")).toBe("Bold it\n\nEnd");
  });
});

describe("template engine", () => {
  it("supports sections and inverted sections", () => {
    expect(renderTemplate("{{#a}}yes {{a}}{{/a}}{{^a}}no{{/a}}", { a: "1" }, (_n, v) => v)).toBe("yes 1");
    expect(renderTemplate("{{#a}}yes{{/a}}{{^a}}no{{/a}}", { a: "" }, (_n, v) => v)).toBe("no");
  });
  it("firstName handles titles and spacing", () => {
    expect(firstName("  Dr. Asha  Rao ")).toBe("Asha");
    expect(firstName("Ravi")).toBe("Ravi");
  });
});

describe("template priority", () => {
  const t = (over: Partial<Template>): Template => ({
    id: "t", type: "outreach", job_id: null, name: "", format: "html", subject_template: "{{subject}}",
    body_template: "{{body}}", is_default: true, created_at: "", updated_at: "", ...over,
  });

  it("job template > global template > built-in", () => {
    const global = t({ id: "g", body_template: "GLOBAL {{body}}" });
    const job = t({ id: "j", job_id: "job-1", body_template: "JOB {{body}}" });
    expect(pickTemplate([global, job], "outreach", "job-1")).toMatchObject({ source: "job", id: "j" });
    expect(pickTemplate([global, job], "outreach", "job-2")).toMatchObject({ source: "global", id: "g" });
    expect(pickTemplate([global, job], "followup", "job-1")).toMatchObject({ source: "built-in", id: null });
    expect(pickTemplate([], "outreach", null).body_template).toBe(builtInTemplate("outreach").body_template);
  });

  it("ignores templates that are not active", () => {
    const off = t({ id: "off", is_default: false });
    expect(pickTemplate([off], "outreach", null).source).toBe("built-in");
  });
});

describe("validateTemplate", () => {
  const base = { type: "outreach" as const, format: "html" as const, subject_template: "{{subject}}" };

  it("accepts the built-in templates", () => {
    expect(validateTemplate({ ...base, body_template: DEFAULT_HTML_TEMPLATE })).toEqual([]);
    expect(validateTemplate({ ...base, type: "digest", body_template: builtInTemplate("digest").body_template })).toEqual([]);
  });

  it("rejects unknown placeholders", () => {
    const e = validateTemplate({ ...base, body_template: "<p>{{body}} {{salary}}</p>" });
    expect(e.join(" ")).toContain("Unknown placeholder: {{salary}}");
  });

  it("rejects a missing {{body}}", () => {
    expect(validateTemplate({ ...base, body_template: "<p>Hello</p>" }).join(" ")).toContain("{{body}}");
  });

  it("rejects badly formed HTML", () => {
    expect(validateTemplate({ ...base, body_template: "<div><p>{{body}}</div></span>" }).join(" ")).toMatch(/does not match/);
    expect(validateTemplate({ ...base, body_template: "<table><tr><td>{{body}}</td></tr>" }).join(" ")).toMatch(/<table> is never closed/);
  });

  it("rejects scripts and event handlers", () => {
    expect(validateTemplate({ ...base, body_template: "<div onclick=\"x()\">{{body}}</div>" }).join(" ")).toMatch(/onclick/);
    expect(validateTemplate({ ...base, body_template: "<div>{{body}}</div><script>1</script>" }).join(" ")).toMatch(/script/);
  });

  it("rejects malformed and unclosed placeholders and sections", () => {
    expect(validateTemplate({ ...base, format: "text", body_template: "{{body}} {{ Candidate Name }}" }).length).toBeGreaterThan(0);
    expect(validateTemplate({ ...base, format: "text", body_template: "{{body}} {{#logo_url}} x" }).join(" ")).toMatch(/never closed/);
    expect(validateTemplate({ ...base, format: "text", body_template: "{{body}} {{candidate_name" }).join(" ")).toMatch(/closing/);
  });

  it("requires {{interview_link}} in interview invite templates", () => {
    expect(validateTemplate({ ...base, type: "interview_invite", format: "text", body_template: "{{body}}" }).join(" ")).toMatch(
      /interview_link/,
    );
  });

  it("checks the subject template", () => {
    expect(validateTemplate({ ...base, subject_template: "", format: "text", body_template: "{{body}}" }).length).toBe(1);
    expect(validateTemplate({ ...base, subject_template: "{{nope}}", format: "text", body_template: "{{body}}" }).join(" ")).toMatch(
      /Unknown placeholder in subject/,
    );
  });
});
