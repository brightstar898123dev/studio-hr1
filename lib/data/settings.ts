import { getDb } from "@/lib/db/client";
import type { Settings } from "@/lib/types";

export async function getSettings(): Promise<Settings> {
  const db = await getDb();
  const rows = await db.query<Settings>("select * from settings where id = 1");
  if (rows[0]) return rows[0];
  const inserted = await db.query<Settings>("insert into settings (id) values (1) on conflict (id) do update set id = 1 returning *");
  return inserted[0]!;
}

export const SETTINGS_FIELDS = [
  "company_name",
  "logo_url",
  "brand_color",
  "sender_name",
  "sender_email",
  "reply_domain",
  "signature",
  "tone",
  "followup_days",
  "max_followups",
  "daily_send_limit",
  "outreach_batch_size",
  "auto_send",
  "checker_pass_mark",
  "hr_digest_email",
  "default_interview_link",
] as const;

export type SettingsUpdate = Partial<Pick<Settings, (typeof SETTINGS_FIELDS)[number]>>;

export async function updateSettings(patch: SettingsUpdate): Promise<Settings> {
  const db = await getDb();
  const keys = SETTINGS_FIELDS.filter((k) => k in patch);
  if (keys.length === 0) return getSettings();
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
  const values = keys.map((k) => patch[k] ?? null);
  const rows = await db.query<Settings>(`update settings set ${sets} where id = 1 returning *`, values);
  return rows[0]!;
}
