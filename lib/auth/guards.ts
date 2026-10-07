import "server-only";
import { redirect, notFound } from "next/navigation";
import { can, canAnywhere, isStaff, type Scope } from "@/lib/permissions";
import { getSessionUser, type SessionUser } from "./session";

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireStaff(): Promise<SessionUser> {
  const u = await requireUser();
  if (!isStaff(u.assignments)) redirect("/learn");
  return u;
}

/** For pages: 404 instead of revealing that a protected page exists. */
export async function requirePerm(perm: string, scope?: Scope): Promise<SessionUser> {
  const u = await requireUser();
  if (!can(u.assignments, perm, scope)) notFound();
  return u;
}

export async function requirePermAnywhere(perm: string): Promise<SessionUser> {
  const u = await requireUser();
  if (!canAnywhere(u.assignments, perm)) notFound();
  return u;
}

export class ActionError extends Error {}

/** For server actions: throws a friendly error instead of redirecting. */
export async function actionUser(perm?: string, scope?: Scope): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new ActionError("Your session has expired. Please log in again.");
  if (perm && !can(u.assignments, perm, scope)) throw new ActionError("You don't have permission to do that.");
  return u;
}
