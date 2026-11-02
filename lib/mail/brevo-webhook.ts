/**
 * Registers the inbound (reply) webhook in Brevo, so replies sent to
 * <anything>@<reply domain> are POSTed to this app. Brevo has no screen for this,
 * only the API, so the Settings page offers a button that calls it.
 */
export async function registerBrevoInboundWebhook(opts: {
  apiKey: string;
  url: string;
  domain: string;
  fetchImpl?: typeof fetch;
}): Promise<{ ok: true; id: string | null; already: boolean } | { ok: false; error: string }> {
  const f = opts.fetchImpl ?? fetch;
  const headers = { "api-key": opts.apiKey, "Content-Type": "application/json", Accept: "application/json" };
  // Do not create a duplicate if one already points to this URL.
  const list = await f("https://api.brevo.com/v3/webhooks?type=inbound", { headers, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (list?.ok) {
    const json = (await list.json().catch(() => ({}))) as { webhooks?: { id?: number; url?: string }[] };
    const found = json.webhooks?.find((w) => w.url === opts.url);
    if (found) return { ok: true, id: found.id ? String(found.id) : null, already: true };
  }
  const res = await f("https://api.brevo.com/v3/webhooks", {
    method: "POST",
    headers,
    body: JSON.stringify({
      type: "inbound",
      events: ["inboundEmailProcessed"],
      url: opts.url,
      domain: opts.domain,
      description: "HR recruiting app - candidate replies",
    }),
    signal: AbortSignal.timeout(20_000),
  }).catch((err: unknown) => ({ ok: false, status: 0, text: async () => String(err) }) as unknown as Response);
  if (res.ok) {
    const json = (await res.json().catch(() => ({}))) as { id?: number };
    return { ok: true, id: json.id ? String(json.id) : null, already: false };
  }
  const body = await res.text().catch(() => "");
  let message = body.slice(0, 300);
  try {
    message = (JSON.parse(body) as { message?: string }).message ?? message;
  } catch {
    // keep raw
  }
  return { ok: false, error: `Brevo returned ${res.status}: ${message}` };
}
