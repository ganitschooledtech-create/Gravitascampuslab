import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { PASSWORD_RULES } from "@/lib/auth/password";
import { resetPasswordAction } from "../actions";

export const metadata = { title: "Choose a new password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="card">
      <h1 className="mb-4 text-2xl">Choose a new password</h1>
      <ActionForm action={resetPasswordAction} submitLabel="Save password">
        <input type="hidden" name="token" value={token ?? ""} />
        <div><label className="label" htmlFor="password">New password</label>
          <input className="input" id="password" name="password" type="password" autoComplete="new-password" required aria-describedby="pwrules" />
          <p id="pwrules" className="mt-1 text-xs text-muted">{PASSWORD_RULES}</p></div>
        <div><label className="label" htmlFor="confirm">Confirm password</label>
          <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" required /></div>
      </ActionForm>
      <p className="mt-4 text-sm"><Link href="/login">Back to login</Link></p>
    </div>
  );
}
