import Link from "next/link";
import { ActionForm } from "@/components/ui/action-form";
import { forgotPasswordAction } from "../actions";

export const metadata = { title: "Forgot password" };

export default function ForgotPage() {
  return (
    <div className="card">
      <h1 className="mb-4 text-2xl">Reset your password</h1>
      <ActionForm action={forgotPasswordAction} submitLabel="Send reset link">
        <div><label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required /></div>
      </ActionForm>
      <p className="mt-4 text-sm">School students: ask your trainer to reset your PIN. <Link href="/login">Back to login</Link></p>
    </div>
  );
}
