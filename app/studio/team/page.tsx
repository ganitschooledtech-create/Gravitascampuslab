import { ActionForm, Submit } from "@/components/ui/action-form";
import { requireStaff } from "@/lib/auth/guards";
import { withUser } from "@/lib/db";
import { can } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { assignRoleAction, inviteAction, removeAssignmentAction, saveRoleAction } from "./actions";

export const metadata = { title: "Team & roles" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const user = await requireStaff();
  const manage = can(user.assignments, "team.manage");
  if (!manage && !can(user.assignments, "team.view")) notFound();
  const editRole = (await searchParams).role;
  const d = await withUser(user.id, async (tx) => ({
    assignments: await tx<any[]>`
      select ra.id, u.first_name, u.last_name, u.email, r.name as role, r.key as role_key, p.name as program, s.name as school, u.last_login_at
        from app.role_assignments ra join app.users u on u.id = ra.user_id join app.roles r on r.id = ra.role_id
        left join app.programs p on p.id = ra.program_id left join app.schools s on s.id = ra.school_id
       order by u.first_name, r.name`,
    roles: await tx<any[]>`select r.id, r.key, r.name, r.description, r.is_system, array_remove(array_agg(rp.permission_key order by rp.permission_key), null) as perms
                           from app.roles r left join app.role_permissions rp on rp.role_id = r.id group by r.id order by r.is_system desc, r.name`,
    permissions: await tx<any[]>`select key, description, category, scope from app.permissions where key <> '*' order by category, key`,
    programs: await tx<any[]>`select id, name from app.programs order by name`,
    schools: await tx<any[]>`select id, name from app.schools order by name`,
  }));
  const role = d.roles.find((r) => r.id === editRole && !r.isSystem);
  const byCat = d.permissions.reduce<Record<string, any[]>>((g, p) => ((g[p.category] ??= []).push(p), g), {});
  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Team &amp; roles</h1>
      <section className="card overflow-x-auto">
        <h2 className="mb-2 text-lg">Who can do what</h2>
        <table className="data-table">
          <thead><tr><th>Person</th><th>Role</th><th>Scope</th><th>Last login</th><th /></tr></thead>
          <tbody>
            {d.assignments.map((a) => (
              <tr key={a.id}>
                <td>{a.firstName} {a.lastName}<div className="text-xs text-muted">{a.email}</div></td>
                <td>{a.role}</td>
                <td className="text-sm">{a.program ? `Program: ${a.program}` : a.school ? `School: ${a.school}` : "All"}</td>
                <td className="text-xs">{a.lastLoginAt ? new Date(a.lastLoginAt).toLocaleDateString("en-IN") : "never"}</td>
                <td>{manage && <form action={removeAssignmentAction}><input type="hidden" name="id" value={a.id} /><Submit label="Remove" className="btn-ghost btn-sm" /></form>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {manage && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="card">
            <h2 className="mb-2 text-lg">1. Invite a team member</h2>
            <ActionForm action={inviteAction} submitLabel="Send invitation" submitClassName="btn-primary btn-sm">
              <div className="grid gap-2 sm:grid-cols-2">
                <input name="first" className="input" placeholder="First name" aria-label="First name" required />
                <input name="last" className="input" placeholder="Last name" aria-label="Last name" />
              </div>
              <input name="email" type="email" className="input" placeholder="email@example.com" aria-label="Email" required />
            </ActionForm>
          </section>
          <section className="card">
            <h2 className="mb-2 text-lg">2. Assign a role</h2>
            <ActionForm action={assignRoleAction} submitLabel="Assign role" submitClassName="btn-primary btn-sm">
              <input name="email" type="email" className="input" placeholder="Team member's email" aria-label="Team member email" required />
              <select name="roleId" className="input" aria-label="Role">{d.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
              <div className="grid gap-2 sm:grid-cols-2">
                <select name="programId" className="input" aria-label="Limit to program"><option value="">Any program</option>{d.programs.map((p) => <option key={p.id} value={p.id}>Only: {p.name}</option>)}</select>
                <select name="schoolId" className="input" aria-label="Limit to school"><option value="">Any school</option>{d.schools.map((s) => <option key={s.id} value={s.id}>Only: {s.name}</option>)}</select>
              </div>
              <p className="text-xs text-muted">Tip: give Authors/Reviewers a program, and Coordinators/Trainers a school, so they only see what they need.</p>
            </ActionForm>
          </section>
        </div>
      )}

      <section className="card">
        <h2 className="mb-2 text-lg">Roles</h2>
        <ul className="space-y-2">
          {d.roles.map((r) => (
            <li key={r.id} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b>{r.name}</b>{r.isSystem ? <span className="badge bg-line text-muted">built-in</span> : manage && <a href={`?role=${r.id}#role-form`} className="text-sm">Edit</a>}
              </div>
              <p className="text-sm text-muted">{r.description}</p>
              <p className="mt-1 text-xs">{r.perms.includes("*") ? "All permissions" : r.perms.join(" · ")}</p>
            </li>
          ))}
        </ul>
      </section>

      {manage && (
        <section className="card" id="role-form">
          <h2 className="mb-2 text-lg">{role ? `Edit role: ${role.name}` : "Create a custom role"}</h2>
          <ActionForm action={saveRoleAction} submitLabel={role ? "Save role" : "Create role"} submitClassName="btn-primary btn-sm">
            <input type="hidden" name="id" value={role?.id ?? ""} />
            <div className="grid gap-2 sm:grid-cols-2">
              <input name="name" className="input" placeholder="Role name" defaultValue={role?.name} aria-label="Role name" required />
              <input name="description" className="input" placeholder="What is this role for?" defaultValue={role?.description ?? ""} aria-label="Description" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(byCat).map(([cat, perms]) => (
                <fieldset key={cat} className="rounded-xl bg-cream p-3"><legend className="font-bold capitalize">{cat}</legend>
                  {perms.map((p: any) => (
                    <label key={p.key} className="flex items-start gap-2 text-sm"><input type="checkbox" name="perms" value={p.key} defaultChecked={role?.perms.includes(p.key)} className="mt-1" />
                      <span>{p.description} <span className="text-xs text-muted">({p.scope})</span></span></label>
                  ))}
                </fieldset>
              ))}
            </div>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
