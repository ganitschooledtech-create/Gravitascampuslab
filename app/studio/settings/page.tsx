import { revalidatePath } from "next/cache";
import { Submit } from "@/components/ui/action-form";
import { actionUser, requirePerm } from "@/lib/auth/guards";
import { withUser } from "@/lib/db";

export const metadata = { title: "Settings" };

async function toggleFlag(form: FormData) {
  "use server";
  const u = await actionUser("settings.manage");
  await withUser(u.id, (tx) => tx`update app.feature_flags set enabled = not enabled, updated_by = ${u.id}, updated_at = now() where key = ${String(form.get("key"))}`);
  revalidatePath("/studio/settings");
}

export default async function SettingsPage() {
  const user = await requirePerm("settings.manage");
  const { flags, settings } = await withUser(user.id, async (tx) => ({
    flags: await tx<any[]>`select key, enabled, description from app.feature_flags order by key`,
    settings: await tx<any[]>`select key, value from app.settings order by key`,
  }));
  return (
    <div className="space-y-4">
      <h1 className="text-3xl">Settings</h1>
      <section className="card">
        <h2 className="mb-2 text-lg">Feature switches</h2>
        <ul className="divide-y divide-line">
          {flags.map((f) => (
            <li key={f.key} className="flex items-center justify-between gap-2 py-2">
              <span><b>{f.key}</b><span className="block text-sm text-muted">{f.description}</span></span>
              <form action={toggleFlag}><input type="hidden" name="key" value={f.key} /><Submit label={f.enabled ? "On — turn off" : "Off — turn on"} className={f.enabled ? "btn-accent btn-sm" : "btn-ghost btn-sm"} /></form>
            </li>
          ))}
        </ul>
      </section>
      <section className="card">
        <h2 className="mb-2 text-lg">Current configuration</h2>
        <p className="mb-2 text-sm text-muted">Branding editor and data-retention controls arrive in Phase 3/4. Values shown for reference.</p>
        {settings.map((s) => <details key={s.key} className="mb-2"><summary className="cursor-pointer font-bold">{s.key}</summary><pre className="overflow-x-auto rounded-lg bg-cream p-2 text-xs">{JSON.stringify(s.value, null, 2)}</pre></details>)}
      </section>
    </div>
  );
}
