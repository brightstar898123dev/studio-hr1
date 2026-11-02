#!/usr/bin/env node
/**
 * Copies supabase/migrations/*.sql (and the local shim) into a TypeScript module,
 * so the app can apply migrations on start-up without reading files at runtime
 * (Vercel functions do not ship arbitrary files).
 *
 * Usage: node scripts/bundle-migrations.mjs          (write the file)
 *        node scripts/bundle-migrations.mjs --check  (exit 1 if out of date)
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const dir = join(root, "supabase", "migrations");
const out = join(root, "lib", "db", "migrations.generated.ts");

const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const migrations = files.map((name) => ({ name, sql: readFileSync(join(dir, name), "utf8") }));
const shim = readFileSync(join(root, "supabase", "local-shim.sql"), "utf8");

const content = `// GENERATED FILE - do not edit. Run \`node scripts/bundle-migrations.mjs\` after changing supabase/migrations.
export const MIGRATIONS: ReadonlyArray<{ name: string; sql: string }> = ${JSON.stringify(migrations, null, 2)};

export const LOCAL_SHIM_SQL: string = ${JSON.stringify(shim)};
`;

if (process.argv.includes("--check")) {
  const current = existsSync(out) ? readFileSync(out, "utf8") : "";
  if (current !== content) {
    console.error("lib/db/migrations.generated.ts is out of date. Run: node scripts/bundle-migrations.mjs");
    process.exit(1);
  }
  console.log("Migrations bundle is up to date.");
} else {
  writeFileSync(out, content);
  console.log(`Bundled ${migrations.length} migration(s) into lib/db/migrations.generated.ts`);
}
