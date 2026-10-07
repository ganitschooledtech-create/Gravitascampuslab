import "server-only";
import { withSystem, withUser } from "@/lib/db";
import { gradeBlock, type GradeResult } from "@/lib/blocks/grade";
import { blockSettingsSchema, type PublicBlock } from "@/lib/blocks/registry";
import { effectivePassMark, levelResult, nextLevelId } from "@/lib/content/unlock";

export type LearnerLesson = {
  id: string;
  versionId: string;
  title: string;
  summary: string;
  freeNavigation: boolean;
  isAssessment: boolean;
  programId: string;
  programSlug: string;
  programName: string;
  levelName: string;
  blocks: PublicBlock[];
  progress: { currentPosition: number; completedBlockIds: string[]; status: string; score: number; maxScore: number } | null;
  responses: Record<string, { response: unknown; isCorrect: boolean | null; completed: boolean; feedback?: string }>;
};

/** Lesson as the learner sees it. Answer keys are removed by the database function app.learner_lesson(). */
export async function getLearnerLesson(userId: string, lessonId: string): Promise<LearnerLesson | null> {
  return withUser(userId, async (tx) => {
    const [row] = await tx`select app.learner_lesson(${lessonId}) as snap`;
    const snap = row?.snap;
    if (!snap) return null;
    const [meta] = await tx`
      select ls.program_id, p.slug as program_slug, p.name as program_name, l.name as level_name
        from app.lessons ls join app.programs p on p.id = ls.program_id join app.levels l on l.id = ls.level_id
       where ls.id = ${lessonId}`;
    const [progress] = await tx`
      select current_position, completed_block_ids, status, score::float, max_score::float
        from app.lesson_progress where user_id = ${userId} and lesson_id = ${lessonId}`;
    const resp = await tx`select block_id, response, is_correct, completed from app.block_responses where user_id = ${userId} and lesson_id = ${lessonId}`;
    return {
      id: lessonId,
      versionId: snap.version_id,
      title: snap.title,
      summary: snap.summary ?? "",
      freeNavigation: !!snap.free_navigation,
      isAssessment: !!snap.is_assessment,
      programId: meta.programId,
      programSlug: meta.programSlug,
      programName: meta.programName,
      levelName: meta.levelName,
      blocks: (snap.blocks as any[]).map((b) => ({ id: b.id, type: b.type, content: b.content, settings: blockSettingsSchema.parse(b.settings ?? {}) })),
      progress: progress
        ? { currentPosition: progress.currentPosition, completedBlockIds: progress.completedBlockIds, status: progress.status, score: progress.score, maxScore: progress.maxScore }
        : null,
      responses: Object.fromEntries(resp.map((r) => [r.blockId, { response: r.response, isCorrect: r.isCorrect, completed: r.completed }])),
    };
  });
}

export type SubmitOutcome = GradeResult & { lessonCompleted: boolean; nextPosition: number; levelUnlocked?: string | null; levelMessage?: string };

/**
 * Grades and saves one block response, then updates lesson progress.
 * Rules enforced here (server-side, not just in the UI):
 *  - learner must have access to the lesson (RLS + app.can_learn_lesson)
 *  - no skipping ahead unless the lesson allows free navigation
 *  - the FIRST completed attempt's score counts (retries are for learning)
 */
