import { notFound } from "next/navigation";
import { ActionForm, Submit } from "@/components/ui/action-form";
import { PinForm } from "@/components/studio/pin-form";
import { requireStaff } from "@/lib/auth/guards";
import { withUser } from "@/lib/db";
import { can, canAnywhere } from "@/lib/permissions";
import { addLearnerAction, createSchoolAction, resetPinAction, unlockAccountAction } from "./actions";

export const metadata = { title: "Schools" };

export default async function SchoolsPage({ searchParams }: { searchParams: Promise<{ school?: string }> }) {
  const user = await requireStaff();
  const a = user.assignments;
  if (!canAnywhere(a, "schools.view") && !canAnywhere(a, "school.view_learners")) notFound();
  const selected = (await searchParams).school;
  const d = await withUser(user.id, async (tx) => {
    const schools = await tx<any[]>`select s.id, s.name, s.code, s.city, (select count(*)::int from app.school_learners sl where sl.school_id = s.id) as learners from app.schools s order by s.name`;
    const sid = selected ?? schools[0]?.id;
    const learners = sid ? await tx<any[]>`
      select u.id, u.first_name, u.last_name, u.locked_until, u.last_login_at, sl.username, sl.class, sl.section
        from app.school_learners sl join app.users u on u.id = sl.user_id where sl.school_id = ${sid} order by sl.class, u.first_name limit 1000` : [];
    return { schools, sid, learners };
  });
  const school = d.schools.find((s) => s.id === d.sid);
  const manageLearners = school && can(a, "learners.manage", { schoolId: school.id });
  return (
    <div className="space-y-4">
      <h1 className="text-3xl">Schools</h1>
      <div className="flex flex-wrap gap-2">
        {d.schools.map((s) => <a key={s.id} href={`?school=${s.id}`} className={`btn-sm btn no-underline ${s.id === d.sid ? "bg-indigo-brand text-white" : "btn-ghost"}`}>{s.name} ({s.code}) · {s.learners}</a>)}
      </div>
      {school && (
        <section className="card space-y-3">
          <h2 className="text-xl">{school.name} <span className="text-sm text-muted">· login code <b>{school.code}</b></span></h2>
          {manageLearners && (
            <PinForm action={addLearnerAction} label="Add learner" className="flex flex-wrap items-end gap-2 rounded-xl bg-cream p-3">
              <input type="hidden" name="schoolId" value={school.id} />
              <input name="first" className="input w-36" placeholder="First name" aria-label="First name" required />
              <input name="last" className="input w-36" placeholder="Last name" aria-label="Last name" />
              <input name="class" className="input w-24" placeholder="Class" aria-label="Class" />
              <input name="section" className="input w-20" placeholder="Sec" aria-label="Section" />
            </PinForm>
          )}
          <p className="text-xs text-muted">Bulk CSV import and printable login slips arrive in Phase 2. Only first name and last initial are needed (data minimisation).</p>
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Username</th><th>Class</th><th>Last login</th><th>Status</th>{manageLearners && <th>Actions</th>}</tr></thead>
              <tbody>
                {d.learners.map((l) => {
                  const locked = l.lockedUntil && new Date(l.lockedUntil) > new Date();
                  return (
                    <tr key={l.id}>
                      <td>{l.firstName} {l.lastName?.[0] ? l.lastName[0] + "." : ""}</td><td className="font-mono">{l.username}</td>
                      <td>{l.class ?? ""}{l.section ? `-${l.section}` : ""}</td>
                      <td className="text-xs">{l.lastLoginAt ? new Date(l.lastLoginAt).toLocaleString("en-IN") : "never"}</td>
                      <td>{locked ? <span className="badge bg-red-100 text-bad">locked</span> : <span className="badge bg-green-100 text-ok">ok</span>}</td>
                      {manageLearners && (
                        <td className="space-y-1">
                          <PinForm action={resetPinAction} label="Reset PIN"><input type="hidden" name="schoolId" value={school.id} /><input type="hidden" name="userId" value={l.id} /></PinForm>
                          {locked && <form action={unlockAccountAction}><input type="hidden" name="schoolId" value={school.id} /><input type="hidden" name="userId" value={l.id} /><Submit label="Unlock" className="btn-ghost btn-sm" /></form>}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {d.learners.length === 0 && <tr><td colSpan={6} className="text-muted">No learners yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {can(a, "schools.manage") && (
        <section className="card">
          <h2 className="mb-2 text-lg">Add a school</h2>
          <ActionForm action={createSchoolAction} submitLabel="Create school" submitClassName="btn-primary btn-sm">
            <div className="grid gap-2 sm:grid-cols-3">
              <input name="name" className="input" placeholder="School name" aria-label="School name" required />
              <input name="code" className="input uppercase" placeholder="Login code e.g. GDG01" aria-label="School code" required />
              <input name="city" className="input" placeholder="City" aria-label="City" />
            </div>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
