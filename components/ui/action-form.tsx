"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import clsx from "clsx";

type State = { error?: string; message?: string } | undefined;

/** A form wired to a server action, with pending state and accessible error/success messages. */
export function ActionForm({
  action,
  children,
  submitLabel,
  className,
  submitClassName = "btn-primary w-full",
}: {
  action: (state: State, form: FormData) => Promise<State>;
  children: React.ReactNode;
  submitLabel: string;
  className?: string;
  submitClassName?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={clsx("space-y-4", className)} noValidate>
      {children}
      {state?.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-bad">
          {state.error}
        </p>
      )}
      {state?.message && (
        <p role="status" className="rounded-xl bg-green-50 px-3 py-2 text-sm font-semibold text-ok">
          {state.message}
        </p>
      )}
      <Submit label={submitLabel} className={submitClassName} />
    </form>
  );
}

export function Submit({ label, className = "btn-primary" }: { label: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? "Please wait…" : label}
    </button>
  );
}
