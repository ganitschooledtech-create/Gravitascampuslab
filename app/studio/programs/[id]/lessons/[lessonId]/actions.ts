"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionUser, ActionError } from "@/lib/auth/guards";
import { isPermissionError, withUser, type Tx } from "@/lib/db";
import { blockSettingsSchema, isBlockType, validateBlock } from "@/lib/blocks/registry";
import { defaultBlock, fromModel } from "@/lib/blocks/editor-spec";
import { publishLesson, rollbackLesson } from "@/lib/content/publish";

export type R = { ok: boolean; error?: string; message?: string; id?: string };
const uuid = z.string().uuid();

async function run(programId: string, lessonId: string, perm: string, fn: (tx: Tx, userId: string) => Promise<R | void>): Promise<R> {
  try {
    if (!uuid.safeParse(programId).success || !uuid.safeParse(lessonId).success) return { ok: false, error: "Invalid request." };
    const u = await actionUser(perm, { programId });
    const r = await withUser(u.id, async (tx) => {
      const [l] = await tx`select id from app.lessons where id = ${lessonId} and program_id = ${programId}`;
      if (!l) throw new ActionError("Lesson not found.");
      return fn(tx, u.id);
    });
    revalidatePath(`/studio/programs/${programId}/lessons/${lessonId}`);
    return r ?? { ok: true, message: "Saved ✓" };
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, error: e.message };
    if (isPermissionError(e)) return { ok: false, error: "You don't have permission to do that." };
    console.error(e);
    return { ok: false, error: (e as Error).message?.slice(0, 300) || "Something went wrong." };
  }
}

const settingsSchema = z.object({
  title: z.string().trim().min(1).max(160), summary: z.string().max(1000),
  free_navigation: z.boolean(), is_assessment: z.boolean(), estimated_minutes: z.number().int().min(0).max(600).nullable(),
});

export async function saveLessonSettingsAction(programId: string, lessonId: string, data: unknown) {
  return run(programId, lessonId, "content.edit", async (tx, uid) => {
    const s = settingsSchema.safeParse(data);
    if (!s.success) throw new ActionError(s.error.issues.map((i) => i.message).join("; "));
    await tx`update app.lessons set title = ${s.data.title}, summary = ${s.data.summary}, free_navigation = ${s.data.free_navigation},
             is_assessment = ${s.data.is_assessment}, estimated_minutes = ${s.data.estimated_minutes}, has_unpublished_changes = true, updated_by = ${uid}
             where id = ${lessonId}`;
  });
}

export async function addBlockAction(programId: string, lessonId: string, type: string, position: number) {
  return run(programId, lessonId, "content.edit", async (tx) => {
    if (!isBlockType(type)) throw new ActionError("Unknown block type");
    const { content, answerKey } = defaultBlock(type);
    await tx`update app.lesson_blocks set position = position + 1 where lesson_id = ${lessonId} and position >= ${position}`;
    const [b] = await tx`insert into app.lesson_blocks (lesson_id, position, type, content, answer_key, settings)
      values (${lessonId}, ${position}, ${type}, ${tx.json(content)}, ${tx.json(answerKey)}, ${tx.json({ points: 1, required: true })}) returning id`;
    return { ok: true, id: b.id, message: "Block added" };
  });
}

export async function saveBlockAction(programId: string, lessonId: string, blockId: string, type: string, model: unknown, settings: unknown) {
  return run(programId, lessonId, "content.edit", async (tx) => {
    if (!isBlockType(type)) throw new ActionError("Unknown block type");
    const { content, answerKey } = fromModel(type, (model ?? {}) as Record<string, unknown>);
    const v = validateBlock(type, content, answerKey);
    if (!v.ok) throw new ActionError(v.error);
    const st = blockSettingsSchema.safeParse(settings ?? {});
    if (!st.success) throw new ActionError("Invalid points/required settings");
    const r = await tx`update app.lesson_blocks set content = ${tx.json(v.content as never)}, answer_key = ${tx.json(v.answerKey as never)}, settings = ${tx.json(st.data)}
                       where id = ${blockId} and lesson_id = ${lessonId} returning id`;
    if (!r.length) throw new ActionError("Block not found");
  });
}

export async function deleteBlockAction(programId: string, lessonId: string, blockId: string) {
  return run(programId, lessonId, "content.edit", async (tx) => {
    await tx`delete from app.lesson_blocks where id = ${blockId} and lesson_id = ${lessonId}`;
    await renumber(tx, lessonId);
  });
}

export async function duplicateBlockAction(programId: string, lessonId: string, blockId: string) {
  return run(programId, lessonId, "content.edit", async (tx) => {
    const [b] = await tx`select position from app.lesson_blocks where id = ${blockId} and lesson_id = ${lessonId}`;
    if (!b) throw new ActionError("Block not found");
    await tx`update app.lesson_blocks set position = position + 1 where lesson_id = ${lessonId} and position > ${b.position}`;
    await tx`insert into app.lesson_blocks (lesson_id, position, type, content, answer_key, settings)
             select lesson_id, position + 1, type, content, answer_key, settings from app.lesson_blocks where id = ${blockId}`;
  });
}

