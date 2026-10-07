import { AppHeader } from "@/components/app-header";
import { StudioNav, type NavItem } from "@/components/studio/nav";
import { requireStaff } from "@/lib/auth/guards";
import { canAnywhere, isSuperAdmin } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const a = user.assignments;
  const items: NavItem[] = [{ href: "/studio", label: "Overview", icon: "🏠" }];
  if (canAnywhere(a, "content.view") || canAnywhere(a, "program.manage") || canAnywhere(a, "program.create")) items.push({ href: "/studio/programs", label: "Programs", icon: "📚" });
  if (canAnywhere(a, "content.publish")) items.push({ href: "/studio/review", label: "Review queue", icon: "✅" });
  if (canAnywhere(a, "submissions.grade")) items.push({ href: "/studio/submissions", label: "Submissions", icon: "📝" });
  if (canAnywhere(a, "schools.view") || canAnywhere(a, "school.view_learners")) items.push({ href: "/studio/schools", label: "Schools", icon: "🏫" });
  if (canAnywhere(a, "media.view")) items.push({ href: "/studio/media", label: "Media library", icon: "🖼️" });
  if (canAnywhere(a, "team.view") || canAnywhere(a, "team.manage")) items.push({ href: "/studio/team", label: "Team & roles", icon: "👥" });
  if (canAnywhere(a, "audit.view")) items.push({ href: "/studio/audit", label: "Audit log", icon: "🧾" });
  if (isSuperAdmin(a)) items.push({ href: "/studio/settings", label: "Settings", icon: "⚙️" });
  return (
    <>
      <AppHeader user={user} area="studio" />
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-4 md:flex-row">
        <aside className="md:w-56 md:shrink-0"><StudioNav items={items} /></aside>
        <main id="main" className="min-w-0 flex-1">{children}</main>
      </div>
    </>
  );
}
