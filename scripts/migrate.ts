/**
 * Portable migration runner. Applies supabase/migrations/*.sql in filename order,
 * each in its own transaction, and records them in app_meta.migrations.
 *
 * - Supabase:   `supabase db push` works too (uses its own tracking table).
 * - AWS / any Postgres:  DATABASE_URL=... npm run db:migrate
 * - `--reset`   drops the app schema first (local/test only; refuses in production).
 */
import { config } from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

config({ path: process.env.DOTENV_PATH ?? ".env.local" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const reset = process.argv.includes("--reset");
  if (reset && process.env.APP_ENV === "production") throw new Error("Refusing to reset a production database");

  const sql = postgres(url, { max: 1, onnotice: () => {}, ssl: process.env.DATABASE_SSL === "true" ? "require" : false });
  try {
    if (reset) {
      await sql.unsafe("drop schema if exists app cascade; drop schema if exists app_meta cascade;");
      console.log("✓ reset app schema");
    }
    await sql.unsafe(
      "create schema if not exists app_meta; create table if not exists app_meta.migrations (name text primary key, applied_at timestamptz not null default now());",
    );
    const dir = path.join(process.cwd(), "supabase", "migrations");
    const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const done = new Set((await sql`select name from app_meta.migrations`).map((r) => r.name as string));
    for (const file of files) {
      if (done.has(file)) continue;
      const body = readFileSync(path.join(dir, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(body);
        await tx`insert into app_meta.migrations (name) values (${file})`;
      });
      console.log(`✓ applied ${file}`);
    }
    console.log("Migrations up to date.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
