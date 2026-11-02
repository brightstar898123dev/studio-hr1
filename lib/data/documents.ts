import { getDb } from "@/lib/db/client";
import type { DocumentRow } from "@/lib/types";

export type DocumentListItem = DocumentRow & { job_title: string | null; candidate_name: string | null };

export async function listDocuments(): Promise<DocumentListItem[]> {
  const db = await getDb();
  return db.query(
    `select d.*, j.title as job_title, c.name as candidate_name from documents d
     left join jobs j on j.id = d.job_id left join candidates c on c.id = d.candidate_id
     order by d.updated_at desc limit 500`,
  );
}

export async function getDocument(id: string): Promise<DocumentListItem | null> {
  const db = await getDb();
  return (
    (
      await db.query<DocumentListItem>(
        `select d.*, j.title as job_title, c.name as candidate_name from documents d
         left join jobs j on j.id = d.job_id left join candidates c on c.id = d.candidate_id where d.id = $1`,
        [id],
      )
    )[0] ?? null
  );
}

export async function insertDocument(d: Pick<DocumentRow, "type" | "title" | "job_id" | "candidate_id" | "notes" | "content">): Promise<DocumentRow> {
  const db = await getDb();
  const rows = await db.query<DocumentRow>(
    "insert into documents (type, title, job_id, candidate_id, notes, content) values ($1, $2, $3, $4, $5, $6) returning *",
    [d.type, d.title, d.job_id, d.candidate_id, d.notes, d.content],
  );
  return rows[0]!;
}

export async function updateDocument(id: string, patch: Partial<Pick<DocumentRow, "title" | "content" | "status" | "job_id" | "candidate_id" | "notes">>) {
  const db = await getDb();
  const keys = (["title", "content", "status", "job_id", "candidate_id", "notes"] as const).filter((k) => k in patch);
  if (!keys.length) return getDocument(id);
  await db.query(`update documents set ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} where id = $1`, [id, ...keys.map((k) => patch[k] ?? null)]);
  return getDocument(id);
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await getDb();
  await db.query("delete from documents where id = $1", [id]);
}
