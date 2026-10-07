"use server";

import { revalidatePath } from "next/cache";
import { actionUser, ActionError } from "@/lib/auth/guards";
import { withUser } from "@/lib/db";
import { canAnywhere } from "@/lib/permissions";
import { ALLOWED_UPLOADS, MAX_UPLOAD_BYTES, putObject, safeFileName, sniffMatches } from "@/lib/storage";

type R = { error?: string; message?: string } | undefined;

async function mediaUser() {
  const u = await actionUser();
  if (!canAnywhere(u.assignments, "media.manage")) throw new ActionError("You don't have permission to manage media.");
  return u;
}

export async function uploadMediaAction(_: R, form: FormData): Promise<R> {
  try {
    const u = await mediaUser();
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    if (!files.length) return { error: "Choose at least one file." };
    const folderId = String(form.get("folderId") ?? "") || null;
    const alt = String(form.get("alt") ?? "").slice(0, 300);
    for (const f of files.slice(0, 10)) {
      if (f.size > MAX_UPLOAD_BYTES) return { error: `${f.name} is larger than 10 MB.` };
      const ext = ALLOWED_UPLOADS[f.type];
      if (!ext) return { error: `${f.name}: this file type is not allowed.` };
      const buf = Buffer.from(await f.arrayBuffer());
      if (!sniffMatches(buf, f.type)) return { error: `${f.name}: file content doesn't match its type (or the SVG contains scripts).` };
      const key = `media/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
      await putObject(key, buf, f.type);
      await withUser(u.id, (tx) => tx`insert into app.media (folder_id, storage_key, file_name, mime_type, size_bytes, alt_text, uploaded_by)
        values (${folderId}, ${key}, ${safeFileName(f.name)}, ${f.type}, ${f.size}, ${alt}, ${u.id})`);
    }
    revalidatePath("/studio/media");
    return { message: `Uploaded ${files.length} file(s) ✓` };
  } catch (e) {
    return { error: e instanceof ActionError ? e.message : "Upload failed." };
  }
}

export async function createFolderAction(_: R, form: FormData): Promise<R> {
  try {
    const u = await mediaUser();
    const name = String(form.get("name") ?? "").trim().slice(0, 80);
    if (!name) return { error: "Enter a folder name." };
    await withUser(u.id, (tx) => tx`insert into app.media_folders (name, created_by) values (${name}, ${u.id})`);
    revalidatePath("/studio/media");
    return { message: "Folder created ✓" };
  } catch (e) {
    return { error: e instanceof ActionError ? e.message : "That folder already exists." };
  }
}

export async function updateMediaAction(form: FormData) {
  const u = await mediaUser();
  const id = String(form.get("id"));
  if (form.get("delete") === "1") await withUser(u.id, (tx) => tx`update app.media set deleted_at = now() where id = ${id}`);
  else await withUser(u.id, (tx) => tx`update app.media set alt_text = ${String(form.get("alt") ?? "").slice(0, 300)}, folder_id = ${String(form.get("folderId") ?? "") || null} where id = ${id}`);
  revalidatePath("/studio/media");
}
