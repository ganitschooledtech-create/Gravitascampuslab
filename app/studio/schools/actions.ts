"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionUser, ActionError } from "@/lib/auth/guards";
import { hashSecret } from "@/lib/auth/password";
import { generatePin } from "@/lib/auth/service";
import { isUniqueViolation, withSystem, withUser } from "@/lib/db";

type R = { error?: string; message?: string; pin?: string } | undefined;

export async function createSchoolAction(_: R, form: FormData): Promise<R> {
  try {
    const u = await actionUser("schools.manage");
    const d = z.object({ name: z.string().trim().min(2).max(160), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{3,20}$/, "Code: 3–20 letters/numbers"), city: z.string().trim().max(80) })
      .parse({ name: form.get("name"), code: form.get("code"), city: form.get("city") ?? "" });
    await withUser(u.id, (tx) => tx`insert into app.schools (name, code, city, district) values (${d.name}, ${d.code}, ${d.city}, ${d.city})`);
    revalidatePath("/studio/schools");
    return { message: `School created. Students log in with code ${d.code}.` };
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "That school code is already used." };
    return { error: e instanceof z.ZodError ? e.issues[0].message : (e as Error).message };
  }
}

/** Username like "aarav.k", made unique within the school by adding a number. */
async function uniqueUsername(schoolId: string, first: string, last: string) {
  const base = `${first}.${last.slice(0, 1) || "x"}`.toLowerCase().normalize("NFKD").replace(/[^a-z0-9.]/g, "").slice(0, 24) || "learner";
  return withSystem(async (tx) => {
    for (let i = 0; i < 500; i++) {
      const candidate = i === 0 ? base : `${base}${i + 1}`;
      const [hit] = await tx`select 1 from app.school_learners where school_id = ${schoolId} and username = ${candidate}`;
      if (!hit) return candidate;
    }
    throw new ActionError("Could not create a unique username.");
  });
}

/** Add ONE school learner (bulk CSV import comes in Phase 2). The PIN is shown once and never stored in readable form. */
export async function addLearnerAction(_: R, form: FormData): Promise<R> {
  try {
    const schoolId = z.string().uuid().parse(form.get("schoolId"));
    const u = await actionUser("learners.manage", { schoolId });
    const d = z.object({ first: z.string().trim().min(1).max(80), last: z.string().trim().max(80), cls: z.string().trim().max(20), section: z.string().trim().max(10) })
      .parse({ first: form.get("first"), last: form.get("last") ?? "", cls: form.get("class") ?? "", section: form.get("section") ?? "" });
    const username = await uniqueUsername(schoolId, d.first, d.last);
    const pin = generatePin();
    const hash = await hashSecret(pin);
    await withSystem(async (tx) => {
      const [nu] = await tx`insert into app.users (login_kind, password_hash, first_name, last_name) values ('school_pin', ${hash}, ${d.first}, ${d.last}) returning id`;
      await tx`insert into app.school_learners (user_id, school_id, username, class, section, pin_set_at) values (${nu.id}, ${schoolId}, ${username}, ${d.cls || null}, ${d.section || null}, now())`;
    }, u.id);
    revalidatePath("/studio/schools");
    return { message: `Created ${d.first}: username ${username}`, pin };
  } catch (e) {
    return { error: e instanceof z.ZodError ? e.issues[0].message : (e as Error).message };
  }
}

export async function resetPinAction(_: R, form: FormData): Promise<R> {
  try {
    const schoolId = z.string().uuid().parse(form.get("schoolId"));
    const userId = z.string().uuid().parse(form.get("userId"));
    const u = await actionUser("learners.manage", { schoolId });
    const pin = generatePin();
    const hash = await hashSecret(pin);
    await withSystem(async (tx) => {
      const r = await tx`update app.users set password_hash = ${hash}, failed_login_count = 0, locked_until = null
                         where id = ${userId} and exists (select 1 from app.school_learners where user_id = ${userId} and school_id = ${schoolId}) returning id`;
      if (!r.length) throw new ActionError("Learner not found in this school.");
      await tx`update app.school_learners set pin_set_at = now() where user_id = ${userId}`;
      await tx`update app.sessions set revoked_at = now() where user_id = ${userId} and revoked_at is null`;
      await tx`select app.audit('pin_reset', 'users', ${userId}, null)`;
    }, u.id);
    return { message: "New PIN created. Give it to the learner privately:", pin };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function unlockAccountAction(form: FormData) {
  const schoolId = z.string().uuid().parse(form.get("schoolId"));
  const userId = z.string().uuid().parse(form.get("userId"));
  const u = await actionUser("learners.manage", { schoolId });
  await withSystem(async (tx) => {
    await tx`update app.users set failed_login_count = 0, locked_until = null
             where id = ${userId} and exists (select 1 from app.school_learners where user_id = ${userId} and school_id = ${schoolId})`;
    await tx`select app.audit('account_unlock', 'users', ${userId}, null)`;
  }, u.id);
  revalidatePath("/studio/schools");
}
