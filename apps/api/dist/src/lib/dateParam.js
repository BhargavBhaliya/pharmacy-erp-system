"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDateParam = parseDateParam;
const errors_1 = require("./errors");
// Every list endpoint's optional ?from=/&to= date-range filter was parsing the raw query string
// with `new Date(str)` and handing the result straight to Prisma with no validity check — a
// malformed string (bad encoding, a stray param, a date-picker bug) silently becomes an Invalid
// Date, which Prisma then throws on deep inside the query, surfacing as an opaque 500 instead of
// a clean 400. One shared, validated parser used everywhere this pattern occurs.
function parseDateParam(value, paramName) {
    if (typeof value !== "string" || value === "")
        return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        throw new errors_1.ValidationError(`Invalid ${paramName} date`);
    return date;
}
