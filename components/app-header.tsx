import Link from "next/link";
import { logoutAction } from "@/app/(auth)/actions";
import { Logo } from "@/components/ui/logo";
import type { SessionUser } from "@/lib/auth/session";
import { isStaff } from "@/lib/permissions";

export function AppHeader({ user, area }: { user: SessionUser; area: "learn" | "studio" }) {
  const name = user.displayName || `${user.firstName}${user.lastName ? " " + user.lastName[0] + "." : ""}`;
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-indigo-brand text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
        <Logo href={area === "studio" ? "/studio" : "/learn"} light />
        <nav className="flex items-center gap-2 text-sm" aria-label="Account">
          {isStaff(user.assignments) && (
            <Link href={area === "studio" ? "/learn" : "/studio"} className="btn-sm btn border border-white/30 text-white no-underline hover:bg-white/10">
              {area === "studio" ? "Learner view" : "Studio"}
            </Link>
          )}
          <span className="hidden sm:inline" title={user.school ? `${user.school.name} · ${user.school.username}` : user.email ?? ""}>
            👋 {name}{user.school ? ` · ${user.school.name}` : ""}
          </span>
          <form action={logoutAction}>
            <button className="btn-sm btn bg-sun text-indigo-brand" type="submit">Log out</button>
          </form>
        </nav>
      </div>
    </header>
  );
}
