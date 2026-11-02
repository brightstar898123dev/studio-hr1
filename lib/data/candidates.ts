import { getDb } from "@/lib/db/client";
import type { Queryable } from "@/lib/db/types";
import type { Candidate, Stage } from "@/lib/types";
import { CandidateSchema, type CandidateInput } from "@/lib/validation";

const CANDIDATE_COLUMNS = [
  "name",
  "email",
  "phone",
  "job_id",
  "stage",
  "source",
  "profile_notes",
  "interview_link_override",
  "hr_notes",
  "decision",
] as const;

export type CandidateListItem = Candidate & { job_title: string | null };

export async function listCandidates(filter: { q?: string; jobId?: string; stage?: string } = {}): Promise<
  CandidateListItem[]
> {
  const db = await getDb();
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.q) {
    params.push(`%${filter.q.trim()}%`);
    where.push(`(c.name ilike $${params.length} or c.email::text ilike $${params.length} or c.phone ilike $${params.length})`);
  }
  if (filter.jobId) {
    params.push(filter.jobId);
    where.push(`c.job_id = $${params.length}`);
  }
  if (filter.stage) {
    params.push(filter.stage);
    where.push(`c.stage = $${params.length}`);
  }
  return db.query<CandidateListItem>(
    `select c.*, j.title as job_title from candidates c left join jobs j on j.id = c.job_id
     ${where.length ? `where ${where.join(" and ")}` : ""}
     order by c.updated_at desc limit 2000`,
    params,
  );
}

export async function getCandidate(id: string, q?: Queryable): Promise<Candidate | null> {
  const db = q ?? (await getDb());
  const rows = await db.query<Candidate>("select * from candidates where id = $1", [id]);
  return rows[0] ?? null;
}

export async function findCandidateByEmail(email: string, q?: Queryable): Promise<Candidate | null> {
  const db = q ?? (await getDb());
  const rows = await db.query<Candidate>("select * from candidates where email = $1", [email.trim()]);
  return rows[0] ?? null;
}

export async function findCandidateByReplyToken(token: string, q?: Queryable): Promise<Candidate | null> {
  const db = q ?? (await getDb());
  const rows = await db.query<Candidate>("select * from candidates where reply_token = $1", [token.trim().toLowerCase()]);
  return rows[0] ?? null;
}

export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`A candidate with the email ${email} already exists.`);
    this.name = "DuplicateEmailError";
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505";
}

export async function createCandidate(input: CandidateInput): Promise<Candidate> {
  const db = await getDb();
  const cols = CANDIDATE_COLUMNS.join(", ");
  const params = CANDIDATE_COLUMNS.map((_, i) => `$${i + 1}`).join(", ");
  try {
    const rows = await db.query<Candidate>(
      `insert into candidates (${cols}) values (${params}) returning *`,
      CANDIDATE_COLUMNS.map((c) => input[c] ?? null),
    );
    return rows[0]!;
  } catch (err) {
    if (isUniqueViolation(err) || String(err).includes("duplicate key")) throw new DuplicateEmailError(input.email);
    throw err;
  }
}

export async function updateCandidate(id: string, patch: Partial<CandidateInput & { do_not_email: boolean }>) {
  const db = await getDb();
  const allowed = [...CANDIDATE_COLUMNS, "do_not_email"] as const;
  const keys = allowed.filter((c) => c in patch);
  if (keys.length === 0) return getCandidate(id);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  try {
    const rows = await db.query<Candidate>(`update candidates set ${sets} where id = $1 returning *`, [
      id,
      ...keys.map((k) => (patch as Record<string, unknown>)[k] ?? null),
    ]);
    return rows[0] ?? null;
  } catch (err) {
    if (isUniqueViolation(err) || String(err).includes("duplicate key")) throw new DuplicateEmailError(String(patch.email));
    throw err;
  }
}

export async function setCandidateStage(id: string, stage: Stage, q?: Queryable): Promise<Candidate | null> {
  const db = q ?? (await getDb());
  const rows = await db.query<Candidate>("update candidates set stage = $2 where id = $1 returning *", [id, stage]);
  return rows[0] ?? null;
}

export async function deleteCandidate(id: string): Promise<void> {
  const db = await getDb();
  await db.query("delete from candidates where id = $1", [id]);
}

export type ImportRow = { name?: string; email?: string; phone?: string; source?: string; profile_notes?: string };
export type ImportResult = {
  created: number;
  duplicates: string[];
  invalid: { row: number; reason: string }[];
};

/** Imports many candidates. Existing emails are skipped (never overwritten). */
export async function importCandidates(rows: ImportRow[], jobId: string | null): Promise<ImportResult> {
  const db = await getDb();
  const result: ImportResult = { created: 0, duplicates: [], invalid: [] };
  const seen = new Set<string>();
  for (const [i, raw] of rows.entries()) {
    const parsed = CandidateSchema.safeParse({ ...raw, job_id: jobId, stage: "new" });
    if (!parsed.success) {
      result.invalid.push({ row: i + 1, reason: parsed.error.issues[0]?.message ?? "Invalid row" });
      continue;
    }
    const email = parsed.data.email;
    if (seen.has(email)) {
      result.duplicates.push(email);
      continue;
    }
    seen.add(email);
    const inserted = await db.query<{ id: string }>(
      `insert into candidates (name, email, phone, job_id, stage, source, profile_notes)
       values ($1, $2, $3, $4, 'new', $5, $6)
       on conflict (email) do nothing returning id`,
      [parsed.data.name, email, parsed.data.phone, jobId, parsed.data.source ?? "CSV import", parsed.data.profile_notes],
    );
    if (inserted.length) result.created += 1;
    else result.duplicates.push(email);
  }
  return result;
}

export async function stageCounts(): Promise<Record<string, number>> {
  const db = await getDb();
  const rows = await db.query<{ stage: string; n: number }>("select stage, count(*)::int as n from candidates group by stage");
  return Object.fromEntries(rows.map((r) => [r.stage, r.n]));
}
