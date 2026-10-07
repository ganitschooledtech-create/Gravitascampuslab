"use server";

import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { createSubmission, submitBlock, type SubmitOutcome } from "@/lib/learning/service";
import { ALLOWED_UPLOADS, MAX_UPLOAD_BYTES, putObject, safeFileName, sniffMatches } from "@/lib/storage";
import { rateLimit } from "@/lib/security/rate-limit";

const uuid = z.string().uuid();

export type BlockActionResult = { ok: true; outcome: SubmitOutcome } | { ok: false; error: string };

/** Autosaves + grades one block. Called after every step. */
export async function submitBlockAction(lessonId: string, blockId: string, response: unknown): Promise<BlockActionResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Your session has ended. Please log in again." };
  if (!uuid.safeParse(lessonId).success || !uuid.safeParse(blockId).success) return { ok: false, error: "Invalid request." };
  if (JSON.stringify(response ?? {}).length > 20_000) return { ok: false, error: "Answer is too long." };
  if (!(await rateLimit(`block:${user.id}`, 120, 60)).ok) return { ok: false, error: "Slow down a little and try again." };
  try {
    return { ok: true, outcome: await submitBlock(user.id, lessonId, blockId, response) };
  } catch (e) {
    return { ok: false, error: (e as Error).message || "Could not save. Check your internet and try again." };
  }
}

/** Assignment / reflection / Try-It proof submission (text, link or file). */
export async function submitWorkAction(form: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Your session has ended. Please log in again." };
  const lessonId = String(form.get("lessonId")), blockId = String(form.get("blockId"));
  if (!uuid.safeParse(lessonId).success || !uuid.safeParse(blockId).success) return { ok: false, error: "Invalid request." };
  if (!(await rateLimit(`submit:${user.id}`, 20, 60 * 10)).ok) return { ok: false, error: "Too many submissions. Try again later." };
  const kind = String(form.get("kind"));
  try {
    if (kind === "text") {
      const t = String(form.get("text") ?? "").trim();
      if (t.length < 2) return { ok: false, error: "Write something first." };
      if (t.length > 10_000) return { ok: false, error: "That's too long (max 10,000 characters)." };
      await createSubmission(user.id, lessonId, blockId, { kind: "text", bodyText: t });
    } else if (kind === "link") {
      const u = String(form.get("url") ?? "").trim();
      if (!/^https?:\/\/\S{3,}$/i.test(u) || u.length > 1000) return { ok: false, error: "Enter a full link starting with https://" };
      await createSubmission(user.id, lessonId, blockId, { kind: "link", url: u });
    } else if (kind === "file" || kind === "screenshot") {
      const f = form.get("file");
      if (!(f instanceof File) || f.size === 0) return { ok: false, error: "Choose a file." };
      if (f.size > MAX_UPLOAD_BYTES) return { ok: false, error: "File is larger than 10 MB." };
      const ext = ALLOWED_UPLOADS[f.type];
      if (!ext || (kind === "screenshot" && !f.type.startsWith("image/")) || f.type === "image/svg+xml") return { ok: false, error: "This file type is not allowed." };
      const buf = Buffer.from(await f.arrayBuffer());
      if (!sniffMatches(buf, f.type)) return { ok: false, error: "The file content doesn't match its type." };
      const key = `submissions/${user.id}/${crypto.randomUUID()}.${ext}`;
      await putObject(key, buf, f.type);
      await createSubmission(user.id, lessonId, blockId, { kind: kind as "file" | "screenshot", fileKey: key, fileName: safeFileName(f.name) });
    } else return { ok: false, error: "Unknown submission type." };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
