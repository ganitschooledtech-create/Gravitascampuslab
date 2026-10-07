import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { ActionForm, Submit } from "@/components/ui/action-form";
import { ProgramFields } from "@/components/studio/program-fields";
import { StatusBadge } from "@/components/studio/status-badge";
import { requireStaff } from "@/lib/auth/guards";
import { withUser } from "@/lib/db";
import { can } from "@/lib/permissions";
import {
  addNodeAction, deleteNodeAction, enrollAction, moveNodeAction, overrideUnlockAction, renameNodeAction,
  setEnrollmentStatusAction, updateProgramAction,
} from "../actions";

type Tab = "structure" | "settings" | "learners";

export default async function ProgramPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: Tab }> }) {
  const { id } = await params;
  const tab: Tab = (await searchParams).tab ?? "structure";
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const user = await requireStaff();
  const a = user.assignments, scope = { programId: id };
  // Studio shows only programs you are assigned to (public programs are visible on the website, not here).
  if (!can(a, "content.view", scope) && !can(a, "program.manage", scope) && !can(a, "enrollments.view", scope)) notFound();
  const data = await withUser(user.id, async (tx) => {
    const [program] = await tx<any[]>`select * from app.programs where id = ${id}`;
    if (!program) return null;
    const levels = await tx<any[]>`select id, name, position from app.levels where program_id = ${id} order by position`;
    const modules = await tx<any[]>`select id, level_id, title, position from app.modules where program_id = ${id} order by position`;
    const lessons = await tx<any[]>`select id, module_id, title, status, has_unpublished_changes, is_assessment, position,
                                    (select count(*)::int from app.lesson_blocks b where b.lesson_id = l.id) as blocks
                                    from app.lessons l where program_id = ${id} order by position`;
    let learners: any[] = [], unlocks: any[] = [];
    if (tab === "learners") {
      learners = await tx<any[]>`
        select e.id, e.user_id, e.status, u.first_name, u.last_name, u.email, sl.username, s.code as school_code,
               (select count(*)::int from app.lesson_progress lp where lp.user_id = e.user_id and lp.program_id = ${id} and lp.status = 'completed') as done
          from app.enrollments e join app.users u on u.id = e.user_id
          left join app.school_learners sl on sl.user_id = u.id left join app.schools s on s.id = sl.school_id
         where e.program_id = ${id} order by u.first_name limit 500`;
      unlocks = await tx<any[]>`select user_id, level_id from app.level_unlocks where program_id = ${id}`;
    }
    return { program, levels, modules, lessons, learners, unlocks };
  });
  if (!data) notFound();
  const { program, levels, modules, lessons } = data;
  const canEdit = can(a, "content.edit", scope), canManage = can(a, "program.manage", scope), canPublish = can(a, "content.publish", scope);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/studio/programs" className="text-sm">← Programs</Link>
        <h1 className="text-3xl">{program.name}</h1>
        <p className="text-sm text-muted">{program.audience === "school" ? "🎒 School program" : "🎓 Adult program"} · {program.visibility} · pass mark {program.passMark}%</p>
      </div>
      <nav className="flex gap-2 border-b border-line" aria-label="Program sections">
        {(["structure", "settings", "learners"] as Tab[]).map((t) => (
          <Link key={t} href={`?tab=${t}`} aria-current={tab === t ? "page" : undefined}
            className={clsx("-mb-px border-b-4 px-3 py-2 font-semibold capitalize no-underline", tab === t ? "border-sun text-indigo-brand" : "border-transparent text-muted")}>{t}</Link>
        ))}
      </nav>

      {tab === "structure" && (
        <div className="space-y-4">
          <p className="text-sm text-muted">Program → Levels → Modules → Lessons. Click a lesson to edit its blocks.</p>
          {levels.map((lv: any, li: number) => (
            <section key={lv.id} className="card space-y-3">
              <NodeHeader kind="level" node={{ id: lv.id, title: lv.name }} programId={id} label={`Level ${li + 1}`} canEdit={canEdit || canManage} canDelete={canManage} />
              {modules.filter((m: any) => m.levelId === lv.id).map((m: any) => (
                <div key={m.id} className="ml-2 rounded-xl border border-line p-3 sm:ml-6">
                  <NodeHeader kind="module" node={{ id: m.id, title: m.title }} programId={id} label="Module" canEdit={canEdit} canDelete={canPublish} />
                  <ul className="mt-2 space-y-1">
                    {lessons.filter((l: any) => l.moduleId === m.id).map((l: any) => (
                      <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-cream px-3 py-2">
                        <Link href={`/studio/programs/${id}/lessons/${l.id}`} className="font-bold">{l.title}</Link>
                        <StatusBadge status={l.status} />
                        {l.hasUnpublishedChanges && l.status === "published" && <span className="badge bg-sun/20 text-sun-dark">unpublished edits</span>}
                        {l.isAssessment && <span className="badge bg-electric/10 text-electric-dark">level test</span>}
                        <span className="text-xs text-muted">{l.blocks} blocks</span>
                        {canEdit && <MoveButtons kind="lesson" id={l.id} programId={id} />}
                        {canPublish && <DeleteButton kind="lesson" id={l.id} programId={id} />}
                      </li>
                    ))}
                  </ul>
                  {canEdit && <AddForm kind="lesson" parentId={m.id} programId={id} placeholder="New lesson title" />}
                </div>
              ))}
              {canEdit && <AddForm kind="module" parentId={lv.id} programId={id} placeholder="New module title" />}
            </section>
          ))}
          {(canManage || canEdit) && <div className="card"><AddForm kind="level" parentId={id} programId={id} placeholder="New level name (e.g. Prompt Ninja)" /></div>}
        </div>
      )}

      {tab === "settings" && (
        <section className="card">
          {canManage ? (
            <ActionForm action={updateProgramAction} submitLabel="Save settings" submitClassName="btn-primary">
              <input type="hidden" name="id" value={id} />
              <ProgramFields p={program} />
            </ActionForm>
          ) : <p className="text-muted">Only Program Managers can change program settings.</p>}
        </section>
      )}

      {tab === "learners" && (
        <section className="card space-y-4">
          {can(a, "enrollments.manage", scope) && (
            <ActionForm action={enrollAction} submitLabel="Enroll learner" submitClassName="btn-primary">
              <input type="hidden" name="programId" value={id} />
              <label className="label" htmlFor="who">Enroll a learner by email, or SCHOOLCODE/username</label>
              <input className="input" id="who" name="who" placeholder="learner@example.com  or  DEMO01/aarav.k" />
            </ActionForm>
          )}
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Learner</th><th>Login</th><th>Status</th><th>Lessons done</th><th>Levels unlocked</th><th /></tr></thead>
              <tbody>
                {data.learners.map((e: any) => {
                  const mine = data.unlocks.filter((u: any) => u.userId === e.userId).map((u: any) => u.levelId);
                  const locked = levels.filter((l: any) => !mine.includes(l.id));
                  return (
                    <tr key={e.id}>
                      <td>{e.firstName} {e.lastName?.[0] ? e.lastName[0] + "." : ""}</td>
                      <td className="text-xs">{e.email ?? `${e.schoolCode}/${e.username}`}</td>
                      <td>{e.status}</td><td>{e.done}</td><td>{mine.length}/{levels.length}</td>
                      <td className="space-y-1">
                        {can(a, "progress.override", scope) && locked.length > 0 && (
                          <form action={overrideUnlockAction} className="flex gap-1">
                            <input type="hidden" name="programId" value={id} /><input type="hidden" name="userId" value={e.userId} />
                            <select name="levelId" className="input py-1 text-xs" aria-label="Level to unlock">{locked.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
                            <Submit label="Unlock" className="btn-ghost btn-sm" />
                          </form>
                        )}
                        {can(a, "enrollments.manage", scope) && (
                          <form action={setEnrollmentStatusAction}>
                            <input type="hidden" name="programId" value={id} /><input type="hidden" name="id" value={e.id} />
                            <input type="hidden" name="status" value={e.status === "active" ? "cancelled" : "active"} />
                            <Submit label={e.status === "active" ? "Remove" : "Re-activate"} className="btn-ghost btn-sm" />
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {data.learners.length === 0 && <tr><td colSpan={6} className="text-muted">No learners enrolled yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function NodeHeader({ kind, node, programId, label, canEdit, canDelete }: { kind: "level" | "module"; node: { id: string; title: string }; programId: string; label: string; canEdit: boolean; canDelete: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="badge bg-indigo-brand text-white">{label}</span>
      {canEdit ? (
        <form action={renameNodeAction} className="flex flex-1 items-center gap-1">
          <input type="hidden" name="programId" value={programId} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={node.id} />
          <input name="title" defaultValue={node.title} className="input max-w-sm py-1 font-heading" aria-label={`${label} name`} />
          <Submit label="Rename" className="btn-ghost btn-sm" />
        </form>
      ) : <span className="flex-1 font-heading text-lg">{node.title}</span>}
      {canEdit && <MoveButtons kind={kind} id={node.id} programId={programId} />}
      {canDelete && <DeleteButton kind={kind} id={node.id} programId={programId} />}
    </div>
  );
}

function MoveButtons({ kind, id, programId }: { kind: string; id: string; programId: string }) {
  return (
    <span className="flex gap-1">
      {(["up", "down"] as const).map((dir) => (
        <form key={dir} action={moveNodeAction}>
          <input type="hidden" name="programId" value={programId} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} /><input type="hidden" name="dir" value={dir} />
          <button className="btn-ghost btn-sm" aria-label={`Move ${kind} ${dir}`}>{dir === "up" ? "↑" : "↓"}</button>
        </form>
      ))}
    </span>
  );
}

function DeleteButton({ kind, id, programId }: { kind: string; id: string; programId: string }) {
  return (
    <form action={deleteNodeAction}>
      <input type="hidden" name="programId" value={programId} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} />
      <details className="relative">
        <summary className="btn-ghost btn-sm cursor-pointer list-none text-bad" aria-label={`Delete ${kind}`}>🗑</summary>
        <div className="absolute right-0 z-10 mt-1 w-56 rounded-xl border border-line bg-white p-3 text-sm shadow-lg">
          <p className="mb-2">Delete this {kind} and everything inside it, including learner progress?</p>
          <button className="btn-danger btn-sm">Yes, delete</button>
        </div>
      </details>
    </form>
  );
}

function AddForm({ kind, parentId, programId, placeholder }: { kind: string; parentId: string; programId: string; placeholder: string }) {
  return (
    <ActionForm action={addNodeAction} submitLabel={`+ Add ${kind}`} className="mt-2 flex flex-wrap items-start gap-2 space-y-0" submitClassName="btn-ghost btn-sm">
      <input type="hidden" name="programId" value={programId} /><input type="hidden" name="kind" value={kind} /><input type="hidden" name="parentId" value={parentId} />
      <input name="title" className="input max-w-sm py-1" placeholder={placeholder} aria-label={placeholder} />
    </ActionForm>
  );
}
