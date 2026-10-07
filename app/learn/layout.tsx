import { AppHeader } from "@/components/app-header";
import { requireUser } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

export default async function LearnLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <AppHeader user={user} area="learn" />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
