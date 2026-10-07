import Link from "next/link";
import { requirePermAnywhere } from "@/lib/auth/guards";
import { withUser } from "@/lib/db";

export const metadata = { title: "Review queue" };

export default async function ReviewPage() {
  const user = await requirePermAnywhere("content.publish");
  const rows = await withUser(user.id, (tx) => tx<any[]>`
    select l.id, l.title, l.program_id, p.name as program, r.request_note, r.requested_at, u.first_name as author
      from app.content_reviews r join app.lessons l on l.id = r.lesson_id join app.programs p on p.id = l.program_id
      left join app.users u on u.id = r.requested_by
     where r.decided_at is null and app.has_perm('content.publish', l.program_id)
     order by r.requested_at`);
  return (
    <div className="space-y-4">
      <h1 className="text-3xl">Review queue</h1>
      <div className="card overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>Lesson</th><th>Program</th><th>Requested by</th><th>Note</th><th>When</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id + r.requestedAt}>
                <td><Link className="font-bold" href={`/studio/programs/${r.programId}/lessons/${r.id}`}>{r.title}</Link></td>
                <td>{r.program}</td><td>{r.author ?? "—"}</td><td className="text-sm">{r.requestNote}</td>
                <td className="text-xs">{new Date(r.requestedAt).toLocaleString("en-IN")}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="text-muted">Nothing waiting for review 🎉</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
