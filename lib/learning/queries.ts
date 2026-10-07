import "server-only";
import { withUser } from "@/lib/db";

export async function myPrograms(userId: string) {
  return withUser(userId, (tx) => tx`
    select p.id, p.slug, p.name, p.tagline, p.audience, e.status,
           (select count(*)::int from app.lessons ls where ls.program_id = p.id and ls.published_version_id is not null) as total_lessons,
           (select count(*)::int from app.lesson_progress lp where lp.program_id = p.id and lp.user_id = ${userId} and lp.status = 'completed') as done_lessons,
           (select count(*)::int from app.level_unlocks u where u.program_id = p.id and u.user_id = ${userId}) as levels_unlocked,
           (select count(*)::int from app.levels l where l.program_id = p.id) as total_levels,
           (select lp.lesson_id from app.lesson_progress lp where lp.program_id = p.id and lp.user_id = ${userId} and lp.status = 'in_progress'
             order by lp.updated_at desc limit 1) as resume_lesson_id
      from app.enrollments e join app.programs p on p.id = e.program_id
     where e.user_id = ${userId} and e.status in ('active', 'completed')
     order by e.enrolled_at desc`);
}

export type MapLesson = { id: string; title: string; summary: string; isAssessment: boolean; status: string | null; percent: number };
export type MapLevel = { id: string; name: string; description: string; position: number; unlocked: boolean; lessons: MapLesson[] };

/** Level map for a learner: every level (locked or not) and its published lessons with progress. */
export async function programMap(userId: string, slug: string) {
  return withUser(userId, async (tx) => {
    const [program] = await tx`select id, slug, name, tagline, description, pass_mark, audience from app.programs where slug = ${slug}`;
    if (!program) return null;
    const [enrolled] = await tx`select app.is_enrolled(${program.id}) as ok`;
    if (!enrolled.ok) return { program, enrolled: false, levels: [] as MapLevel[] };
    const levels = await tx`
      select l.id, l.name, l.description, l.position,
             exists (select 1 from app.level_unlocks u where u.level_id = l.id and u.user_id = ${userId}) as unlocked
        from app.levels l where l.program_id = ${program.id} order by l.position`;
    const lessons = await tx`
      select ls.id, ls.level_id, ls.title, ls.summary, ls.is_assessment, lp.status,
             coalesce(cardinality(lp.completed_block_ids), 0) as done_blocks,
             coalesce(jsonb_array_length(v.snapshot->'blocks'), 0) as total_blocks
        from app.lessons ls
        join app.modules m on m.id = ls.module_id
        left join app.lesson_versions v on v.id = ls.published_version_id
        left join app.lesson_progress lp on lp.lesson_id = ls.id and lp.user_id = ${userId}
       where ls.program_id = ${program.id} and ls.published_version_id is not null
       order by m.position, ls.position`;
    return {
      program,
      enrolled: true,
      levels: levels.map((l) => ({
        id: l.id, name: l.name, description: l.description, position: l.position, unlocked: l.unlocked,
        lessons: lessons.filter((x) => x.levelId === l.id).map((x) => ({
          id: x.id, title: x.title, summary: x.summary, isAssessment: x.isAssessment, status: x.status,
          percent: x.status === "completed" ? 100 : x.totalBlocks ? Math.round((x.doneBlocks / x.totalBlocks) * 100) : 0,
        })),
      })) as MapLevel[],
    };
  });
}
