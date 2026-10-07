import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm } from "@/components/ui/action-form";
import { getSessionUser } from "@/lib/auth/session";
import { magicLinkAction, passwordLoginAction } from "../actions";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; mode?: string }> }) {
  if (await getSessionUser()) redirect("/learn");
  const { next, mode } = await searchParams;
  const magic = mode === "magic";
  return (
    <div className="space-y-4">
      <Link href="/school-login" className="card flex items-center justify-between no-underline hover:border-sun">
        <span>
          <span className="block font-heading text-lg text-indigo-brand">🎒 I&apos;m a school student</span>
          <span className="text-sm text-muted">Log in with your school code, username and PIN</span>
        </span>
        <span aria-hidden className="text-2xl">→</span>
      </Link>
      <div className="card">
        <h1 className="mb-4 text-2xl">{magic ? "Email me a login link" : "Log in with email"}</h1>
        {magic ? (
          <ActionForm action={magicLinkAction} submitLabel="Send login link">
            <div><label className="label" htmlFor="email">Email</label>
              <input className="input" id="email" name="email" type="email" autoComplete="email" required /></div>
          </ActionForm>
        ) : (
          <ActionForm action={passwordLoginAction} submitLabel="Log in">
            <input type="hidden" name="next" value={next ?? ""} />
            <div><label className="label" htmlFor="email">Email</label>
              <input className="input" id="email" name="email" type="email" autoComplete="email" required /></div>
            <div><label className="label" htmlFor="password">Password</label>
              <input className="input" id="password" name="password" type="password" autoComplete="current-password" required /></div>
          </ActionForm>
        )}
        <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
          <Link href={magic ? "/login" : "/login?mode=magic"}>{magic ? "Use password instead" : "Email me a login link"}</Link>
          <Link href="/forgot-password">Forgot password?</Link>
        </div>
      </div>
    </div>
  );
}
