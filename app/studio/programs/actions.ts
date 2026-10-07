"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { actionUser, ActionError } from "@/lib/auth/guards";
import { isPermissionError, isUniqueViolation, withUser, type Tx } from "@/lib/db";

export type Result = { error?: string; message?: string } | undefined;

/** Wraps every studio action: friendly errors, DB permission errors mapped to plain language. */
async function run(fn: () => Promise<Result | void>): Promise<Result> {
  try {
    return (await fn()) ?? { message: "Saved." };
  } catch (e) {
    if (e instanceof ActionError) return { error: e.message };
    if (isPermissionError(e)) return { error: "You don't have permission to do that." };
    if (isUniqueViolation(e)) return { error: "That name/slug is already used. Choose another." };
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    console.error(e);
    return { error: (e as Error).message?.slice(0, 200) || "Something went wrong." };
  }
}

const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9-]{2,60}$/, "Slug: 2–60 lowercase letters, numbers or dashes");
const programSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug,
  tagline: z.string().trim().max(200).default(""),
  description: z.string().max(5000).default(""),
  audience: z.enum(["school", "adult"]),
  visibility: z.enum(["draft", "private", "public"]),
  pass_mark: z.coerce.number().int().min(0).max(100),
  unlock_rule: z.enum(["sequential", "open"]),
  languages: z.array(z.enum(["en", "kn"])).min(1),
});

function parseProgram(form: FormData) {
  const r = programSchema.safeParse({
    name: form.get("name"), slug: form.get("slug"), tagline: form.get("tagline") ?? "", description: form.get("description") ?? "",
    audience: form.get("audience"), visibility: form.get("visibility") ?? "draft", pass_mark: form.get("pass_mark") ?? 50,
    unlock_rule: form.get("unlock_rule") ?? "sequential", languages: form.getAll("languages").length ? form.getAll("languages") : ["en"],
  });
  if (!r.success) throw new ActionError(r.error.issues.map((i) => i.message).join(" · "));
  return r.data;
}

export async function createProgramAction(_: Result, form: FormData): Promise<Result> {
  let id = "";
  const res = await run(async () => {
    const u = await actionUser("program.create");
    const p = parseProgram(form);
    id = await withUser(u.id, async (tx) => {
      const [row] = await tx`insert into app.programs (slug, name, tagline, description, audience, visibility, pass_mark, unlock_rule, languages, created_by)
        values (${p.slug}, ${p.name}, ${p.tagline}, ${p.description}, ${p.audience}, ${p.visibility}, ${p.pass_mark}, ${p.unlock_rule}, ${p.languages}, ${u.id}) returning id`;
      await tx`insert into app.levels (program_id, position, name, slug) values (${row.id}, 0, 'Level 1', 'level-1')`;
      return row.id as string;
    });
  });
  if (res?.error) return res;
  redirect(`/studio/programs/${id}`);
}

export async function updateProgramAction(_: Result, form: FormData): Promise<Result> {
  return run(async () => {
    const id = String(form.get("id"));
    const u = await actionUser("program.manage", { programId: id });
    const p = parseProgram(form);
    await withUser(u.id, (tx) => tx`update app.programs set slug = ${p.slug}, name = ${p.name}, tagline = ${p.tagline}, description = ${p.description},
      audience = ${p.audience}, visibility = ${p.visibility}, pass_mark = ${p.pass_mark}, unlock_rule = ${p.unlock_rule}, languages = ${p.languages},
      is_template = ${form.get("is_template") === "on"} where id = ${id}`);
    revalidatePath(`/studio/programs/${id}`);
  });
}

/** Deep copy: program → levels → modules → lessons (as drafts) → blocks. */
export async function cloneProgramAction(form: FormData) {
  const u = await actionUser("program.create");
  const src = String(form.get("id"));
  const newId = await withUser(u.id, async (tx) => {
    const [p] = await tx`select * from app.programs where id = ${src}`;
    if (!p) throw new ActionError("Program not found");
    const suffix = Math.random().toString(36).slice(2, 6);
    const [np] = await tx`insert into app.programs (slug, name, tagline, description, audience, visibility, pass_mark, unlock_rule, languages,
        prerequisites, ai_settings, marketing, translations, created_by)
      values (${`${p.slug}-copy-${suffix}`.slice(0, 60)}, ${`${p.name} (copy)`}, ${p.tagline}, ${p.description}, ${p.audience}, 'draft', ${p.passMark},
        ${p.unlockRule}, ${p.languages}, ${tx.json(p.prerequisites)}, ${tx.json(p.aiSettings)}, ${tx.json(p.marketing)}, ${tx.json(p.translations)}, ${u.id}) returning id`;
    await copyTree(tx, src, np.id);
    return np.id as string;
  });
  redirect(`/studio/programs/${newId}`);
}

