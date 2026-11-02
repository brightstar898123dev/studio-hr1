import type { ChatMessage } from "@/lib/prompts/resolve";
import type { PromptType } from "@/lib/types";

/** Structured facts the mock AI uses to produce realistic, deterministic output. */
export type MockHints = {
  firstName?: string;
  jobTitle?: string;
  companyName?: string;
  emailType?: string;
  hasLink?: boolean;
  decision?: string | null;
  replyText?: string;
  category?: string;
  docTitle?: string;
  notes?: string;
  /** Rewrites: the issues the checker found, so the mock can "fix" them. */
  fixIssues?: string[];
};

export type AiTask = {
  kind: PromptType | "test";
  messages: ChatMessage[];
  mock?: MockHints;
  maxTokens?: number;
  temperature?: number;
};

export type AiCompletion = { text: string; model: string };

export interface AiProvider {
  readonly name: string;
  complete(task: AiTask): Promise<AiCompletion>;
}

export class AiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiError";
  }
}
/** The daily request limit (OPENROUTER_DAILY_LIMIT) has been reached. */
export class AiLimitError extends AiError {
  constructor(limit: number) {
    super(`The daily AI limit (${limit} requests) has been reached. Drafting resumes tomorrow, or raise OPENROUTER_DAILY_LIMIT on a paid plan.`);
    this.name = "AiLimitError";
  }
}
/** The model did not return valid JSON, even after one retry. */
export class AiJsonError extends AiError {
  constructor(detail: string) {
    super(`The AI did not return a valid answer (${detail}).`);
    this.name = "AiJsonError";
  }
}
export class AiRequestError extends AiError {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "AiRequestError";
  }
}
