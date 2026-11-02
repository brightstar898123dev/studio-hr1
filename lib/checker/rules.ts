import { checkHtml } from "@/lib/email/validate";
import { EMAIL_LENGTH } from "@/lib/prompts/defaults";
import type { CheckerIssue, EmailType } from "@/lib/types";

/**
 * Deterministic checks that run on every draft before it reaches the Outbox,
 * and again before sending if HR edited the email.
 */

export type RuleInput = {
  type: EmailType;
  subject: string;
  /** The AI-written body (plain paragraphs). */
  body: string;
  /** Final rendered versions. */
  html: string;
  text: string;
  firstName: string;
  jobTitle: string | null;
  /** True when this email must contain the interview link. */
  requiresLink: boolean;
  /** The resolved interview link (candidate > job > settings), or null. */
  interviewLink: string | null;
  /** True only if the job has a salary_range. */
  salaryAllowed: boolean;
  /** All data the email was written from (used to verify dates/times). */
  dataText: string;
  senderName?: string;
  companyName?: string;
};

export type RuleResult = { passed: boolean; issues: CheckerIssue[] };

export const SUBJECT_MIN = 3;
export const SUBJECT_MAX = 120;

const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|in|io|ai|org|net|co|me|app|dev|info|biz|us|uk|xyz)\b(?:\/\S*)?/gi;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g;

const PLACEHOLDER_RES: RegExp[] = [
  /\{\{[^}]*\}\}/,
  /\{[A-Za-z _]+\}/,
  /\[(?:[A-Z][A-Za-z ]{1,30}|name|first name|company|job title|role|date|time|link|your name|candidate)\]/,
  /<(?:name|first[_ ]?name|company|job[_ ]?title|role|date|time|link|candidate)>/i,
  /\bX{3,}\b|\bXYZ\b|\bTBD\b|\binsert (?:here|name|link|date)\b|\blorem ipsum\b/i,
];

const SALARY_RE =
  /\b(?:salary|salaries|ctc|lpa|compensation|remuneration|stipend|pay ?scale|pay ?range|package)\b|₹|\brs\.?\s?\d|\binr\s?\d|\$\s?\d|\b\d+(?:\.\d+)?\s?(?:k|lakhs?|lacs?|crores?)\b|\bper (?:annum|month|year)\b/i;

