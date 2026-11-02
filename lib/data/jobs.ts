import { getDb } from "@/lib/db/client";
import type { Job } from "@/lib/types";
import type { JobInput } from "@/lib/validation";

const JOB_COLUMNS = [
  "title",
  "status",
  "jd",
  "location",
  "work_mode",
  "salary_range",
  "must_mention",
  "tone",
  "screening_questions",
  "interview_link",
  "prompt_outreach",
  "prompt_interview_invite",
  "prompt_followup",
  "prompt_feedback",
  "reply_notes",
  "feedback_criteria",
] as const;

export type JobWithCounts = Job & { candidate_count: number };

export async function listJobs(): Promise<JobWithCounts[]> {
  const db = await getDb();
  return db.query<JobWithCounts>(
    `select j.*, (select count(*)::int from candidates c where c.job_id = j.id) as candidate_count
     from jobs j
     order by case j.status when 'open' then 0 when 'paused' then 1 else 2 end, j.created_at desc`,
  );
}

export async function listJobOptions(): Promise<Pick<Job, "id" | "title" | "status">[]> {
  const db = await getDb();
  return db.query("select id, title, status from jobs order by title");
}

export async function getJob(id: string): Promise<Job | null> {
  const db = await getDb();
  const rows = await db.query<Job>("select * from jobs where id = $1", [id]);
  return rows[0] ?? null;
}

export async function createJob(input: JobInput): Promise<Job> {
  const db = await getDb();
  const cols = JOB_COLUMNS.join(", ");
  const params = JOB_COLUMNS.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await db.query<Job>(
    `insert into jobs (${cols}) values (${params}) returning *`,
    JOB_COLUMNS.map((c) => (c === "jd" ? (input.jd ?? "") : (input[c] ?? null))),
  );
  return rows[0]!;
}

export async function updateJob(id: string, patch: Partial<JobInput>): Promise<Job | null> {
  const db = await getDb();
  const keys = JOB_COLUMNS.filter((c) => c in patch);
  if (keys.length === 0) return getJob(id);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  const values = keys.map((k) => (k === "jd" ? (patch[k] ?? "") : (patch[k] ?? null)));
  const rows = await db.query<Job>(`update jobs set ${sets} where id = $1 returning *`, [id, ...values]);
  return rows[0] ?? null;
}

export async function deleteJob(id: string): Promise<void> {
  const db = await getDb();
  await db.query("delete from jobs where id = $1", [id]);
}
