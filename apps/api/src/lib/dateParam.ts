import { ValidationError } from "./errors";

// Every list endpoint's optional ?from=/&to= date-range filter was parsing the raw query string
// with `new Date(str)` and handing the result straight to Prisma with no validity check — a
// malformed string (bad encoding, a stray param, a date-picker bug) silently becomes an Invalid
// Date, which Prisma then throws on deep inside the query, surfacing as an opaque 500 instead of
// a clean 400. One shared, validated parser used everywhere this pattern occurs.
const BARE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDateParam(value: unknown, paramName: string): Date | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ValidationError(`Invalid ${paramName} date`);
  // JS Date parsing silently rolls a calendar-overflow date forward instead of rejecting it
  // (`new Date("2024-02-30")` succeeds as March 1) — round-trip a bare YYYY-MM-DD input back to
  // the same string to catch that; full ISO timestamps (what this app's own frontend sends)
  // aren't affected since they're always built from a real Date, never typed by hand.
  if (BARE_DATE.test(value) && date.toISOString().slice(0, 10) !== value) {
    throw new ValidationError(`Invalid ${paramName} date`);
  }
  return date;
}
