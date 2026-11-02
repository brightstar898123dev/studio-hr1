import { aiJson } from "@/lib/ai/client";
import { CheckerResultSchema } from "@/lib/ai/schemas";
import type { Draft, Rendered } from "@/lib/checker/flow";
import { runRules, type RuleResult } from "@/lib/checker/rules";
import { getPromptOverrides } from "@/lib/data/prompts";
import { resolveTemplate } from "@/lib/data/templates";
import { getDb } from "@/lib/db/client";
import { buildTemplateData } from "@/lib/email/data";
import { firstName } from "@/lib/email/placeholders";
import type { PickedTemplate } from "@/lib/email/pick-template";
import { renderEmail } from "@/lib/email/render";
import { resolveInterviewLink } from "@/lib/links/resolve";
import { EMAIL_PROMPT_FOR_REPLY } from "@/lib/prompts/defaults";
import { buildCheckerMessages, buildContext, resolveInstructions, type HistoryItem, type ResolvedInstructions } from "@/lib/prompts/resolve";
import type { Candidate, EmailType, Job, PromptType, ReplyCategory, Settings } from "@/lib/types";

/** True for emails that must carry the interview link. */
export function emailNeedsLink(type: EmailType, stage: string): boolean {
  return type === "interview_invite" || (type === "followup" && stage === "interview_invited");
}

export type DraftEnv = {
  settings: Settings;
  job: Job | null;
  candidate: Candidate;
  type: EmailType;
  promptType: PromptType;
  instructions: ResolvedInstructions;
  overrides: Partial<Record<PromptType, string>>;
  context: string;
  needsLink: boolean;
  /** The resolved link when this email needs one (else null). */
  interviewLink: string | null;
  /** The resolved link regardless of need (null if none is set anywhere). */
  anyLink: string | null;
  template: PickedTemplate;
  render: (d: Draft) => Rendered;
  rules: (d: Draft, r: Rendered) => RuleResult;
  aiCheck: (d: Draft) => Promise<{ score: number; issues: string[] }>;
};

/** Loads everything needed to write, render and check one email. */
export async function prepareDraft(input: {
  settings: Settings;
  job: Job | null;
  candidate: Candidate;
  type: EmailType;
  reply?: { subject: string | null; text: string; category: ReplyCategory };
  /** Link stored on the outbox row (re-checks keep the link the email was drafted with, unless it was removed). */
  storedLink?: string | null;
}): Promise<DraftEnv> {
  const { settings, job, candidate, type } = input;
  const db = await getDb();
  const needsLink = emailNeedsLink(type, candidate.stage) || (type === "followup" && !!input.storedLink);
  const resolved = resolveInterviewLink({
    candidateOverride: candidate.interview_link_override,
    jobLink: job?.interview_link,
    defaultLink: settings.default_interview_link,
  });
  const anyLink = resolved?.link ?? null;
  const interviewLink = needsLink ? anyLink : null;

  const history = await db.query<HistoryItem>(
    "select direction, subject, body_text, created_at from (select * from messages where candidate_id = $1 order by created_at desc limit 10) m order by created_at asc",
    [candidate.id],
  );
  const followupNumber = type === "followup" ? candidate.followup_count + 1 : undefined;
  const context = buildContext({
    settings,
    job,
    candidate,
    history,
    emailType: type,
    interviewLink,
    followup: followupNumber ? { number: followupNumber, max: settings.max_followups } : undefined,
    latestReply: input.reply ? { subject: input.reply.subject, text: input.reply.text } : undefined,
    replyCategory: input.reply?.category,
  });
  const promptType: PromptType = type === "reply" ? EMAIL_PROMPT_FOR_REPLY[input.reply?.category ?? "other"] : type;
  const overrides = await getPromptOverrides();
  const instructions = resolveInstructions(promptType, job, overrides);
  const template = await resolveTemplate(type, job?.id ?? null);

  const render = (d: Draft): Rendered =>
    renderEmail(template, buildTemplateData({ settings, job, candidate, subject: d.subject, body: d.body, interviewLink }));

  const rules = (d: Draft, r: Rendered) =>
    runRules({
      type,
      subject: d.subject,
      body: d.body,
      html: r.html,
      text: r.text,
      firstName: firstName(candidate.name),
      jobTitle: job?.title ?? null,
      requiresLink: needsLink,
      interviewLink,
      salaryAllowed: !!job?.salary_range?.trim(),
      dataText: context,
      senderName: settings.sender_name,
      companyName: settings.company_name,
    });

  const aiCheck = async (d: Draft) => {
    const checkerPrompt = resolveInstructions("checker", null, overrides);
    const res = await aiJson(
      { kind: "checker", messages: buildCheckerMessages(checkerPrompt.text, context, { type, ...d }), temperature: 0 },
      CheckerResultSchema,
    );
    return res.data;
  };

  return { settings, job, candidate, type, promptType, instructions, overrides, context, needsLink, interviewLink, anyLink, template, render, rules, aiCheck };
}

export async function loadJob(jobId: string | null): Promise<Job | null> {
  if (!jobId) return null;
  const db = await getDb();
  return (await db.query<Job>("select * from jobs where id = $1", [jobId]))[0] ?? null;
}
