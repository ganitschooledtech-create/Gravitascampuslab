import Link from "next/link";
import { notFound } from "next/navigation";
import { ProgressBar } from "@/components/ui/progress";
import { requireUser } from "@/lib/auth/guards";
import { programMap } from "@/lib/learning/queries";

export default async function ProgramMapPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const data = await programMap(user.id, slug);
  if (!data) notFound();
  const { program, levels } = data;
  if (!data.enrolled) {
    return <div className="card"><h1 className="text-2xl">{program.name}</h1><p className="mt-2 text-muted">You are not enrolled in this program.</p></div>;
  }
  return (
    <div className="space-y-6">
      <div>
        <Link href="/learn" className="text-sm">← My programs</Link>
        <h1 className="mt-1 text-3xl text-indigo-brand">{program.name}</h1>
        {program.tagline && <p className="text-muted">{program.tagline}</p>}
      </div>
      <ol className="space-y-4" aria-label="Levels">
        {levels.map((lv, i) => {
          const done = lv.lessons.filter((l) => l.status === "completed").length;
          return (
            <li key={lv.id} className={`card ${lv.unlocked ? "" : "opacity-70"}`}>
              <div className="flex items-center gap-3">
                <span aria-hidden className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl font-heading text-xl ${lv.unlocked ? "bg-sun text-indigo-brand" : "bg-line text-muted"}`}>
                  {lv.unlocked ? i + 1 : "🔒"}
                </span>
                <div className="flex-1">
                  <h2 className="text-xl">Level {i + 1}: {lv.name}</h2>
                  <p className="text-sm text-muted">{lv.description}</p>
                </div>
                {!lv.unlocked && <span className="badge bg-line text-muted">Locked</span>}
              </div>
              {lv.unlocked && lv.lessons.length > 0 && (
                <>
                  <div className="my-3"><ProgressBar value={(done / lv.lessons.length) * 100} label={`${lv.name} progress`} /></div>
                  <ul className="divide-y divide-line">
                    {lv.lessons.map((ls) => (
                      <li key={ls.id}>
                        {/* The whole row is one link, so learners can tap anywhere (big touch target for lab computers). */}
                        <Link href={`/learn/lessons/${ls.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-xl px-2 py-3 text-ink no-underline hover:bg-cream">
                          <span>
                            <span className="font-bold text-electric-dark">{ls.title}</span>
                            {ls.isAssessment && <span className="badge ml-2 bg-electric/10 text-electric-dark">Level test</span>}
                            <span className="block text-sm text-muted">{ls.summary}</span>
                          </span>
                          {ls.status === "completed"
                            ? <span className="shrink-0 text-sm font-bold text-ok">✅ Done · Review</span>
                            : <span className="btn-accent btn-sm shrink-0">{ls.percent ? `Continue (${ls.percent}%)` : "Start →"}</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {lv.unlocked && lv.lessons.length === 0 && <p className="mt-3 text-sm text-muted">Lessons coming soon.</p>}
              {!lv.unlocked && <p className="mt-3 text-sm text-muted">Pass the previous level (score {program.passMark}% or more) to unlock.</p>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
