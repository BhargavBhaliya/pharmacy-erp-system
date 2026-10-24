"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toCsv = toCsv;
// Minimal CSV writer (no external dependency): quotes any field containing a comma, quote, or
// newline, doubling embedded quotes per RFC 4180. Good enough for report exports opened in Excel.
function toCsv(rows, columns) {
    const escape = (value) => {
        const s = value === null || value === undefined ? "" : String(value);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [columns.join(",")];
    for (const row of rows) {
        lines.push(columns.map((c) => escape(row[c])).join(","));
    }
    return lines.join("\n");
}
