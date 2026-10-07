/** Loads supabase/seed.sql into DATABASE_URL (dev/test only). */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import postgres from "postgres";

config({ path: process.env.DOTENV_PATH ?? ".env.local" });
if (process.env.APP_ENV === "production") throw new Error("Refusing to load demo seed into production");
const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {}, ssl: process.env.DATABASE_SSL === "true" ? "require" : false });
sql.unsafe(readFileSync("supabase/seed.sql", "utf8"))
  .then(() => console.log("✓ seed loaded"))
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => sql.end());
