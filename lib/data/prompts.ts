import { getDb } from "@/lib/db/client";
import type { Queryable } from "@/lib/db/types";
import { PROMPT_TYPES, type PromptType } from "@/lib/types";

/** HR-edited global prompts. Types without a row use the built-in default. */
export async function getPromptOverrides(q?: Queryable): Promise<Partial<Record<PromptType, string>>> {
  const db = q ?? (await getDb());
  const rows = await db.query<{ type: PromptType; instructions: string }>("select type, instructions from prompts");
  return Object.fromEntries(rows.map((r) => [r.type, r.instructions]));
}

export async function savePrompt(type: PromptType, instructions: string): Promise<void> {
  if (!(PROMPT_TYPES as readonly string[]).includes(type)) throw new Error("Unknown prompt type");
  const db = await getDb();
  await db.query(
    "insert into prompts (type, instructions) values ($1, $2) on conflict (type) do update set instructions = excluded.instructions",
    [type, instructions],
  );
}

export async function resetPrompt(type: PromptType): Promise<void> {
  const db = await getDb();
  await db.query("delete from prompts where type = $1", [type]);
}
