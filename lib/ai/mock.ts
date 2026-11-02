import type { AiProvider, AiTask, MockHints } from "./types";

/**
 * MOCK_AI=true: predictable answers with no network and no API key.
 * Emails use only the facts in the hints, so they pass the checker.
 */

function emailFor(h: MockHints): { subject: string; body: string } {
  const name = h.firstName ?? "there";
  const job = h.jobTitle ?? "the role";
  const company = h.companyName ?? "our team";
  switch (h.emailType) {
    case "interview_invite":
      return {
        subject: `Next step for the ${job} role`,
        body: `Hi ${name},\n\nThank you for your interest in the ${job} role at ${company}. The next step is a short online interview that you can take through the link below.\n\nBefore you start, please find a quiet place and check that your camera and microphone work. If anything does not work, just reply to this email and we will help.\n\nWe look forward to learning more about you.`,
      };
    case "followup":
      return {
        subject: `Following up: ${job} role`,
        body: `Hi ${name},\n\nI wanted to follow up on my earlier note about the ${job} role at ${company}.${h.hasLink ? " The interview link is below if you would still like to take it." : ""}\n\nCould you reply to let me know if you are interested? A short answer is perfectly fine, even if the timing is not right for you.`,
      };
    case "feedback": {
      const decision =
        h.decision === "move_forward"
          ? "We are happy to let you know that you are moving to the next stage. HR will be in touch with the next steps."
          : h.decision === "not_selected"
            ? "After careful thought, we will not be moving forward with your application this time. We sincerely appreciate the time you gave us and wish you the very best."
            : h.decision === "on_hold"
              ? "Your application is still being considered, and HR will update you as soon as possible."
              : "HR will share an update with you soon.";
      return {
        subject: `Your interview for the ${job} role`,
        body: `Hi ${name},\n\nThank you for taking the interview for the ${job} role at ${company}. We appreciated the clear way you explained your experience and your thoughtful answers.\n\n${decision}`,
      };
    }
    case "reply":
      switch (h.category) {
        case "interested":
          return {
            subject: `Re: ${job} role`,
            body: `Hi ${name},\n\nThank you for letting us know that you are interested in the ${job} role. I will send you the interview details in a separate email shortly.`,
          };
        case "not_interested":
          return {
            subject: `Re: ${job} role`,
            body: `Hi ${name},\n\nThank you for letting us know about the ${job} role. We understand, and we wish you all the best. We would be glad to hear from you in the future.`,
          };
        case "question":
          return {
            subject: `Re: your question about the ${job} role`,
            body: `Hi ${name},\n\nThank you for your question about the ${job} role. HR will check the details and follow up with you shortly.\n\nIn the meantime, please reply if you would like to continue with the process.`,
          };
        case "reschedule":
          return {
            subject: `Re: timing for the ${job} interview`,
            body: `Hi ${name},\n\nThank you for letting us know. You can take the online interview for the ${job} role at a time that suits you, and HR will get back to you if anything else needs to be arranged.`,
          };
        default:
          return {
            subject: `Re: ${job} role`,
            body: `Hi ${name},\n\nThank you for your message about the ${job} role. HR has received it and will get back to you soon.`,
          };
      }
    case "outreach":
    default:
      return {
        subject: `${job} opportunity at ${company}`,
        body: `Hi ${name},\n\nI am reaching out from ${company} because we are hiring for the ${job} role, and your background caught our attention.\n\nThe role is a chance to work with a supportive team and grow your skills. I would be happy to share more details about the responsibilities and the next steps in our process.\n\nWould you be interested in hearing more? A quick reply to this email is all it takes.`,
      };
  }
}

export function classifyText(text: string): { category: string; confidence: number; summary: string } {
  const t = text.toLowerCase();
  if (/\b(not interested|no thanks|no, thank|accepted (another|an) offer|not looking|decline|pass on this)\b/.test(t))
    return { category: "not_interested", confidence: 0.92, summary: "The candidate is not interested." };
  if (/\b(reschedul|another time|next week|later date|postpone|more time|not available|can we move)\b/.test(t))
    return { category: "reschedule", confidence: 0.85, summary: "The candidate asked to change the interview timing." };
  if (/\b(interested|yes|sounds good|happy to|would love|keen|let'?s proceed|count me in)\b/.test(t))
    return { category: "interested", confidence: 0.9, summary: "The candidate is interested in the role." };
  if (/\?|\b(what is|how much|could you tell|can you share|salary|ctc)\b/.test(t))
    return { category: "question", confidence: 0.8, summary: "The candidate asked a question." };
  return { category: "other", confidence: 0.4, summary: "The message is unclear." };
}

export const mockProvider: AiProvider = {
  name: "mock",
  async complete(task: AiTask) {
    const h = task.mock ?? {};
    let out: unknown;
    switch (task.kind) {
      case "classify_reply":
        out = classifyText(h.replyText ?? "");
        break;
      case "checker":
        out = { score: 9, issues: [] };
        break;
      case "jd_doc":
        out = {
          title: h.docTitle ?? "Job description",
          content: `# ${h.docTitle ?? "Job description"}\n\n## About the role\n${(h.notes ?? "").trim() || "_To confirm: role summary_"}\n\n## What you will do\n- _To confirm: responsibilities_\n\n## What you bring\n- _To confirm: requirements_\n\n## How to apply\nReply to our email to apply.`,
        };
        break;
      case "feedback_doc":
        out = {
          title: h.docTitle ?? "Interview feedback",
          content: `# ${h.docTitle ?? "Interview feedback"}\n\n## Summary\n${(h.notes ?? "").trim() || "_To confirm: summary_"}\n\n## Strengths\n- _To confirm_\n\n## Concerns or gaps\n- _To confirm_\n\n## Recommendation\n_To confirm: recommendation_`,
        };
        break;
      case "test":
        out = { ok: true };
        break;
      default:
        out = emailFor(h);
    }
    return { text: JSON.stringify(out), model: "mock" };
  },
};
