import postgres from "postgres";

export const sql = postgres(process.env.DATABASE_URL!, { max: 2, onnotice: () => {}, transform: { column: { from: postgres.toCamel } } });

/** Same id scheme as scripts/generate-seed.ts — look users up by email/username instead of guessing ids. */
export async function userId(emailOrUsername: string): Promise<string> {
  const [r] = await sql`select u.id from app.users u left join app.school_learners sl on sl.user_id = u.id
                        where u.email = ${emailOrUsername} or sl.username = ${emailOrUsername}`;
  if (!r) throw new Error("no user " + emailOrUsername);
  return r.id;
}

/** Run queries exactly as the app does for a signed-in user: restricted role + user id. Always rolled back. */
export async function asUser<T>(uid: string | null, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  let result: T;
  try {
    await sql.begin(async (tx) => {
      await tx`select set_config('app.user_id', ${uid ?? ""}, true)`;
      await tx.unsafe("set local role app_user");
      result = await fn(tx);
      throw new RollbackSignal();
    });
  } catch (e) {
    if (!(e instanceof RollbackSignal)) throw e;
  }
  return result!;
}
class RollbackSignal extends Error {}

export const programId = async (slug: string) => (await sql`select id from app.programs where slug = ${slug}`)[0].id as string;
