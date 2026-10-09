import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import type { Request } from "express";
import { ValidationError } from "./errors";

const UPLOAD_ROOT = path.join(__dirname, "..", "..", "uploads");
const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB — plenty for a logo/signature image.

// Per-tenant subfolder with a random filename (not the original, user-controlled one) so one
// tenant can never overwrite or guess another's files, and so a malicious filename (path
// traversal, embedded script-looking name) never reaches the filesystem or a URL.
const storage = multer.diskStorage({
  destination: (req: Request, _file, cb) => {
    const dir = path.join(UPLOAD_ROOT, req.user!.tenantId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = ALLOWED_MIME_TO_EXT[file.mimetype] ?? "";
    cb(null, `${crypto.randomBytes(16).toString("hex")}${ext}`);
  },
});

export const imageUpload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TO_EXT[file.mimetype]) {
      cb(new ValidationError("Only JPEG, PNG, or WebP images are allowed"));
      return;
    }
    cb(null, true);
  },
});

// multer's fileFilter only sees the client-supplied Content-Type for the form part — trivially
// spoofable (an attacker can label any file "image/png"). Helmet's nosniff header already stops
// a browser from executing a mislabeled file loaded via <img>, but that's one mitigation, not a
// guarantee for every consumer of this URL — check the file's actual magic bytes once it's on
// disk, as the real server-side control. Deletes and rejects on a mismatch.
const MAGIC_BYTES: Record<string, (buf: Buffer) => boolean> = {
  "image/jpeg": (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
  "image/png": (buf) =>
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a,
  "image/webp": (buf) =>
    buf.length >= 12 &&
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP",
};

export function verifyImageMagicBytes(filePath: string, declaredMimetype: string): boolean {
  const check = MAGIC_BYTES[declaredMimetype];
  if (!check) return false;
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(12);
    const bytesRead = fs.readSync(fd, buf, 0, 12, 0);
    return check(buf.subarray(0, bytesRead));
  } finally {
    fs.closeSync(fd);
  }
}

// Deletes a previously-uploaded file given its public URL, but only if it's actually one of
// ours under this tenant's own folder — never touches an external URL (a tenant may still have
// one from before this feature existed) or another tenant's folder.
export function deleteUploadedFileIfOwned(tenantId: string, publicUrl: string | null | undefined): void {
  if (!publicUrl) return;
  const prefix = `/uploads/${tenantId}/`;
  if (!publicUrl.startsWith(prefix)) return;
  const filename = publicUrl.slice(prefix.length);
  if (!filename || filename.includes("/") || filename.includes("..")) return;
  const filePath = path.join(UPLOAD_ROOT, tenantId, filename);
  fs.unlink(filePath, () => undefined);
}

export function publicUploadUrl(tenantId: string, filename: string): string {
  return `/uploads/${tenantId}/${filename}`;
}

export { UPLOAD_ROOT };