async function copyTree(tx: Tx, from: string, to: string) {
  const levels = await tx`select * from app.levels where program_id = ${from} order by position`;
  for (const l of levels) {
    const [nl] = await tx`insert into app.levels (program_id, position, name, slug, description, badge_name, pass_mark, translations)
      values (${to}, ${l.position}, ${l.name}, ${l.slug}, ${l.description}, ${l.badgeName}, ${l.passMark}, ${tx.json(l.translations)}) returning id`;
    const mods = await tx`select * from app.modules where level_id = ${l.id} order by position`;
    for (const m of mods) {
      const [nm] = await tx`insert into app.modules (level_id, position, title, description, translations)
        values (${nl.id}, ${m.position}, ${m.title}, ${m.description}, ${tx.json(m.translations)}) returning id`;
      const lessons = await tx`select * from app.lessons where module_id = ${m.id} order by position`;
      for (const ls of lessons) {
        const [nls] = await tx`insert into app.lessons (module_id, position, title, summary, free_navigation, is_assessment, estimated_minutes, ai_settings, translations, created_by)
          values (${nm.id}, ${ls.position}, ${ls.title}, ${ls.summary}, ${ls.freeNavigation}, ${ls.isAssessment}, ${ls.estimatedMinutes}, ${tx.json(ls.aiSettings)}, ${tx.json(ls.translations)}, app.uid()) returning id`;
        await tx`insert into app.lesson_blocks (lesson_id, position, type, content, answer_key, settings)
          select ${nls.id}, position, type, content, answer_key, settings from app.lesson_blocks where lesson_id = ${ls.id}`;
      }
    }
  }
}

// ── Structure: levels / modules / lessons ──────────────────────────────────
const TABLES = { level: "levels", module: "modules", lesson: "lessons" } as const;
const PARENT = { level: "program_id", module: "level_id", lesson: "module_id" } as const;

export async function addNodeAction(_: Result, form: FormData): Promise<Result> {
  return run(async () => {
    const programId = String(form.get("programId"));
    const kind = String(form.get("kind")) as keyof typeof TABLES;
    const parentId = String(form.get("parentId"));
    const title = z.string().trim().min(1).max(160).safeParse(form.get("title"));
    if (!title.success) throw new ActionError("Enter a name.");
    const u = await actionUser(kind === "level" ? "program.manage" : "content.edit", { programId });
    await withUser(u.id, async (tx) => {
      const col = PARENT[kind];
      const [{ next }] = await tx`select coalesce(max(position) + 1, 0) as next from ${tx("app." + TABLES[kind])} where ${tx(col)} = ${parentId}`;
      if (kind === "level") {
        const s = title.data.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "level";
        await tx`insert into app.levels (program_id, position, name, slug) values (${parentId}, ${next}, ${title.data}, ${`${s}-${next + 1}`})`;
      } else if (kind === "module") {
        await tx`insert into app.modules (level_id, position, title) values (${parentId}, ${next}, ${title.data})`;
      } else {
        await tx`insert into app.lessons (module_id, position, title, created_by) values (${parentId}, ${next}, ${title.data}, ${u.id})`;
      }
    });
    revalidatePath(`/studio/programs/${programId}`);
  });
}

export async function renameNodeAction(form: FormData) {
  await run(async () => {
    const programId = String(form.get("programId"));
    const kind = String(form.get("kind")) as keyof typeof TABLES;
    const id = String(form.get("id"));
    const title = String(form.get("title") ?? "").trim().slice(0, 160);
    if (!title) return;
    const u = await actionUser("content.edit", { programId });
    const col = kind === "level" ? "name" : "title";
    await withUser(u.id, (tx) => tx`update ${tx("app." + TABLES[kind])} set ${tx(col)} = ${title} where id = ${id}`);
    revalidatePath(`/studio/programs/${programId}`);
  });
}

