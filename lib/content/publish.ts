import type { Tx } from "@/lib/db";
import { shuffleAwayFrom, seededShuffle } from "./shuffle";

/**
 * Publishing = freezing the current draft into an immutable snapshot (lesson_versions).
 * Learners always read the snapshot, so authors can keep editing safely.
 * Runs as app_user → the database itself refuses if the user lacks content.publish.
 */
export async function publishLesson(tx: Tx, lessonId: string, userId: string, note?: string) {
  const [lesson] = await tx`select id, program_id, title, summary, free_navigation, is_assessment, estimated_minutes from app.lessons where id = ${lessonId} for update`;
  if (!lesson) throw new Error("Lesson not found");
  const blocks = await tx`select id, type, content, answer_key, settings from app.lesson_blocks where lesson_id = ${lessonId} order by position`;
  if (!blocks.length) throw new Error("Add at least one block before publishing");
  const snapshotBlocks = blocks.map((b) => {
    let content = b.content;
    // Learners must not see sorting items in the correct order.
    if (b.type === "sort") content = { ...content, items: shuffleAwayFrom(content.items, b.answerKey.order, b.id) };
    if (b.type === "match") content = { ...content, right: seededShuffle(content.right, b.id) };
    return { id: b.id, type: b.type, content, answer_key: b.answerKey, settings: b.settings };
  });
  const snapshot = {
    title: lesson.title, summary: lesson.summary, free_navigation: lesson.freeNavigation,
    is_assessment: lesson.isAssessment, estimated_minutes: lesson.estimatedMinutes, blocks: snapshotBlocks,
  };
  const [{ next }] = await tx`select coalesce(max(version_no), 0) + 1 as next from app.lesson_versions where lesson_id = ${lessonId}`;
  const [v] = await tx`
    insert into app.lesson_versions (lesson_id, program_id, version_no, snapshot, note, published_by)
    values (${lessonId}, ${lesson.programId}, ${next}, ${tx.json(snapshot as never)}, ${note ?? null}, ${userId}) returning id, version_no`;
  await tx`update app.lessons set status = 'published', published_version_id = ${v.id}, has_unpublished_changes = false, updated_by = ${userId} where id = ${lessonId}`;
  await tx`update app.content_reviews set decided_by = ${userId}, decided_at = now(), decision = 'approved' where lesson_id = ${lessonId} and decided_at is null`;
  return { versionId: v.id as string, versionNo: v.versionNo as number };
}

/** Rollback: make an older snapshot live again, and restore it as the editable draft. */
export async function rollbackLesson(tx: Tx, lessonId: string, versionId: string, userId: string) {
  const [v] = await tx`select id, snapshot from app.lesson_versions where id = ${versionId} and lesson_id = ${lessonId}`;
  if (!v) throw new Error("Version not found");
  const snap = v.snapshot as { title: string; summary: string; free_navigation: boolean; is_assessment: boolean; blocks: any[] };
  await tx`delete from app.lesson_blocks where lesson_id = ${lessonId}`;
  let pos = 0;
  for (const b of snap.blocks) {
    await tx`insert into app.lesson_blocks (id, lesson_id, position, type, content, answer_key, settings)
             values (${b.id}, ${lessonId}, ${pos++}, ${b.type}, ${tx.json(b.content)}, ${tx.json(b.answer_key ?? {})}, ${tx.json(b.settings ?? {})})`;
  }
  await tx`update app.lessons set title = ${snap.title}, summary = ${snap.summary}, free_navigation = ${snap.free_navigation},
           is_assessment = ${snap.is_assessment}, status = 'published', published_version_id = ${versionId},
           has_unpublished_changes = false, updated_by = ${userId} where id = ${lessonId}`;
  await tx`select app.audit('rollback', 'lessons', ${lessonId}, ${tx.json({ versionId })})`;
}
