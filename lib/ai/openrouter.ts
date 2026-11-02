import { AiRequestError, type AiCompletion, type AiProvider, type AiTask } from "./types";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export type OpenRouterOptions = {
  apiKey: string;
  model: string;
  fallbackModel?: string;
  appUrl: string;
  /** Called before every HTTP request (used to count usage and enforce the daily limit). */
  beforeRequest?: (model: string) => Promise<void>;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
};

const defaultSleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function retryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/** OpenRouter (OpenAI-compatible) chat completions with retries, backoff and a fallback model. */
export function createOpenRouterProvider(opts: OpenRouterOptions): AiProvider {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const maxAttempts = opts.maxAttempts ?? 3;

  async function callModel(model: string, task: AiTask): Promise<AiCompletion> {
    let lastError: AiRequestError | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await opts.beforeRequest?.(model);
      let res: Response;
      try {
        res = await fetchImpl(ENDPOINT, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${opts.apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": opts.appUrl,
            "X-Title": "HR Recruiting App",
          },
          body: JSON.stringify({
            model,
            messages: task.messages,
            temperature: task.temperature ?? 0.4,
            max_tokens: task.maxTokens ?? 1500,
            response_format: { type: "json_object" },
            reasoning: { effort: "low", exclude: true },
          }),
          signal: AbortSignal.timeout(60_000),
        });
      } catch (err) {
        lastError = new AiRequestError(`Could not reach OpenRouter: ${err instanceof Error ? err.message : String(err)}`);
        if (attempt < maxAttempts) await sleep(1000 * 2 ** (attempt - 1));
        continue;
      }

      if (res.ok) {
        const json = (await res.json().catch(() => null)) as {
          choices?: { message?: { content?: string | null } }[];
          model?: string;
          error?: { message?: string };
        } | null;
        const content = json?.choices?.[0]?.message?.content;
        if (typeof content === "string" && content.trim()) return { text: content, model: json?.model ?? model };
        lastError = new AiRequestError(json?.error?.message ? `OpenRouter error: ${json.error.message}` : "The model returned an empty answer.");
        if (attempt < maxAttempts) await sleep(1000 * 2 ** (attempt - 1));
        continue;
      }

      const body = await res.text().catch(() => "");
      let message = body.slice(0, 300);
      try {
        message = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? message;
      } catch {
        // keep raw text
      }
      lastError = new AiRequestError(`OpenRouter returned ${res.status}: ${message}`, res.status);
      if (!retryable(res.status)) break;
      if (attempt < maxAttempts) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 10) * 1000 : 1000 * 2 ** (attempt - 1));
      }
    }
    throw lastError ?? new AiRequestError("Unknown OpenRouter error.");
  }

  return {
    name: "openrouter",
    async complete(task) {
      try {
        return await callModel(opts.model, task);
      } catch (err) {
        // 401/402 (bad key / no credit) will fail on the fallback too; do not waste requests.
        if (err instanceof AiRequestError && (err.status === 401 || err.status === 402)) throw err;
        if (opts.fallbackModel && opts.fallbackModel !== opts.model) {
          return callModel(opts.fallbackModel, task);
        }
        throw err;
      }
    },
  };
}
