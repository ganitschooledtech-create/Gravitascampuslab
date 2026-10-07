import Link from "next/link";
import { Logo } from "@/components/ui/logo";

// Temporary home page. The full public website (programs, events, blog) is built in Phase 3.
export default function Home() {
  return (
    <main id="main" className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-4"><Logo /><Link href="/login" className="btn-primary no-underline">Log in</Link></header>
      <section className="mx-auto flex max-w-3xl flex-1 flex-col items-center justify-center px-6 text-center">
        <h1 className="text-4xl text-indigo-brand sm:text-5xl">Learn AI by <span className="text-sun-dark">doing</span>.</h1>
        <p className="mt-4 text-lg text-muted">Hands-on AI and technology programs for school students, graduates and professionals — from Gadag, Karnataka.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/school-login" className="btn-accent no-underline">🎒 School student login</Link>
          <Link href="/login" className="btn-ghost no-underline">Learner &amp; team login</Link>
        </div>
      </section>
    </main>
  );
}
