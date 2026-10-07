"use client";

import { useActionState } from "react";
import { Submit } from "@/components/ui/action-form";

type S = { error?: string; message?: string; pin?: string } | undefined;

/** Form whose result may include a one-time PIN, shown large so a trainer can copy it to a slip. */
export function PinForm({ action, children, label, className }: { action: (s: S, f: FormData) => Promise<S>; children: React.ReactNode; label: string; className?: string }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {children}
      <Submit label={label} className="btn-ghost btn-sm" />
      {state?.error && <p role="alert" className="text-sm font-semibold text-bad">{state.error}</p>}
      {state?.message && (
        <p role="status" className="mt-1 rounded-lg bg-green-50 p-2 text-sm text-ok">
          {state.message} {state.pin && <span className="ml-1 rounded bg-indigo-brand px-2 py-0.5 font-mono text-base tracking-widest text-white">PIN {state.pin}</span>}
          {state.pin && <span className="block text-xs text-muted">Shown only once — write it on the learner’s slip now.</span>}
        </p>
      )}
    </form>
  );
}
