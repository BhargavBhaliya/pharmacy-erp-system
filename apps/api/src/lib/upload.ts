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
