import { describe, expect, it, vi } from "vitest";
import { runRules, findDateTimes, type RuleInput } from "@/lib/checker/rules";
import { draftWithChecks, type FlowDeps } from "@/lib/checker/flow";
import { renderEmail } from "@/lib/email/render";
import { builtInTemplate } from "@/lib/email/defaults";
import { SAMPLE_DATA } from "@/lib/email/placeholders";

const LINK = "https://interview.example.com/abc";
const GOOD_BODY =
  "Hi Asha,\n\nThank you for your interest in the Senior Accountant role. The next step is a short online interview that you can take through the link below.\n\nPlease find a quiet place and check your camera and microphone before you start. If anything does not work, just reply to this email.";

function input(over: Partial<RuleInput> & { body?: string; subject?: string; link?: string | null } = {}): RuleInput {
  const body = over.body ?? GOOD_BODY;
  const subject = over.subject ?? "Next step for the Senior Accountant role";
  const link = over.link === undefined ? LINK : over.link;
  const rendered = renderEmail(builtInTemplate("interview_invite"), { ...SAMPLE_DATA, body, subject, interview_link: link ?? "" });
  return {
    type: "interview_invite",
    subject,
    body,
    html: rendered.html,
    text: rendered.text,
    firstName: "Asha",
    jobTitle: "Senior Accountant",
    requiresLink: true,
    interviewLink: link,
    salaryAllowed: false,
    dataText: "Job description: monthly close. Interviews close on 15 March.",
    senderName: "Priya",
    companyName: "Acme",
    ...over,
  };
}

const rulesOf = (i: RuleInput) => runRules(i).issues.map((x) => x.rule);

describe("checker rules", () => {
  it("a good invite passes every rule", () => {
    expect(runRules(input())).toEqual({ passed: true, issues: [] });
  });

  it("first name: pass / fail", () => {
    expect(rulesOf(input())).not.toContain("first_name");
    expect(rulesOf(input({ body: GOOD_BODY.replace("Hi Asha", "Hi there") }))).toContain("first_name");
    // Not fooled by a longer word containing the name.
    expect(rulesOf(input({ firstName: "Ash", body: GOOD_BODY.replace("Asha", "Ashani") }))).toContain("first_name");
  });

  it("exact job title: pass / fail (case and spelling must match)", () => {
    expect(rulesOf(input({ body: GOOD_BODY.replace("Senior Accountant", "senior accountant"), subject: "Next step" }))).toContain("job_title");
    expect(rulesOf(input({ subject: "Next step" }))).not.toContain("job_title"); // still in body
  });

  it("link: required, present and exactly equal", () => {
    expect(rulesOf(input({ link: null }))).toContain("link_missing");
    const wrong = input();
    expect(rulesOf({ ...wrong, interviewLink: "https://interview.example.com/OTHER" })).toContain("link_mismatch");
    const extra = input();
    expect(rulesOf({ ...extra, html: extra.html.replace("</body>", '<a href="https://evil.example.com">x</a></body>') })).toContain("link_mismatch");
    expect(rulesOf({ ...input({ link: null }), requiresLink: false })).not.toContain("link_missing");
  });

  it("no URLs or email addresses written by the AI", () => {
    expect(rulesOf(input({ body: `${GOOD_BODY} Visit https://acme.example.com today.` }))).toContain("no_urls");
    expect(rulesOf(input({ body: `${GOOD_BODY} See www.acme.example.com.` }))).toContain("no_urls");
    expect(rulesOf(input({ body: `${GOOD_BODY} See acme.com.` }))).toContain("no_urls");
    expect(rulesOf(input({ body: `${GOOD_BODY} Write to hr@company.com.` }))).toContain("no_emails");
    expect(rulesOf(input())).not.toContain("no_urls");
  });

  it("no unfilled placeholders", () => {
    for (const p of ["[Name]", "{{candidate_name}}", "<name>", "[Company]", "XYZ", "{first name}"]) {
      expect(rulesOf(input({ body: `${GOOD_BODY} ${p}` })), p).toContain("placeholders");
    }
    expect(rulesOf(input())).not.toContain("placeholders");
  });

  it("salary only when the job has a salary range", () => {
    const withSalary = `${GOOD_BODY} The salary is 8 LPA.`;
    expect(rulesOf(input({ body: withSalary }))).toContain("salary");
    expect(rulesOf(input({ body: `${GOOD_BODY} The CTC is great.` }))).toContain("salary");
    expect(rulesOf(input({ body: withSalary, salaryAllowed: true }))).not.toContain("salary");
  });

  it("no dates or times that are not in the data", () => {
    expect(rulesOf(input({ body: `${GOOD_BODY} Please finish by 20 March at 5 pm.` }))).toContain("dates");
    expect(rulesOf(input({ body: `${GOOD_BODY} Please finish by Friday.` }))).toContain("dates");
    expect(rulesOf(input({ body: `${GOOD_BODY} Interviews close on 15 March.` }))).not.toContain("dates");
    expect(findDateTimes("Meet 10:30 am on 2026-03-01, or tomorrow")).toEqual(expect.arrayContaining(["10:30 am", "2026-03-01", "tomorrow"]));
  });

  it("subject present and within length", () => {
    expect(rulesOf(input({ subject: "" }))).toContain("subject_missing");
    expect(rulesOf(input({ subject: "x".repeat(130) + " Senior Accountant" }))).toContain("subject_length");
  });

  it("body length within limits for the type", () => {
    expect(rulesOf(input({ body: "Hi Asha, Senior Accountant interview below." }))).toContain("body_length");
    expect(rulesOf(input({ body: `${GOOD_BODY} ${"word ".repeat(200)}` }))).toContain("body_length");
  });

  it("no sign-off written by the AI", () => {
    expect(rulesOf(input({ body: `${GOOD_BODY}\n\nBest regards,\nPriya` }))).toContain("sign_off");
    expect(rulesOf(input({ body: `${GOOD_BODY}\n\nThanks,` }))).toContain("sign_off");
    expect(rulesOf(input({ body: `${GOOD_BODY}\n\nAcme` }))).toContain("sign_off");
    expect(rulesOf(input({ body: `${GOOD_BODY} Thank you for your time and interest.` }))).not.toContain("sign_off");
  });

  it("well-formed HTML", () => {
    const i = input();
    expect(rulesOf({ ...i, html: i.html.replace("</table>", "") })).toContain("html");
  });
});

