import Link from "next/link";
import { ActionForm, Submit } from "@/components/ui/action-form";
import { ProgramFields } from "@/components/studio/program-fields";
import { requireStaff } from "@/lib/auth/guards";
import { withUser } from "@/lib/db";
import { canAnywhere } from "@/lib/permissions";
import { cloneProgramAction, createProgramAction } from "./actions";

export const metadata = { title: "Programs" };

export default async function ProgramsPage() {
  const user = await requireStaff();
  const programs = await withUser(user.id, (tx) => tx<any[]>`
    select p.id, p.name, p.slug, p.audience, p.visibility, p.is_template,
           (select count(*)::int from app.levels l where l.program_id = p.id) as levels,
           (select count(*)::int from app.lessons ls where ls.program_id = p.id) as lessons,
           (select count(*)::int from app.enrollments e where e.program_id = p.id and e.status = 'active') as learners
      from app.programs p where p.archived_at is null and (app.has_perm('content.view', p.id) or app.has_perm('program.manage', p.id))
      order by p.is_template, p.name`);
  const canCreate = canAnywhere(user.assignments, "program.create") && user.assignments.some((a) => !a.programId && (a.permissions.includes("*") || a.permissions.includes("program.create")));
  const templates = programs.filter((p) => p.isTemplate);
  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Programs</h1>
      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>Program</th><th>Audience</th><th>Visibility</th><th>Levels</th><th>Lessons</th><th>Learners</th></tr></thead>
          <tbody>
            {programs.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/studio/programs/${p.id}`} className="font-bold">{p.name}</Link>{p.isTemplate && <span className="badge ml-2 bg-electric/10 text-electric-dark">template</span>}
                  <div className="text-xs text-muted">/{p.slug}</div></td>
                <td>{p.audience === "school" ? "🎒 School" : "🎓 Adult"}</td><td>{p.visibility}</td><td>{p.levels}</td><td>{p.lessons}</td><td>{p.learners}</td>
              </tr>
            ))}
            {programs.length === 0 && <tr><td colSpan={6} className="text-muted">No programs assigned to you yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {canCreate && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card">
            <h2 className="mb-3 text-xl">Create a new program</h2>
            <ActionForm action={createProgramAction} submitLabel="Create program" submitClassName="btn-primary"><ProgramFields /></ActionForm>
          </section>
          <section className="card">
            <h2 className="mb-1 text-xl">Start from a copy</h2>
            <p className="mb-3 text-sm text-muted">Copies all levels, modules, lessons and blocks as unpublished drafts.</p>
            <ul className="space-y-2">
              {(templates.length ? templates : programs).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <span>{p.name}</span>
                  <form action={cloneProgramAction}><input type="hidden" name="id" value={p.id} /><Submit label="Clone" className="btn-ghost btn-sm" /></form>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
