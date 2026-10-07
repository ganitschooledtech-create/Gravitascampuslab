"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionUser, ActionError } from "@/lib/auth/guards";
import { withSystem, withUser } from "@/lib/db";

export async function gradeSubmissionAction(_: unknown, form: FormData): Promise<{ error?: string; message?: string }> {
  try {
    const id = z.string().uuid().parse(form.get("id"));
    const programId = z.string().uuid().parse(form.get("programId"));
    const u = await actionUser("submissions.grade", { programId });
    // Rubric comes from the published lesson snapshot (server-side), never from the browser.
    const rubric = await withSystem(async (tx) => {
      const [r] = await tx`select b->'content'->'rubric' as rubric from app.submissions s
        join app.lessons l on l.id = s.lesson_id join app.lesson_versions v on v.id = l.published_version_id,
        jsonb_array_elements(v.snapshot->'blocks') b where s.id = ${id} and (b->>'id')::uuid = s.block_id`;
      return (r?.rubric ?? []) as { criterion: string; maxPoints: number }[];
    });
    const scores = rubric.map((c, i) => {
      const v = Number(form.get(`c${i}`));
      if (!Number.isFinite(v) || v < 0 || v > c.maxPoints) throw new ActionError(`"${c.criterion}" must be between 0 and ${c.maxPoints}.`);
      return { criterion: c.criterion, score: v, max: c.maxPoints };
    });
    const total = scores.reduce((s, x) => s + x.score, 0), max = scores.reduce((s, x) => s + x.max, 0);
    const feedback = String(form.get("feedback") ?? "").slice(0, 3000);
    const status = form.get("return") === "on" ? "returned" : "graded";
    await withUser(u.id, async (tx) => {
      const r = await tx`update app.submissions set rubric_scores = ${tx.json(scores)}, score = ${rubric.length ? total : null}, max_score = ${rubric.length ? max : null},
               feedback = ${feedback}, status = ${status}, graded_by = ${u.id}, graded_at = now() where id = ${id} returning id`;
      if (!r.length) throw new ActionError("Submission not found or no permission.");
    });
    revalidatePath("/studio/submissions");
    return { message: "Grade saved ✓" };
  } catch (e) {
    return { error: e instanceof ActionError || e instanceof z.ZodError ? (e as Error).message : "Could not save grade." };
  }
}