const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const DATE_TIME_RES: RegExp[] = [
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTHS})\\b`, "gi"),
  new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, "gi"),
  /\b\d{1,4}[/-]\d{1,2}[/-]\d{1,4}\b/g,
  /\b\d{1,2}:\d{2}\s?(?:am|pm|hrs)?\b/gi,
  /\b\d{1,2}\s?(?:am|pm)\b/gi,
  /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
  /\b(?:tomorrow|tonight|next week|next month|this weekend|end of (?:the )?(?:day|week|month))\b/gi,
];

const SIGN_OFF_RE =
  /^(?:(?:best|kind|warm|warmest|many)\s+(?:regards|wishes|thanks)|regards|thanks(?: again)?|thank you|cheers|sincerely|yours(?: (?:sincerely|truly|faithfully))?|best|all the best|talk soon|take care)[,.!]?$/i;

function issue(rule: string, message: string): CheckerIssue {
  return { rule, message, source: "rules" };
}

function words(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findUrls(s: string): string[] {
  return [...s.matchAll(URL_RE)].map((m) => m[0]);
}
export function findEmails(s: string): string[] {
  return [...s.matchAll(EMAIL_RE)].map((m) => m[0]);
}
export function findDateTimes(s: string): string[] {
  const out: string[] = [];
  for (const re of DATE_TIME_RES) for (const m of s.matchAll(re)) out.push(m[0]);
  return [...new Set(out.map((x) => x.trim()))];
}

function hrefsIn(html: string): string[] {
  return [...html.matchAll(/\bhref\s*=\s*"([^"]*)"/gi)].map((m) => m[1]!.replace(/&amp;/g, "&"));
}

export function runRules(input: RuleInput): RuleResult {
  const issues: CheckerIssue[] = [];
  const subject = input.subject.trim();
  const body = input.body.trim();
  const ai = `${subject}\n${body}`;

  // Subject present and within length.
  if (!subject) issues.push(issue("subject_missing", "The subject line is empty."));
  else if (subject.length < SUBJECT_MIN || subject.length > SUBJECT_MAX)
    issues.push(issue("subject_length", `The subject must be ${SUBJECT_MIN}-${SUBJECT_MAX} characters (now ${subject.length}).`));
  if (/[\r\n]/.test(input.subject)) issues.push(issue("subject_length", "The subject must be a single line."));

  // Candidate first name.
  if (input.firstName && !new RegExp(`(^|[^\\p{L}])${escapeRe(input.firstName)}([^\\p{L}]|$)`, "u").test(body)) {
    issues.push(issue("first_name", `The email must greet the candidate by first name ("${input.firstName}").`));
  }

  // Exact job title.
  if (input.jobTitle && !ai.includes(input.jobTitle.trim())) {
    issues.push(issue("job_title", `The exact job title "${input.jobTitle.trim()}" must appear in the email.`));
  }

  // Interview link: present and exactly equal to the resolved link.
  if (input.requiresLink) {
    if (!input.interviewLink) {
      issues.push(issue("link_missing", "This email needs an interview link, but none is set."));
    } else {
      const hrefs = hrefsIn(input.html);
      const linkHrefs = hrefs.filter((h) => /^https?:/i.test(h));
      if (!hrefs.includes(input.interviewLink) || !input.text.includes(input.interviewLink)) {
        issues.push(issue("link_mismatch", "The interview link is missing from the email or does not exactly match the link on file."));
      } else if (linkHrefs.some((h) => h !== input.interviewLink && !isTemplateAsset(h))) {
        issues.push(issue("link_mismatch", "The email contains a link that is not the interview link."));
      }
    }
  }

  // No URLs or email addresses written by the AI.
  const urls = findUrls(ai);
  if (urls.length) issues.push(issue("no_urls", `Remove the link(s) the AI wrote: ${urls.slice(0, 3).join(", ")}. The system adds links.`));
  const emails = findEmails(ai);
  if (emails.length) issues.push(issue("no_emails", `Remove the email address(es): ${emails.slice(0, 3).join(", ")}.`));

  // No unfilled placeholders, in the AI text or the final email.
  if (PLACEHOLDER_RES.some((re) => re.test(ai)) || /\{\{|\}\}/.test(input.text) || /\{\{|\}\}/.test(input.html)) {
    issues.push(issue("placeholders", "The email contains an unfilled placeholder such as [Name] or {{...}}."));
  }

  // No salary unless the job has a salary range.
  if (!input.salaryAllowed && SALARY_RE.test(ai)) {
    issues.push(issue("salary", "The email mentions salary or pay, but this job has no salary range. Remove it."));
  }

  // No dates/times that are not in the data.
  const data = input.dataText.toLowerCase();
  const unknownDates = findDateTimes(ai).filter((d) => !data.includes(d.toLowerCase()));
  if (unknownDates.length) {
    issues.push(issue("dates", `The email mentions dates or times that are not in the data: ${unknownDates.slice(0, 4).join(", ")}.`));
  }

  // Body length within limits for the type.
  const len = EMAIL_LENGTH[input.type];
  const n = words(body);
  if (n < len.minWords || n > len.maxWords) {
    issues.push(issue("body_length", `The body should be ${len.minWords}-${len.maxWords} words for this email type (now ${n}).`));
  }

  // No sign-off written by the AI (the template adds the signature).
  const lastLines = body.split("\n").map((l) => l.trim()).filter(Boolean).slice(-3);
  const names = [input.senderName, input.companyName].filter(Boolean).map((s) => s!.trim().toLowerCase());
  if (
    lastLines.some((l) => SIGN_OFF_RE.test(l.replace(/\s+/g, " "))) ||
    (lastLines.length > 0 && names.includes(lastLines[lastLines.length - 1]!.toLowerCase().replace(/[.,!]$/, "")))
  ) {
    issues.push(issue("sign_off", 'Remove the sign-off (e.g. "Best regards" or a name). The template adds the signature.'));
  }

  // Well-formed HTML.
  const htmlErrors = checkHtml(input.html);
  if (htmlErrors.length) issues.push(issue("html", `The email HTML is not well formed: ${htmlErrors[0]}`));

  return { passed: issues.length === 0, issues };
}

/** Image sources and similar are not links; anchors other than the interview link are. */
function isTemplateAsset(href: string): boolean {
  return /^mailto:/i.test(href);
}
