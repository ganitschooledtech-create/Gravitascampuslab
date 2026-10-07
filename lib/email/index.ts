import "server-only";
import { env } from "@/lib/env";

/** Provider-agnostic email. "console" prints to the server log (dev/test); "resend" sends for real. */
export type Mail = { to: string; subject: string; text: string; html?: string };

export async function sendEmail(mail: Mail): Promise<void> {
  const e = env();
  if (e.EMAIL_DRIVER === "console" || !e.RESEND_API_KEY) {
    console.info(`[email:console] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: e.EMAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
  });
  if (!res.ok) throw new Error(`Email send failed (${res.status})`);
}