describe("check -> rewrite -> needs_review flow", () => {
  const good = { subject: "S", body: "good" };
  const bad = { subject: "S", body: "bad" };
  const deps = (over: Partial<FlowDeps>): FlowDeps => ({
    generate: vi.fn(async () => good),
    render: (d) => ({ subject: d.subject, html: "<p>x</p>", text: d.body }),
    rules: (d) => (d.body === "bad" ? { passed: false, issues: [{ rule: "first_name", message: "Use the name", source: "rules" }] } : { passed: true, issues: [] }),
    aiCheck: vi.fn(async () => ({ score: 9, issues: [] })),
    passMark: 8,
    ...over,
  });

  it("passes first time: status draft, no rewrite", async () => {
    const r = await draftWithChecks(deps({}));
    expect(r).toMatchObject({ status: "draft", passedBoth: true, score: 9, rewriteCount: 0 });
  });

  it("rule failure -> one rewrite with the issues -> passes", async () => {
    const generate = vi.fn().mockResolvedValueOnce(bad).mockResolvedValueOnce(good);
    const aiCheck = vi.fn(async () => ({ score: 9, issues: [] }));
    const r = await draftWithChecks(deps({ generate, aiCheck }));
    expect(r).toMatchObject({ status: "draft", passedBoth: true, rewriteCount: 1, draft: good });
    expect(generate.mock.calls[1]![0]).toEqual({ previous: bad, issues: ["Use the name"] });
    expect(aiCheck).toHaveBeenCalledTimes(1); // skipped while rules failed
  });

  it("still failing after the rewrite -> needs_review with issues", async () => {
    const generate = vi.fn(async () => bad);
    const r = await draftWithChecks(deps({ generate }));
    expect(r.status).toBe("needs_review");
    expect(r.passedBoth).toBe(false);
    expect(r.rewriteCount).toBe(1);
    expect(r.issues.map((i) => i.rule)).toContain("first_name");
    expect(generate).toHaveBeenCalledTimes(2); // only ONE automatic rewrite
  });

  it("AI score below the pass mark -> rewrite -> still low -> needs_review with score", async () => {
    const aiCheck = vi.fn(async () => ({ score: 5, issues: ["Invented a benefit"] }));
    const r = await draftWithChecks(deps({ aiCheck }));
    expect(r).toMatchObject({ status: "needs_review", score: 5, rewriteCount: 1 });
    expect(r.issues).toContainEqual({ rule: "ai_check", message: "Invented a benefit", source: "ai" });
  });

  it("AI checker error -> needs_review (no blind rewrite)", async () => {
    const generate = vi.fn(async () => good);
    const r = await draftWithChecks(deps({ generate, aiCheck: async () => { throw new Error("timeout"); } }));
    expect(r.status).toBe("needs_review");
    expect(r.issues[0]!.rule).toBe("ai_check_failed");
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("AI writer error -> needs_review with an explanation", async () => {
    const r = await draftWithChecks(deps({ generate: async () => { throw new Error("limit reached"); } }));
    expect(r.status).toBe("needs_review");
    expect(r.issues[0]!.message).toMatch(/limit reached/);
  });
});