export async function reorderBlocksAction(programId: string, lessonId: string, ids: string[]) {
  return run(programId, lessonId, "content.edit", async (tx) => {
    if (!Array.isArray(ids) || ids.some((i) => !uuid.safeParse(i).success)) throw new ActionError("Invalid order");
    const existing = (await tx`select id from app.lesson_blocks where lesson_id = ${lessonId}`).map((r) => r.id as string);
    if (existing.length !== ids.length || !ids.every((i) => existing.includes(i))) throw new ActionError("Lesson changed — reload the page.");
    for (let i = 0; i < ids.length; i++) await tx`update app.lesson_blocks set position = ${i} where id = ${ids[i]}`;
    return { ok: true, message: "Order saved ✓" };
  });
}

async function renumber(tx: Tx, lessonId: string) {
  await tx`update app.lesson_blocks b set position = r.rn - 1 from
           (select id, row_number() over (order by position) as rn from app.lesson_blocks where lesson_id = ${lessonId}) r where b.id = r.id`;
}

/** Every block must be valid before review/publish. */
async function assertAllValid(tx: Tx, lessonId: string) {
  const blocks = await tx`select position, type, content, answer_key from app.lesson_blocks where lesson_id = ${lessonId} order by position`;
  if (!blocks.length) throw new ActionError("Add at least one block first.");
  for (const b of blocks) {
    const v = validateBlock(b.type, b.content, b.answerKey);
    if (!v.ok) throw new ActionError(`Block ${b.position + 1} (${b.type}) needs fixing: ${v.error}`);
  }
}

export async function submitForReviewAction(programId: string, lessonId: string, note: string) {
  return run(programId, lessonId, "content.edit", async (tx, uid) => {
    await assertAllValid(tx, lessonId);
    await tx`update app.lessons set status = 'in_review' where id = ${lessonId} and status <> 'in_review'`;
    await tx`insert into app.content_reviews (lesson_id, program_id, requested_by, request_note) values (${lessonId}, ${programId}, ${uid}, ${note.slice(0, 1000) || null})`;
    return { ok: true, message: "Sent for review ✓" };
  });
}

export async function publishAction(programId: string, lessonId: string, note: string) {
  return run(programId, lessonId, "content.publish", async (tx, uid) => {
    await assertAllValid(tx, lessonId);
    const v = await publishLesson(tx, lessonId, uid, note.slice(0, 1000) || undefined);
    return { ok: true, message: `Published version ${v.versionNo} ✓ Learners now see this version.` };
  });
}

export async function requestChangesAction(programId: string, lessonId: string, note: string) {
  return run(programId, lessonId, "content.publish", async (tx, uid) => {
    if (!note.trim()) throw new ActionError("Tell the author what to change.");
    await tx`update app.content_reviews set decided_by = ${uid}, decided_at = now(), decision = 'changes_requested', decision_note = ${note.slice(0, 1000)}
             where lesson_id = ${lessonId} and decided_at is null`;
    await tx`update app.lessons set status = case when published_version_id is null then 'draft' else 'published' end where id = ${lessonId}`;
    return { ok: true, message: "Changes requested ✓" };
  });
}

export async function rollbackAction(programId: string, lessonId: string, versionId: string) {
  return run(programId, lessonId, "content.publish", async (tx, uid) => {
    await rollbackLesson(tx, lessonId, versionId, uid);
    return { ok: true, message: "Rolled back ✓ That version is live again." };
  });
}

export async function saveToLibraryAction(programId: string, lessonId: string, blockId: string, title: string) {
  return run(programId, lessonId, "content.edit", async (tx, uid) => {
    await tx`insert into app.reusable_blocks (program_id, title, type, content, answer_key, settings, created_by)
             select program_id, ${title.slice(0, 120) || "Saved block"}, type, content, answer_key, settings, ${uid} from app.lesson_blocks where id = ${blockId}`;
    return { ok: true, message: "Saved to block library ✓" };
  });
}

export async function insertFromLibraryAction(programId: string, lessonId: string, reusableId: string) {
  return run(programId, lessonId, "content.edit", async (tx) => {
    const [{ next }] = await tx`select coalesce(max(position) + 1, 0) as next from app.lesson_blocks where lesson_id = ${lessonId}`;
    const r = await tx`insert into app.lesson_blocks (lesson_id, position, type, content, answer_key, settings, source_reusable_id)
             select ${lessonId}, ${next}, type, content, answer_key, settings, id from app.reusable_blocks where id = ${reusableId} returning id`;
    if (!r.length) throw new ActionError("Library block not found");
    return { ok: true, message: "Inserted ✓" };
  });
}
