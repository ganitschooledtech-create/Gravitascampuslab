import { notFound } from "next/navigation";
import { LessonEditor } from "@/components/studio/lesson-editor";
import { requirePerm } from "@/lib/auth/guards";
import { withUser } from "@/lib/db";
import { can } from "@/lib/permissions";

export const metadata = { title: "Edit lesson" };

export default async function EditLessonPage({ params }: { params: Promise<{ id: string; lessonId: string }> }) {
  const { id, lessonId } = await params;
  if (![id, lessonId].every((x) => /^[0-9a-f-]{36}$/i.test(x))) notFound();
  const user = await requirePerm("content.view", { programId: id });
  const data = await withUser(user.id, async (tx) => {
    const [lesson] = await tx<any[]>`select id, title, summary, status, free_navigation, is_assessment, estimated_minutes, has_unpublished_changes, published_version_id
                                     from app.lessons where id = ${lessonId} and program_id = ${id}`;
    if (!lesson) return null;
    const blocks = await tx<any[]>`select id, type, content, answer_key, settings from app.lesson_blocks where lesson_id = ${lessonId} order by position`;
    const versions = await tx<any[]>`select v.id, v.version_no, v.published_at, v.note, u.first_name as publisher
                                     from app.lesson_versions v left join app.users u on u.id = v.published_by where v.lesson_id = ${lessonId} order by v.version_no desc`;
    const [openReview] = await tx<any[]>`select r.request_note as note, u.first_name as by from app.content_reviews r left join app.users u on u.id = r.requested_by
                                         where r.lesson_id = ${lessonId} and r.decided_at is null order by r.requested_at desc limit 1`;
    const [lastDecision] = await tx<any[]>`select decision, decision_note as note from app.content_reviews where lesson_id = ${lessonId} and decided_at is not null order by decided_at desc limit 1`;
    const library = await tx<any[]>`select id, title, type from app.reusable_blocks where program_id = ${id} or program_id is null order by title limit 200`;
    return { lesson, blocks, versions, openReview, lastDecision, library };
  });
  if (!data) notFound();
  const { lesson } = data;
  return (
    <LessonEditor
      programId={id}
      lesson={{ id: lesson.id, title: lesson.title, summary: lesson.summary, status: lesson.status, freeNavigation: lesson.freeNavigation, isAssessment: lesson.isAssessment, estimatedMinutes: lesson.estimatedMinutes, hasUnpublishedChanges: lesson.hasUnpublishedChanges }}
      blocks={data.blocks.map((b) => ({ id: b.id, type: b.type, content: b.content, answerKey: b.answerKey, settings: b.settings }))}
      versions={data.versions.map((v) => ({ id: v.id, versionNo: v.versionNo, publishedAt: new Date(v.publishedAt).toISOString(), note: v.note, publisher: v.publisher, live: v.id === lesson.publishedVersionId }))}
      openReview={data.openReview ?? null}
      lastDecision={data.lastDecision ?? null}
      library={data.library}
      canEdit={can(user.assignments, "content.edit", { programId: id })}
      canPublish={can(user.assignments, "content.publish", { programId: id })}
    />
  );
}
