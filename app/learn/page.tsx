import Link from "next/link";
import { ProgressBar } from "@/components/ui/progress";
import { requireUser } from "@/lib/auth/guards";
import { myPrograms } from "@/lib/learning/queries";

export const metadata = { title: "My learning" };

export default async function LearnHome() {
  const user = await requireUser();
  const programs = await myPrograms(user.id);
  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-indigo-brand p-6 text-white">
        <h1 className="text-3xl">Hi {user.firstName}! ⚡</h1>
        <p className="mt-1 text-white/80">Ready to explore? Pick up where you left off.</p>
      </section>
      <section aria-labelledby="mine">
        <h2 id="mine" className="mb-3 text-xl">My programs</h2>
        {programs.length === 0 ? (
          <div className="card text-muted">You are not enrolled in any program yet. Your trainer or the Gravitas team will add you.</div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {programs.map((p) => {
              const pct = p.totalLessons ? (p.doneLessons / p.totalLessons) * 100 : 0;
              return (
                <li key={p.id} className="card flex flex-col gap-3">
                  <div>
                    <h3 className="text-lg text-indigo-brand">{p.name}</h3>
                    {p.tagline && <p className="text-sm text-muted">{p.tagline}</p>}
                  </div>
                  <ProgressBar value={pct} label={`${p.name} progress`} />
                  <p className="text-sm text-muted">
                    {p.doneLessons}/{p.totalLessons} lessons · Level {p.levelsUnlocked} of {p.totalLevels} unlocked
                  </p>
                  <div className="mt-auto flex gap-2">
                    {p.resumeLessonId && <Link className="btn-accent no-underline" href={`/learn/lessons/${p.resumeLessonId}`}>Continue</Link>}
                    <Link className="btn-ghost no-underline" href={`/learn/programs/${p.slug}`}>Level map</Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
