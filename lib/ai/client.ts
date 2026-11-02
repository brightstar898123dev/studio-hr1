import type { z } from "zod";
import { env } from "@/lib/config/env";
import { parseJsonAs } from "./json";
import { mockProvider } from "./mock";
import { createOpenRouterProvider } from "./openrouter";
import { AiError, AiJsonError, AiLimitError, type AiProvider, type AiTask } from "./types";
import { aiUsageToday, bumpAiUsage } from "./usage";

let override: AiProvider | undefined;

/** Tests plug in their own fake AI here. */
export function setAiProviderForTests(p: AiProvider | undefined): void {
  override = p;
}

function provider(): AiProvider {
  if (override) return override;
  const e = env();
  if (e.mockAi) return mockProvider;
  if (!e.openrouterApiKey) throw new AiError("OPENROUTER_API_KEY is not set, so the AI cannot run. Add it, or set MOCK_AI=true for testing.");
  return createOpenRouterProvider({
    apiKey: e.openrouterApiKey,
    model: e.openrouterModel,
    fallbackModel: e.openrouterFallbackModel,
    appUrl: e.appUrl,
    beforeRequest: async (model) => {
      // Check first, then count, so we never go over the free-tier limit.
      if ((await aiUsageToday()) >= e.aiDailyLimit) throw new AiLimitError(e.aiDailyLimit);
      await bumpAiUsage(model);
    },
  });
}

/**
 * Runs an AI task that must answer with JSON matching `schema`.
 * Invalid JSON gets ONE retry (with a reminder); after that an AiJsonError is thrown
 * and callers fall back safely (e.g. the draft goes to "needs review").
 */
export async function aiJson<T>(task: AiTask, schema: z.ZodType<T>): Promise<{ data: T; model: string }> {
  const p = provider();
  const usesMock = p === mockProvider || p.name === "mock" || p.name === "test";
  const first = await p.complete(task);
  if (usesMock) await bumpAiUsage(first.model).catch(() => undefined);
  const parsed = parseJsonAs(first.text, schema);
  if (parsed.ok) return { data: parsed.data, model: first.model };

  const retryTask: AiTask = {
    ...task,
    messages: [
      ...task.messages,
      { role: "assistant", content: first.text.slice(0, 4000) },
      {
        role: "user",
        content: `That reply was not valid (${parsed.error}). Reply again with ONLY the JSON object in exactly the required format. No code fences, no other text.`,
      },
    ],
  };
  const second = await p.complete(retryTask);
  if (usesMock) await bumpAiUsage(second.model).catch(() => undefined);
  const again = parseJsonAs(second.text, schema);
  if (again.ok) return { data: again.data, model: second.model };
  throw new AiJsonError(again.error);
}

export { AiError, AiJsonError, AiLimitError };
