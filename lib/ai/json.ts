import type { z } from "zod";

/** Pulls the first JSON object out of a model reply (handles code fences and extra text). */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/^﻿/, "").trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1]!.trim() : cleaned;
  try {
    return JSON.parse(candidate);
  } catch {
    // Find the first balanced {...} block.
    const start = candidate.indexOf("{");
    if (start < 0) throw new Error("no JSON object found");
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < candidate.length; i++) {
      const ch = candidate[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return JSON.parse(candidate.slice(start, i + 1));
      }
    }
    throw new Error("unfinished JSON object");
  }
}

export function parseJsonAs<T>(text: string, schema: z.ZodType<T>): { ok: true; data: T } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "invalid JSON" };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: `${first?.path.join(".") || "value"}: ${first?.message ?? "wrong shape"}` };
  }
  return { ok: true, data: parsed.data };
}
