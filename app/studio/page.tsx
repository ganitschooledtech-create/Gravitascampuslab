import Link from "next/link";
import { requireStaff } from "@/lib/auth/guards";
import { withUser } from "@/lib/db";
import { StatusBadge } from "@/components/studio/status-badge";

export const metadata = { title: "Studio" };

export default async function StudioHome() {
  const user = await requireStaff();
  const stats = await withUser(user.id, async (tx) => {
    const [s] = await tx<any[]>`
      select (select count(*)::int from app.programs where archived_at is null) as programs,
             (select count(*)::int from app.lessons where status = 'published') as published,
             (select count(*)::int from app.lessons where status = 'in_review') as in_review,
             (select count(*)::int from app.lessons where has_unpublished_changes and status <> 'in_review') as drafts,
             (select count(*)::int from app.enrollments where status = 'active') as enrollments,
             (select count(*)::int from app.submissions where status = 'submitted') as to_grade`;
    const recent = await tx<any[]>`select id, title, status, program_id, updated_at from app.lessons order by updated_at desc limit 6`;
    return { ...s, recent };
  });
  const tiles = [
    ["Programs", stats.programs, "/studio/programs"],
    ["Published lessons", stats.published, "/studio/programs"],
    ["Waiting for review", stats.inReview, "/studio/review"],
    ["Unpublished drafts", stats.drafts, "/studio/programs"],
    ["Active enrollments", stats.enrollments, "/studio/programs"],
    ["Submissions to grade", stats.toGrade, "/studio/submissions"],
  ] as const;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Welcome, {user.firstName}</h1>
      <p className="text-sm text-muted">Numbers below only include programs you have access to.</p>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(([label, n, href]) => (
          <li key={label}><Link href={href} className="card block no-underline hover:border-sun">
            <span className="block font-heading text-3xl text-indigo-brand">{n}</span><span className="text-sm text-muted">{label}</span>
          </Link></li>
        ))}
      </ul>
      {stats.recent.length > 0 && (
        <section className="card">
          <h2 className="mb-2 text-lg">Recently edited lessons</h2>
          <ul className="divide-y divide-line">
            {stats.recent.map((l: any) => (
              <li key={l.id} className="flex justify-between py-2">
                <Link href={`/studio/programs/${l.programId}/lessons/${l.id}`}>{l.title}</Link>
                <StatusBadge status={l.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
