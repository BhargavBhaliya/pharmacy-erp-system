"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateUniqueUsername = generateUniqueUsername;
exports.withUniqueUsername = withUniqueUsername;
const node_crypto_1 = __importDefault(require("node:crypto"));
const client_1 = require("@prisma/client");
function slugify(input) {
    const cleaned = input
        .split("@")[0] // if given an email, use only the local part as the seed
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "")
        .slice(0, 20);
    return cleaned || "user";
}
// Short, memorable login handle derived from a name or email — "Demo Owner" or
// "owner@demo-pharmacy.test" both become "demoowner"/"owner". On collision, appends a random
// (not sequential) suffix: many concurrent callers sharing the same seed would otherwise all
// probe "owner", then "owner1", then "owner2"... in near lockstep and keep colliding with each
// other at every step — not hypothetical, the test suite does exactly this with ownerName
// "Owner" across many files. A random suffix spreads concurrent attempts out immediately.
async function generateUniqueUsername(db, seed, table) {
    const base = slugify(seed);
    for (let attempt = 0;; attempt++) {
        const candidate = attempt === 0 ? base : `${base}${node_crypto_1.default.randomInt(100, 999_999)}`;
        const existing = table === "user"
            ? await db.user.findUnique({ where: { username: candidate } })
            : await db.platformAdmin.findUnique({ where: { username: candidate } });
        if (!existing)
            return candidate;
    }
}
function isUsernameUniqueConflict(err) {
    return (err instanceof client_1.Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        err.meta?.target?.includes("username") === true);
}
// generateUniqueUsername's own check-then-use has a real race window: two concurrent calls can
// both see a candidate as free and both try to claim it, so one loses to the unique constraint.
// Retrying a single failed query inside an already-open interactive transaction doesn't help —
// MySQL poisons the rest of that transaction once one statement fails. Retry the WHOLE operation
// instead, with a freshly (re-)generated (randomized, see above) username each time, so every
// attempt runs in a clean transaction and collisions don't repeat in lockstep.
async function withUniqueUsername(db, seed, table, run) {
    const MAX_ATTEMPTS = 15;
    for (let attempt = 1;; attempt++) {
        const username = await generateUniqueUsername(db, seed, table);
        try {
            return await run(username);
        }
        catch (err) {
            if (attempt >= MAX_ATTEMPTS || !isUsernameUniqueConflict(err))
                throw err;
        }
    }
}
