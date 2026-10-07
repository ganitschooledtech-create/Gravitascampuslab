"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionUser, ActionError } from "@/lib/auth/guards";
import { createAuthToken } from "@/lib/auth/service";
import { isPermissionError, isUniqueViolation, withSystem, withUser } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";

type R = { error?: string; message?: string } | undefined;
const wrap = async (fn: () => Promise<R>): Promise<R> => {
  try { return await fn(); } catch (e) {
    if (e instanceof ActionError) return { error: e.message };
    if (isPermissionError(e)) return { error: (e as Error).message.includes("Super Admin") ? (e as Error).message : "You don't have permission to do that." };
    if (isUniqueViolation(e)) return { error: "That already exists." };
    if (e instanceof z.ZodError) return { error: e.issues.map((i) => i.message).join("; ") };
    console.error(e); return { error: "Something went wrong." };
  }
};

/** Invite a team member: creates an email account (no password) and emails a "set your password" link. */
export async function inviteAction(_: R, form: FormData): Promise<R> {
  return wrap(async () => {
    const u = await actionUser("team.manage");
    const data = z.object({ email: z.string().trim().toLowerCase().email(), first: z.string().trim().min(1).max(80), last: z.string().trim().max(80) })
      .parse({ email: form.get("email"), first: form.get("first"), last: form.get("last") ?? "" });
    await withSystem((tx) => tx`insert into app.users (login_kind, email, first_name, last_name) values ('email', ${data.email}, ${data.first}, ${data.last})
                                on conflict (email) do nothing`, u.id);
    const t = await createAuthToken(data.email, "password_reset", 60 * 48);
    if (t) {
      await sendEmail({ to: data.email, subject: "You're invited to Gravitas Campus Studio",
        text: `Hi ${data.first},\n\n${u.firstName} invited you to the Gravitas Campus team.\nSet your password here (valid 48 hours):\n${env().APP_URL}/reset-password?token=${encodeURIComponent(t.token)}\n` });
    }
    revalidatePath("/studio/team");
    return { message: `Invitation sent to ${data.email}. Now assign them a role below.` };
  });
}

export async function assignRoleAction(_: R, form: FormData): Promise<R> {
  return wrap(async () => {
    const u = await actionUser("team.manage");
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const roleId = z.string().uuid().parse(form.get("roleId"));
    const programId = String(form.get("programId") ?? "") || null;
    const schoolId = String(form.get("schoolId") ?? "") || null;
    await withUser(u.id, async (tx) => {
      const [target] = await tx`select id from app.users where email = ${email}`;
      if (!target) throw new ActionError("No team member with that email. Invite them first.");
      await tx`insert into app.role_assignments (user_id, role_id, program_id, school_id, created_by) values (${target.id}, ${roleId}, ${programId}, ${schoolId}, ${u.id})`;
    });
    revalidatePath("/studio/team");
    return { message: "Role assigned ✓" };
  });
}

export async function removeAssignmentAction(form: FormData) {
  const u = await actionUser("team.manage");
  const id = z.string().uuid().parse(form.get("id"));
  if (id && u) await withUser(u.id, (tx) => tx`delete from app.role_assignments where id = ${id} and user_id <> ${u.id}`);
  revalidatePath("/studio/team");
}

export async function saveRoleAction(_: R, form: FormData): Promise<R> {
  return wrap(async () => {
    const u = await actionUser("team.manage");
    const id = String(form.get("id") ?? "");
    const name = z.string().trim().min(2).max(60).parse(form.get("name"));
    const perms = form.getAll("perms").map(String).filter((p) => p !== "*");
    await withUser(u.id, async (tx) => {
      let roleId = id;
      if (!roleId) {
        const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 36) || "role";
        [{ id: roleId }] = await tx`insert into app.roles (key, name, description) values (${key}, ${name}, ${String(form.get("description") ?? "")}) returning id`;
      } else {
        const r = await tx`update app.roles set name = ${name}, description = ${String(form.get("description") ?? "")} where id = ${roleId} and not is_system returning id`;
        if (!r.length) throw new ActionError("System roles can't be edited. Create a custom role instead.");
      }
      await tx`delete from app.role_permissions where role_id = ${roleId}`;
      for (const p of perms) await tx`insert into app.role_permissions (role_id, permission_key) values (${roleId}, ${p})`;
    });
    revalidatePath("/studio/team");
    return { message: "Role saved ✓" };
  });
}
