"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computePurchaseLineTotals = computePurchaseLineTotals;
exports.computePurchaseTotals = computePurchaseTotals;
// baseAmount -> less line discount -> taxable amount -> plus GST -> line total.
// Rounded to paise (2dp) per line so the invoice total matches the sum of printed lines.
function computePurchaseLineTotals(item) {
    const baseAmount = item.quantity * item.purchaseRate;
    const discountAmount = round2((baseAmount * item.discountPercent) / 100);
    const taxableAmount = round2(baseAmount - discountAmount);
    const gstAmount = round2((taxableAmount * item.gstRatePercent) / 100);
    const lineTotal = round2(taxableAmount + gstAmount);
    return { baseAmount: round2(baseAmount), discountAmount, taxableAmount, gstAmount, lineTotal };
}
function computePurchaseTotals(items, freightCharges, otherCharges) {
    const lines = items.map(computePurchaseLineTotals);
    const subtotal = round2(lines.reduce((sum, l) => sum + l.taxableAmount, 0));
    const discountAmount = round2(lines.reduce((sum, l) => sum + l.discountAmount, 0));
    const taxAmount = round2(lines.reduce((sum, l) => sum + l.gstAmount, 0));
    const totalAmount = round2(subtotal + taxAmount + freightCharges + otherCharges);
    return { lines, subtotal, discountAmount, taxAmount, totalAmount };
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
