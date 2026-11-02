/**
 * Applies database migrations to DATABASE_URL (your Supabase database).
 * The app also does this automatically on start-up; this is for doing it by hand.
 *   DATABASE_URL=... npm run db:migrate
 */
import { createPgDb } from "../lib/db/pg";
import { migrate } from "../lib/db/migrate";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const db = createPgDb(url);
  try {
    const applied = await migrate(db);
    console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is already up to date.");
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
