import { getDb } from "@/lib/db/client";
import type { Queryable } from "@/lib/db/types";
import { pickTemplate, type PickedTemplate } from "@/lib/email/pick-template";
import type { Template, TemplateType } from "@/lib/types";

export async function listTemplates(): Promise<(Template & { job_title: string | null })[]> {
  const db = await getDb();
  return db.query(
    "select t.*, j.title as job_title from templates t left join jobs j on j.id = t.job_id order by t.type, j.title nulls first",
  );
}

export async function getTemplate(id: string): Promise<Template | null> {
  const db = await getDb();
  return (await db.query<Template>("select * from templates where id = $1", [id]))[0] ?? null;
}

export async function resolveTemplate(type: TemplateType, jobId: string | null, q?: Queryable): Promise<PickedTemplate> {
  const db = q ?? (await getDb());
  const rows = await db.query<Template>(
    "select * from templates where type = $1 and is_default and (job_id is null or job_id = $2)",
    [type, jobId],
  );
  return pickTemplate(rows, type, jobId);
}

export type TemplateSave = {
  type: TemplateType;
  job_id: string | null;
  name: string;
  format: "html" | "text";
  subject_template: string;
  body_template: string;
};

/** One active template per type and scope (global or a job). Saving replaces it. */
export async function saveTemplate(input: TemplateSave): Promise<Template> {
  const db = await getDb();
  return db.tx(async (q) => {
    const existing = await q.query<Template>(
      "select * from templates where type = $1 and job_id is not distinct from $2 and is_default for update",
      [input.type, input.job_id],
    );
    if (existing[0]) {
      const rows = await q.query<Template>(
        "update templates set name = $2, format = $3, subject_template = $4, body_template = $5 where id = $1 returning *",
        [existing[0].id, input.name, input.format, input.subject_template, input.body_template],
      );
      return rows[0]!;
    }
    const rows = await q.query<Template>(
      `insert into templates (type, job_id, name, format, subject_template, body_template, is_default)
       values ($1, $2, $3, $4, $5, $6, true) returning *`,
      [input.type, input.job_id, input.name, input.format, input.subject_template, input.body_template],
    );
    return rows[0]!;
  });
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await getDb();
  await db.query("delete from templates where id = $1", [id]);
}