export async function moveNodeAction(form: FormData) {
  await run(async () => {
    const programId = String(form.get("programId"));
    const kind = String(form.get("kind")) as keyof typeof TABLES;
    const id = String(form.get("id"));
    const dir = form.get("dir") === "up" ? -1 : 1;
    const u = await actionUser("content.edit", { programId });
    await withUser(u.id, async (tx) => {
      const table = tx("app." + TABLES[kind]), col = tx(PARENT[kind]);
      const [me] = await tx`select id, position, ${col} as parent from ${table} where id = ${id}`;
      if (!me) return;
      const [other] = dir < 0
        ? await tx`select id, position from ${table} where ${col} = ${me.parent} and position < ${me.position} order by position desc limit 1`
        : await tx`select id, position from ${table} where ${col} = ${me.parent} and position > ${me.position} order by position asc limit 1`;
      if (!other) return;
      await tx`update ${table} set position = ${other.position} where id = ${me.id}`;
      await tx`update ${table} set position = ${me.position} where id = ${other.id}`;
    });
    revalidatePath(`/studio/programs/${programId}`);
  });
}

export async function deleteNodeAction(form: FormData) {
  await run(async () => {
    const programId = String(form.get("programId"));
    const kind = String(form.get("kind")) as keyof typeof TABLES;
    const id = String(form.get("id"));
    // Deleting structure removes learner progress too, so it needs publish rights (Reviewer / Manager / Admin).
    const u = await actionUser(kind === "level" ? "program.manage" : "content.publish", { programId });
    await withUser(u.id, async (tx) => {
      const r = await tx`delete from ${tx("app." + TABLES[kind])} where id = ${id} returning id`;
      if (!r.length) throw new ActionError("You don't have permission to delete this.");
    });
    revalidatePath(`/studio/programs/${programId}`);
  });
}

// ── Learners: enroll, unenroll, unlock override ────────────────────────────
export async function enrollAction(_: Result, form: FormData): Promise<Result> {
  return run(async () => {
    const programId = String(form.get("programId"));
    const who = String(form.get("who") ?? "").trim().toLowerCase();
    const u = await actionUser("enrollments.manage", { programId });
    if (!who) throw new ActionError("Enter an email, or SCHOOLCODE/username.");
    await withUser(u.id, async (tx) => {
      let target: { id: string } | undefined;
      if (who.includes("@")) [target] = await tx`select id from app.users where email = ${who}`;
      else {
        const [code, username] = who.split("/");
        [target] = await tx`select sl.user_id as id from app.school_learners sl join app.schools s on s.id = sl.school_id
                             where s.code = ${(code ?? "").toUpperCase()} and sl.username = ${username ?? ""}`;
      }
      if (!target) throw new ActionError("No learner found. Check the email or SCHOOLCODE/username (you may not have access to that school).");
      await tx`insert into app.enrollments (user_id, program_id, status, source, created_by) values (${target.id}, ${programId}, 'active', 'admin', ${u.id})
               on conflict (user_id, program_id) do update set status = 'active'`;
    });
    revalidatePath(`/studio/programs/${programId}`);
    return { message: "Learner enrolled. Level 1 is unlocked for them." };
  });
}

export async function setEnrollmentStatusAction(form: FormData) {
  await run(async () => {
    const programId = String(form.get("programId"));
    const status = z.enum(["active", "cancelled", "completed"]).parse(form.get("status"));
    const u = await actionUser("enrollments.manage", { programId });
    await withUser(u.id, (tx) => tx`update app.enrollments set status = ${status} where id = ${String(form.get("id"))} and program_id = ${programId}`);
    revalidatePath(`/studio/programs/${programId}`);
  });
}

export async function overrideUnlockAction(form: FormData) {
  await run(async () => {
    const programId = String(form.get("programId"));
    const u = await actionUser("progress.override", { programId });
    const note = String(form.get("note") ?? "").slice(0, 300) || "Manual unlock";
    await withUser(u.id, (tx) => tx`insert into app.level_unlocks (user_id, level_id, program_id, reason, note, unlocked_by)
      values (${String(form.get("userId"))}, ${String(form.get("levelId"))}, ${programId}, 'override', ${note}, ${u.id})
      on conflict (user_id, level_id) do nothing`);
    revalidatePath(`/studio/programs/${programId}`);
  });
}
