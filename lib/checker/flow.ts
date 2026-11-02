import type { CheckerIssue } from "@/lib/types";
import type { RuleResult } from "./rules";

export type Draft = { subject: string; body: string };
export type Rendered = { subject: string; html: string; text: string };
export type AiCheck = { score: number; issues: string[] };

export type FlowDeps = {
  /** Writes a draft. With `feedback`, rewrites the previous draft to fix the issues. */
  generate: (feedback?: { previous: Draft; issues: string[] }) => Promise<Draft>;
  render: (draft: Draft) => Rendered;
  rules: (draft: Draft, rendered: Rendered) => RuleResult;
  aiCheck: (draft: Draft) => Promise<AiCheck>;
  passMark: number;
};

export type FlowResult = {
  status: "draft" | "needs_review";
  /** True only when BOTH the rules and the AI check passed (required for auto-send). */
  passedBoth: boolean;
  draft: Draft;
  rendered: Rendered;
  score: number | null;
  issues: CheckerIssue[];
  rewriteCount: number;
};

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type Round = { draft: Draft; rendered: Rendered; rules: RuleResult; ai: AiCheck | null; aiError: string | null };

async function checkRound(deps: FlowDeps, draft: Draft): Promise<Round> {
  const rendered = deps.render(draft);
  const rules = deps.rules(draft, rendered);
  // Rule failures already mean a rewrite: skip the AI check to save free-tier requests.
  if (!rules.passed) return { draft, rendered, rules, ai: null, aiError: null };
  try {
    return { draft, rendered, rules, ai: await deps.aiCheck(draft), aiError: null };
  } catch (err) {
    return { draft, rendered, rules, ai: null, aiError: describe(err) };
  }
}

function roundIssues(r: Round): CheckerIssue[] {
  const out: CheckerIssue[] = [...r.rules.issues];
  if (r.ai) out.push(...r.ai.issues.map((m) => ({ rule: "ai_check", message: m, source: "ai" as const })));
  if (r.aiError) out.push({ rule: "ai_check_failed", message: `The AI checker could not run: ${r.aiError}`, source: "system" });
  return out;
}

function passed(r: Round, passMark: number): boolean {
  return r.rules.passed && !!r.ai && r.ai.score >= passMark;
}

const EMPTY: Rendered = { subject: "", html: "", text: "" };

/**
 * Draft -> rules + AI check -> pass? done.
 * Fail -> one automatic rewrite with the issue list -> re-check.
 * Still failing, or the AI checker errors -> "needs_review" with score and issues stored.
 */
export async function draftWithChecks(deps: FlowDeps): Promise<FlowResult> {
  let first: Draft;
  try {
    first = await deps.generate();
  } catch (err) {
    return {
      status: "needs_review",
      passedBoth: false,
      draft: { subject: "", body: "" },
      rendered: EMPTY,
      score: null,
      issues: [{ rule: "ai_failed", message: `The AI could not write this email: ${describe(err)} Please write it yourself or re-check later.`, source: "system" }],
      rewriteCount: 0,
    };
  }

  const r1 = await checkRound(deps, first);
  if (passed(r1, deps.passMark)) {
    return { status: "draft", passedBoth: true, draft: first, rendered: r1.rendered, score: r1.ai!.score, issues: roundIssues(r1), rewriteCount: 0 };
  }
  if (r1.aiError) {
    // The checker itself failed: do not rewrite blindly, ask HR.
    return { status: "needs_review", passedBoth: false, draft: first, rendered: r1.rendered, score: null, issues: roundIssues(r1), rewriteCount: 0 };
  }

  const feedback = roundIssues(r1).map((i) => i.message);
  if (r1.ai && r1.ai.score < deps.passMark && feedback.length === 0) {
    feedback.push(`The quality score was ${r1.ai.score}/10; improve accuracy, tone and clarity.`);
  }

  let second: Draft;
  try {
    second = await deps.generate({ previous: first, issues: feedback });
  } catch (err) {
    const issues = [...roundIssues(r1), { rule: "rewrite_failed", message: `The automatic rewrite failed: ${describe(err)}`, source: "system" as const }];
    return { status: "needs_review", passedBoth: false, draft: first, rendered: r1.rendered, score: r1.ai?.score ?? null, issues, rewriteCount: 1 };
  }

  const r2 = await checkRound(deps, second);
  const ok = passed(r2, deps.passMark);
  return {
    status: ok ? "draft" : "needs_review",
    passedBoth: ok,
    draft: second,
    rendered: r2.rendered,
    score: r2.ai?.score ?? null,
    issues: roundIssues(r2),
    rewriteCount: 1,
  };
}
