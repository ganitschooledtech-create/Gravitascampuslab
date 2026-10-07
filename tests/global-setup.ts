import { execSync } from "node:child_process";

/** Fresh database for every test run: reset → migrate → seed. */
export default function setup() {
  const env = { ...process.env, DOTENV_PATH: ".env.test" };
  execSync("npx tsx scripts/migrate.ts --reset", { stdio: "ignore", env });
  execSync("npx tsx scripts/seed.ts", { stdio: "ignore", env });
}
