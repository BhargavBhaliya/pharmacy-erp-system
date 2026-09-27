interface SaleLineInput {
  quantity: number;
  sellingPrice: number;
  discountPercent: number;
  gstRatePercent: number;
}

export interface SaleLineTotals {
  baseAmount: number;
  discountAmount: number;
  taxableAmount: number;
  gstAmount: number;
  lineTotal: number;
}

export function computeSaleLineTotals(item: SaleLineInput): SaleLineTotals {
  const baseAmount = item.quantity * item.sellingPrice;
  const discountAmount = round2((baseAmount * item.discountPercent) / 100);
  const taxableAmount = round2(baseAmount - discountAmount);
  const gstAmount = round2((taxableAmount * item.gstRatePercent) / 100);
  const lineTotal = round2(taxableAmount + gstAmount);
  return { baseAmount: round2(baseAmount), discountAmount, taxableAmount, gstAmount, lineTotal };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
