import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

/**
 * File storage behind one small interface.
 *  - "s3":    Supabase Storage (S3 protocol) today, AWS S3 later — only env vars change.
 *  - "local": files on disk, for development and tests only.
 *
 * Keys:  media/…        → lesson media (served to anyone with the link)
 *        submissions/…  → learner uploads (served only after a permission check)
 */
export const ALLOWED_UPLOADS: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg",
  "application/pdf": "pdf", "text/plain": "txt", "text/csv": "csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "video/mp4": "mp4",
};
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

let s3: S3Client | undefined;
function client() {
  const e = env();
  if (!s3) {
    s3 = new S3Client({
      region: e.S3_REGION,
      endpoint: e.S3_ENDPOINT || undefined,
      forcePathStyle: e.S3_FORCE_PATH_STYLE === "true",
      credentials: e.S3_ACCESS_KEY_ID ? { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY ?? "" } : undefined,
    });
  }
  return s3;
}

const localPath = (key: string) => {
  const root = path.resolve(env().STORAGE_LOCAL_DIR);
  const p = path.resolve(root, key);
  if (!p.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return p;
};

export async function putObject(key: string, body: Buffer, contentType: string) {
  if (env().STORAGE_DRIVER === "s3") {
    await client().send(new PutObjectCommand({ Bucket: env().S3_BUCKET, Key: key, Body: body, ContentType: contentType }));
    return;
  }
  const p = localPath(key);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, body);
}

/** Returns a short-lived URL (s3) or null (local → stream through /files route). */
export async function signedUrl(key: string, seconds = 300): Promise<string | null> {
  if (env().STORAGE_DRIVER !== "s3") return null;
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: key }), { expiresIn: seconds });
}

export async function readLocal(key: string) {
  return readFile(localPath(key));
}

/** Sniff the first bytes so a renamed .exe can't pretend to be a PNG. */
export function sniffMatches(buf: Buffer, mime: string): boolean {
  const hex = buf.subarray(0, 8).toString("hex");
  if (mime === "image/png") return hex.startsWith("89504e47");
  if (mime === "image/jpeg") return hex.startsWith("ffd8ff");
  if (mime === "image/gif") return hex.startsWith("47494638");
  if (mime === "image/webp") return buf.subarray(8, 12).toString() === "WEBP";
  if (mime === "application/pdf") return hex.startsWith("25504446");
  if (mime.includes("openxmlformats")) return hex.startsWith("504b0304");
  if (mime === "image/svg+xml") return /<svg[\s>]/i.test(buf.subarray(0, 2000).toString()) && !/<script|on\w+=/i.test(buf.toString());
  return true;
}

export function safeFileName(name: string) {
  return name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").slice(0, 100) || "file";
}
