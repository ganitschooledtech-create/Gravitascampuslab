import { notFound } from "next/navigation";
import { LessonPlayer } from "@/components/learner/lesson-player";
import { requirePerm } from "@/lib/auth/guards";
import { withUser } from "@/lib/db";
import { blockSettingsSchema, isBlockType, validateBlock } from "@/lib/blocks/registry";
import { seededShuffle, shuffleAwayFrom } from "@/lib/content/shuffle";

export const metadata = { title: "Preview" };

/** Preview of the current DRAFT exactly as a learner would see it. Nothing is saved. */
export default async function PreviewPage({ params }: { params: Promise<{ id: string; lessonId: string }> }) {
  const { id, lessonId } = await params;
  const user = await requirePerm("content.view", { programId: id });
  const data = await withUser(user.id, async (tx) => {
    const [l] = await tx<any[]>`select ls.*, p.name as program_name, p.slug as program_slug, lv.name as level_name from app.lessons ls
                                join app.programs p on p.id = ls.program_id join app.levels lv on lv.id = ls.level_id where ls.id = ${lessonId} and ls.program_id = ${id}`;
    if (!l) return null;
    const blocks = await tx<any[]>`select id, type, content, answer_key, settings from app.lesson_blocks where lesson_id = ${lessonId} order by position`;
    return { l, blocks };
  });
  if (!data) notFound();
  const valid = data.blocks.filter((b) => isBlockType(b.type) && validateBlock(b.type, b.content, b.answerKey).ok);
  const keys = Object.fromEntries(valid.map((b) => [b.id, { type: b.type, content: b.content, answerKey: b.answerKey, settings: b.settings }]));
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <p className="mb-4 rounded-xl bg-sun/20 p-3 text-sm font-bold">👁 Preview of the current draft — answers are checked in your browser and nothing is saved.
        {valid.length < data.blocks.length && ` ${data.blocks.length - valid.length} block(s) with errors are hidden.`}</p>
      <LessonPlayer
        preview={keys}
        lesson={{
          id: lessonId, versionId: "preview", title: data.l.title, summary: data.l.summary, freeNavigation: data.l.freeNavigation, isAssessment: data.l.isAssessment,
          programId: id, programSlug: data.l.programSlug, programName: data.l.programName, levelName: data.l.levelName, progress: null, responses: {},
          blocks: valid.map((b) => {
            let content = b.content;
            if (b.type === "sort") content = { ...content, items: shuffleAwayFrom(content.items, b.answerKey.order, b.id) };
            if (b.type === "match") content = { ...content, right: seededShuffle(content.right, b.id) };
            return { id: b.id, type: b.type, content, settings: blockSettingsSchema.parse(b.settings ?? {}) };
          }),
        }}
      />
    </div>
  );
}