export async function submitBlock(userId: string, lessonId: string, blockId: string, response: unknown): Promise<SubmitOutcome> {
  // 1. Load the published snapshot WITH answer keys (privileged read, after an access check as the user).
  const allowed = await withUser(userId, async (tx) => (await tx`select app.can_learn_lesson(${lessonId}) as ok`)[0].ok as boolean);
  if (!allowed) throw new Error("You don't have access to this lesson yet.");
  const snapRow = await withSystem(async (tx) => {
    const [r] = await tx`select v.id as version_id, v.snapshot, ls.program_id, ls.level_id
                           from app.lessons ls join app.lesson_versions v on v.id = ls.published_version_id where ls.id = ${lessonId}`;
    return r;
  });
  if (!snapRow) throw new Error("Lesson is not published.");
  const blocks = snapRow.snapshot.blocks as any[];
  const index = blocks.findIndex((b) => b.id === blockId);
  if (index < 0) throw new Error("This lesson was updated. Please reload the page.");
  const block = blocks[index];

  const outcome = await withUser(userId, async (tx): Promise<SubmitOutcome> => {
    const [progress] = await tx`select current_position, completed_block_ids from app.lesson_progress where user_id = ${userId} and lesson_id = ${lessonId} for update`;
    const done: string[] = progress?.completedBlockIds ?? [];
    const firstIncomplete = blocks.findIndex((b) => !done.includes(b.id));
    const frontier = firstIncomplete < 0 ? blocks.length : firstIncomplete;
    if (!snapRow.snapshot.free_navigation && index > frontier) throw new Error("Finish the earlier steps first.");

    let r = response;
    if (block.type === "submission") {
      const [s] = await tx`select id from app.submissions where user_id = ${userId} and lesson_id = ${lessonId} and block_id = ${blockId} limit 1`;
      r = { submitted: !!s };
    }
    const result = gradeBlock(block.type, block.content, block.answer_key, block.settings, r);
    if (result.error) return { ...result, lessonCompleted: false, nextPosition: index };

    const safeResponse = tx.json((r ?? {}) as never);
    await tx`
      insert into app.block_responses (user_id, block_id, lesson_id, program_id, version_id, response, is_correct, score, max_score, attempts, completed)
      values (${userId}, ${blockId}, ${lessonId}, ${snapRow.programId}, ${snapRow.versionId}, ${safeResponse}, ${result.isCorrect}, ${result.score}, ${result.maxScore}, 1, true)
      on conflict (user_id, block_id) do update set
        response = excluded.response,
        attempts = app.block_responses.attempts + 1,
        is_correct = case when app.block_responses.completed then app.block_responses.is_correct else excluded.is_correct end,
        score      = case when app.block_responses.completed then app.block_responses.score else excluded.score end,
        max_score  = excluded.max_score,
        completed  = true`;

    const newDone = Array.from(new Set([...done, blockId]));
    const allDone = blocks.every((b) => newDone.includes(b.id) || blockSettingsSchema.parse(b.settings ?? {}).required === false);
    const [totals] = await tx`select coalesce(sum(score), 0)::float as score from app.block_responses
                               where user_id = ${userId} and lesson_id = ${lessonId} and block_id = any(${blocks.map((b) => b.id)})`;
    const maxScore = blocks.reduce((s, b) => s + gradeBlockMax(b), 0);
    const nextPos = Math.min(Math.max(index + 1, progress?.currentPosition ?? 0), blocks.length);
    await tx`
      insert into app.lesson_progress (user_id, lesson_id, program_id, version_id, current_position, completed_block_ids, status, score, max_score, completed_at)
      values (${userId}, ${lessonId}, ${snapRow.programId}, ${snapRow.versionId}, ${nextPos}, ${newDone}, ${allDone ? "completed" : "in_progress"},
              ${totals.score}, ${maxScore}, ${allDone ? new Date() : null})
      on conflict (user_id, lesson_id) do update set
        version_id = excluded.version_id, current_position = excluded.current_position, completed_block_ids = excluded.completed_block_ids,
        status = case when app.lesson_progress.status = 'completed' then 'completed' else excluded.status end,
        score = excluded.score, max_score = excluded.max_score,
        completed_at = coalesce(app.lesson_progress.completed_at, excluded.completed_at)`;

    return { ...result, lessonCompleted: allDone, nextPosition: nextPos };
  });
  // Runs after the progress transaction has committed, so it sees the completed lesson.
  if (outcome.lessonCompleted && !outcome.error) Object.assign(outcome, await evaluateLevel(userId, snapRow.levelId));
  return outcome;
}

function gradeBlockMax(b: any): number {
  const g = gradeBlock(b.type, b.content, b.answer_key, b.settings, undefined);
  return g.maxScore;
}

/** After a lesson completes: check whether the level is passed and unlock the next one. */
export async function evaluateLevel(userId: string, levelId: string): Promise<{ levelUnlocked: string | null; levelMessage?: string }> {
  return withSystem(async (tx) => {
    const [lvl] = await tx`select l.id, l.program_id, l.pass_mark, p.pass_mark as program_pass_mark, p.unlock_rule
                            from app.levels l join app.programs p on p.id = l.program_id where l.id = ${levelId}`;
    if (!lvl || lvl.unlockRule === "open") return { levelUnlocked: null };
    const lessons = await tx`
      select (v.snapshot->>'is_assessment')::boolean as is_assessment,
             coalesce(lp.status = 'completed', false) as completed,
             coalesce(lp.score, 0)::float as score, coalesce(lp.max_score, 0)::float as max_score
        from app.lessons ls
        join app.lesson_versions v on v.id = ls.published_version_id
        left join app.lesson_progress lp on lp.lesson_id = ls.id and lp.user_id = ${userId}
       where ls.level_id = ${levelId} and ls.status = 'published'`;
    const res = levelResult(
      lessons.map((l) => ({ isAssessment: l.isAssessment, completed: l.completed, score: l.score, maxScore: l.maxScore })),
      effectivePassMark(lvl.passMark, lvl.programPassMark),
    );
    if (!res.passed) return { levelUnlocked: null, levelMessage: res.reason };
    const levels = await tx`select id, position from app.levels where program_id = ${lvl.programId}`;
    const next = nextLevelId(levels as any, levelId);
    if (!next) return { levelUnlocked: null, levelMessage: "🏆 You finished the final level!" };
    const ins = await tx`insert into app.level_unlocks (user_id, level_id, program_id, reason, note)
                         values (${userId}, ${next}, ${lvl.programId}, 'passed', ${res.reason})
                         on conflict (user_id, level_id) do nothing returning id`;
    return { levelUnlocked: ins.length ? next : null, levelMessage: `🎉 Level passed! ${res.reason}` };
  }, userId);
}

/** Records a "Try It" proof or assignment submission (files uploaded separately). */
export async function createSubmission(
  userId: string,
  lessonId: string,
  blockId: string,
  data: { kind: "text" | "link" | "file" | "screenshot"; bodyText?: string; url?: string; fileKey?: string; fileName?: string },
) {
  return withUser(userId, async (tx) => {
    const [l] = await tx`select program_id from app.lessons where id = ${lessonId}`;
    if (!l) throw new Error("Lesson not found");
    const [s] = await tx`
      insert into app.submissions (user_id, block_id, lesson_id, program_id, kind, body_text, url, file_key, file_name)
      values (${userId}, ${blockId}, ${lessonId}, ${l.programId}, ${data.kind}, ${data.bodyText ?? null}, ${data.url ?? null}, ${data.fileKey ?? null}, ${data.fileName ?? null})
      returning id`;
    return s.id as string;
  });
}
