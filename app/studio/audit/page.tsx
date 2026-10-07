import { requirePerm } from "@/lib/auth/guards";
import { withUser } from "@/lib/db";

export const metadata = { title: "Audit log" };

function changes(before: any, after: any) {
  if (!before || !after) return null;
  return Object.keys(after).filter((k) => !["updated_at"].includes(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => `${k}: ${JSON.stringify(before[k])?.slice(0, 60)} → ${JSON.stringify(after[k])?.slice(0, 60)}`);
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ table?: string; page?: string }> }) {
  const sp = await searchParams;
  const table = sp.table ?? "";
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const user = await requirePerm("audit.view");
  const rows = await withUser(user.id, (tx) => tx<any[]>`
    select a.id, a.at, a.action, a.table_name, a.record_id, a.before, a.after, a.meta, u.first_name, u.last_name, u.email
      from app.audit_log a left join app.users u on u.id = a.actor_id
     where (${table} = '' or a.table_name = ${table}) order by a.id desc limit 100 offset ${page * 100}`);
  const tables = ["", "programs", "levels", "modules", "lessons", "lesson_blocks", "lesson_versions", "content_reviews", "users", "role_assignments", "roles", "role_permissions", "enrollments", "level_unlocks", "schools", "school_learners", "media", "settings", "feature_flags", "submissions"];
  return (
    <div className="space-y-4">
      <h1 className="text-3xl">Audit log</h1>
      <p className="text-sm text-muted">Every change by the team is recorded automatically by the database — who, what, when, before and after. Passwords and PINs are never logged.</p>
      <form className="flex gap-2"><select name="table" defaultValue={table} className="input max-w-xs" aria-label="Filter by area">{tables.map((t) => <option key={t} value={t}>{t || "Everything"}</option>)}</select><button className="btn-ghost">Filter</button></form>
      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>What</th><th>Changes</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const c = changes(r.before, r.after);
              return (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-xs">{new Date(r.at).toLocaleString("en-IN")}</td>
                  <td className="text-sm">{r.firstName ? `${r.firstName} ${r.lastName ?? ""}` : "system"}</td>
                  <td><span className="badge bg-cream">{r.action}</span></td>
                  <td className="text-xs">{r.tableName}<br /><span className="text-muted">{r.recordId?.slice(0, 8)}</span></td>
                  <td className="max-w-md text-xs">{c ? c.slice(0, 6).map((x, i) => <div key={i} className="truncate" title={x}>{x}</div>) : r.action === "INSERT" ? (r.after?.title ?? r.after?.name ?? r.after?.email ?? "created") : r.meta ? JSON.stringify(r.meta).slice(0, 120) : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">{page > 0 && <a className="btn-ghost no-underline" href={`?table=${table}&page=${page - 1}`}>← Newer</a>}{rows.length === 100 && <a className="btn-ghost no-underline" href={`?table=${table}&page=${page + 1}`}>Older →</a>}</div>
    </div>
  );
}
