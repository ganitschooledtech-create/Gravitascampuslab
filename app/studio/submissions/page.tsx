import { ActionForm } from "@/components/ui/action-form";
import { requirePermAnywhere } from "@/lib/auth/guards";
import { withUser } from "@/lib/db";
import { gradeSubmissionAction } from "./actions";

export const metadata = { title: "Submissions" };

export default async function SubmissionsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const status = (await searchParams).status === "graded" ? "graded" : "submitted";
  const user = await requirePermAnywhere("submissions.grade");
  const rows = await withUser(user.id, (tx) => tx<any[]>`
    select s.*, u.first_name, u.last_name, l.title as lesson, p.name as program,
           (select b->'content' from app.lesson_versions v, jsonb_array_elements(v.snapshot->'blocks') b
             where v.id = l.published_version_id and (b->>'id')::uuid = s.block_id) as block
      from app.submissions s join app.users u on u.id = s.user_id join app.lessons l on l.id = s.lesson_id join app.programs p on p.id = s.program_id
     where s.status = ${status} and app.has_perm('submissions.grade', s.program_id)
     order by s.created_at limit 100`);
  return (
    <div className="space-y-4">
      <h1 className="text-3xl">Submissions</h1>
      <nav className="flex gap-2"><a href="?status=submitted" className={status === "submitted" ? "font-bold" : ""}>To grade</a> · <a href="?status=graded" className={status === "graded" ? "font-bold" : ""}>Graded</a></nav>
      {rows.length === 0 && <p className="card text-muted">Nothing here.</p>}
      {rows.map((s) => {
        const rubric = (s.block?.rubric ?? []) as { criterion: string; description: string; maxPoints: number }[];
        const prev = (s.rubricScores ?? []) as { score: number }[];
        return (
          <article key={s.id} className="card space-y-3">
            <header className="flex flex-wrap justify-between gap-2">
              <div><b>{s.firstName} {s.lastName?.[0]}.</b> · {s.program} · {s.lesson}</div>
              <span className="text-xs text-muted">{new Date(s.createdAt).toLocaleString("en-IN")}</span>
            </header>
            {s.block?.prompt && <p className="text-sm text-muted">Task: {s.block.prompt}</p>}
            <div className="rounded-xl bg-cream p-3">
              {s.kind === "text" && <p className="whitespace-pre-wrap">{s.bodyText}</p>}
              {s.kind === "link" && <a href={s.url} target="_blank" rel="noopener noreferrer nofollow">{s.url}</a>}
              {(s.kind === "file" || s.kind === "screenshot") && <a href={`/files/${s.fileKey}`} target="_blank" rel="noopener noreferrer">📎 {s.fileName ?? "Open file"}</a>}
            </div>
            <ActionForm action={gradeSubmissionAction} submitLabel="Save grade" submitClassName="btn-primary btn-sm">
              <input type="hidden" name="id" value={s.id} /><input type="hidden" name="programId" value={s.programId} />
              {rubric.length > 0 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {rubric.map((c, i) => (
                    <label key={i} className="text-sm"><b>{c.criterion}</b> (0–{c.maxPoints}) <span className="text-muted">{c.description}</span>
                      <input name={`c${i}`} type="number" min={0} max={c.maxPoints} step="0.5" defaultValue={prev[i]?.score ?? ""} className="input mt-1 w-28" required /></label>
                  ))}
                </div>
              )}
              <label className="label" htmlFor={`fb-${s.id}`}>Feedback for the learner</label>
              <textarea id={`fb-${s.id}`} name="feedback" className="input" defaultValue={s.feedback ?? ""} />
              <label className="text-sm"><input type="checkbox" name="return" /> Return to learner for changes</label>
            </ActionForm>
          </article>
        );
      })}
    </div>
  );
}
