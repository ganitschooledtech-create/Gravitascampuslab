import { notFound } from "next/navigation";
import { LessonPlayer } from "@/components/learner/lesson-player";
import { requireUser } from "@/lib/auth/guards";
import { getLearnerLesson } from "@/lib/learning/service";

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireUser();
  const lesson = await getLearnerLesson(user.id, id);
  if (!lesson) notFound();
  return <LessonPlayer lesson={lesson} />;
}
