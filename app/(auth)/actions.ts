"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { consumeAuthToken, createAuthToken, loginWithPassword, loginWithPin, setPassword } from "@/lib/auth/service";
import { passwordProblem } from "@/lib/auth/password";
import { clientIp, createSession, destroySession } from "@/lib/auth/session";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { rateLimit } from "@/lib/security/rate-limit";
import { hashIp } from "@/lib/security/hash";

export type FormState = { error?: string; message?: string } | undefined;

/** Only allow same-site relative redirects after login (prevents open-redirect attacks). */
function safeNext(next: FormDataEntryValue | null, fallback: string) {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") && !n.includes("\\") ? n : fallback;
}

export async function passwordLoginAction(_: FormState, form: FormData): Promise<FormState> {
  const r = await loginWithPassword(String(form.get("email") ?? ""), String(form.get("password") ?? ""), await clientIp());
  if (!r.ok) return { error: r.error };
  await createSession(r.userId, "email");
  redirect(safeNext(form.get("next"), "/learn"));
}

export async function pinLoginAction(_: FormState, form: FormData): Promise<FormState> {
  const r = await loginWithPin(String(form.get("school") ?? ""), String(form.get("username") ?? ""), String(form.get("pin") ?? ""), await clientIp());
  if (!r.ok) return { error: r.error };
  await createSession(r.userId, "school_pin");
  redirect("/learn");
}

const SENT = "If an account exists for that email, we've sent a link. Check your inbox (and spam folder).";

async function emailLimited() {
  const ip = await clientIp();
  return !(await rateLimit(`email:${hashIp(ip) ?? "unknown"}`, 5, 15 * 60)).ok;
}

export async function magicLinkAction(_: FormState, form: FormData): Promise<FormState> {
  const email = z.string().email().safeParse(String(form.get("email") ?? "").trim());
  if (!email.success) return { error: "Enter a valid email address." };
  if (await emailLimited()) return { error: "Too many requests. Please try again in a few minutes." };
  const t = await createAuthToken(email.data, "magic_link", 15);
  if (t) {
    const link = `${env().APP_URL}/magic?token=${encodeURIComponent(t.token)}`;
    await sendEmail({ to: email.data, subject: "Your Gravitas Campus login link", text: `Hi ${t.firstName},\n\nClick to log in (valid for 15 minutes, one use only):\n${link}\n\nIf you didn't ask for this, ignore this email.` });
  }
  return { message: SENT };
}

/** Magic link is confirmed with a button press (POST), so email scanners that pre-open links can't use it up. */
export async function consumeMagicAction(_: FormState, form: FormData): Promise<FormState> {
  const userId = await consumeAuthToken(String(form.get("token") ?? ""), "magic_link");
  if (!userId) return { error: "This link has expired or was already used. Please request a new one." };
  await createSession(userId, "email");
  redirect("/learn");
}

export async function forgotPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const email = z.string().email().safeParse(String(form.get("email") ?? "").trim());
  if (!email.success) return { error: "Enter a valid email address." };
  if (await emailLimited()) return { error: "Too many requests. Please try again in a few minutes." };
  const t = await createAuthToken(email.data, "password_reset", 30);
  if (t) {
    const link = `${env().APP_URL}/reset-password?token=${encodeURIComponent(t.token)}`;
    await sendEmail({ to: email.data, subject: "Reset your Gravitas Campus password", text: `Hi ${t.firstName},\n\nReset your password here (valid 30 minutes):\n${link}\n\nIf you didn't ask for this, ignore this email.` });
  }
  return { message: SENT };
}

export async function resetPasswordAction(_: FormState, form: FormData): Promise<FormState> {
  const pw = String(form.get("password") ?? "");
  if (pw !== String(form.get("confirm") ?? "")) return { error: "Passwords do not match." };
  const problem = passwordProblem(pw); // check BEFORE using up the one-time token
  if (problem) return { error: problem };
  const userId = await consumeAuthToken(String(form.get("token") ?? ""), "password_reset");
  if (!userId) return { error: "This reset link has expired or was already used." };
  try {
    await setPassword(userId, pw);
  } catch (e) {
    return { error: (e as Error).message };
  }
  return { message: "Password changed. You can now log in." };
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
