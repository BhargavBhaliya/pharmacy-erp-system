"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeSaleLineTotals = computeSaleLineTotals;
function computeSaleLineTotals(item) {
    const baseAmount = item.quantity * item.sellingPrice;
    const discountAmount = round2((baseAmount * item.discountPercent) / 100);
    const taxableAmount = round2(baseAmount - discountAmount);
    const gstAmount = round2((taxableAmount * item.gstRatePercent) / 100);
    const lineTotal = round2(taxableAmount + gstAmount);
    return { baseAmount: round2(baseAmount), discountAmount, taxableAmount, gstAmount, lineTotal };
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
