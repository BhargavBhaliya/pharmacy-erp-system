"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UPLOAD_ROOT = exports.imageUpload = void 0;
exports.verifyImageMagicBytes = verifyImageMagicBytes;
exports.deleteUploadedFileIfOwned = deleteUploadedFileIfOwned;
exports.publicUploadUrl = publicUploadUrl;
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const multer_1 = __importDefault(require("multer"));
const errors_1 = require("./errors");
const UPLOAD_ROOT = node_path_1.default.join(__dirname, "..", "..", "uploads");
exports.UPLOAD_ROOT = UPLOAD_ROOT;
const ALLOWED_MIME_TO_EXT = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
};
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2MB — plenty for a logo/signature image.
// Per-tenant subfolder with a random filename (not the original, user-controlled one) so one
// tenant can never overwrite or guess another's files, and so a malicious filename (path
// traversal, embedded script-looking name) never reaches the filesystem or a URL.
const storage = multer_1.default.diskStorage({
    destination: (req, _file, cb) => {
        const dir = node_path_1.default.join(UPLOAD_ROOT, req.user.tenantId);
        node_fs_1.default.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (_req, file, cb) => {
        const ext = ALLOWED_MIME_TO_EXT[file.mimetype] ?? "";
        cb(null, `${node_crypto_1.default.randomBytes(16).toString("hex")}${ext}`);
    },
});
exports.imageUpload = (0, multer_1.default)({
    storage,
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
    fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME_TO_EXT[file.mimetype]) {
            cb(new errors_1.ValidationError("Only JPEG, PNG, or WebP images are allowed"));
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
const MAGIC_BYTES = {
    "image/jpeg": (buf) => buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff,
    "image/png": (buf) => buf.length >= 8 &&
        buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
        buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a,
    "image/webp": (buf) => buf.length >= 12 &&
        buf.subarray(0, 4).toString("ascii") === "RIFF" &&
        buf.subarray(8, 12).toString("ascii") === "WEBP",
};
function verifyImageMagicBytes(filePath, declaredMimetype) {
    const check = MAGIC_BYTES[declaredMimetype];
    if (!check)
        return false;
    const fd = node_fs_1.default.openSync(filePath, "r");
    try {
        const buf = Buffer.alloc(12);
        const bytesRead = node_fs_1.default.readSync(fd, buf, 0, 12, 0);
        return check(buf.subarray(0, bytesRead));
    }
    finally {
        node_fs_1.default.closeSync(fd);
    }
}
// Deletes a previously-uploaded file given its public URL, but only if it's actually one of
// ours under this tenant's own folder — never touches an external URL (a tenant may still have
// one from before this feature existed) or another tenant's folder.
function deleteUploadedFileIfOwned(tenantId, publicUrl) {
    if (!publicUrl)
        return;
    const prefix = `/uploads/${tenantId}/`;
    if (!publicUrl.startsWith(prefix))
        return;
    const filename = publicUrl.slice(prefix.length);
    if (!filename || filename.includes("/") || filename.includes(".."))
        return;
    const filePath = node_path_1.default.join(UPLOAD_ROOT, tenantId, filename);
    node_fs_1.default.unlink(filePath, () => undefined);
}
function publicUploadUrl(tenantId, filename) {
    return `/uploads/${tenantId}/${filename}`;
}
