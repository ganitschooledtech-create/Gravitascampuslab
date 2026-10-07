import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { pinLoginAction } from "../actions";

export const metadata = { title: "School login" };

export default function SchoolLoginPage() {
  return (
    <div className="card">
      <h1 className="mb-1 text-2xl">🎒 School login</h1>
      <p className="mb-4 text-sm text-muted">Use the details on your login slip. Ask your trainer if you lost it.</p>
      <ActionForm action={pinLoginAction} submitLabel="Let's go!" submitClassName="btn-accent w-full text-lg">
        <div><label className="label" htmlFor="school">School code</label>
          <input className="input uppercase" id="school" name="school" autoComplete="off" autoCapitalize="characters" required maxLength={20} /></div>
        <div><label className="label" htmlFor="username">Username</label>
          <input className="input lowercase" id="username" name="username" autoComplete="username" autoCapitalize="none" required maxLength={32} /></div>
        <div><label className="label" htmlFor="pin">6-digit PIN</label>
          <input className="input tracking-[0.5em]" id="pin" name="pin" type="password" inputMode="numeric" pattern="\d{6}" maxLength={6} autoComplete="current-password" required /></div>
      </ActionForm>
      <p className="mt-4 rounded-xl bg-cream p-3 text-xs text-muted">
        🔒 Using a shared lab computer? Always click <b>Log out</b> when you finish.
      </p>
      <p className="mt-3 text-center text-sm"><Link href="/login">Not a school student? Log in with email</Link></p>
    </div>
  );
}
