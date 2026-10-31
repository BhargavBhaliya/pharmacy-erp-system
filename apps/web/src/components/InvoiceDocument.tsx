import { amountInWords } from "../lib/numberToWords";

export interface InvoiceBranding {
  businessName: string;
  legalName?: string | null;
  gstin?: string | null;
  whatsappNumber?: string | null;
  drugLicenseNumber?: string | null;
  fssaiLicenseNumber?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  invoiceFooter?: string | null;
  termsAndConditions?: string | null;
  logoUrl?: string | null;
  signatureUrl?: string | null;
}
export interface InvoiceSaleDetail {
  invoiceNumber: string;
  invoiceType: string;
  saleDate: string;
  totalAmount: string;
  subtotal: string;
  taxAmount: string;
  discountAmount: string;
  paymentStatus: string;
  customer?: { name: string; mobile?: string | null; email?: string | null; address?: string | null } | null;
  doctor?: { name: string } | null;
  branch: { name: string; gstin?: string | null; address?: string | null; contactNumber?: string | null };
  items: {
    id: string;
    quantity: number;
    sellingPrice: string;
    discountPercent: string;
    gstRatePercent: string;
    lineTotal: string;
    product: { name: string; sku: string; hsnCode?: string | null };
    batch: { batchNumber: string; expiryDate: string };
  }[];
  payments: { amount: string; paymentMode: string }[];
}

// The invoice's visual layout, shared between the print page and the hidden off-screen render
// used to capture a shareable image (see POSPage's "Share on WhatsApp") — one definition so the
// two never drift apart. logo/signature <img> tags set crossOrigin so html2canvas can read their
// pixels without the canvas becoming tainted (the API serves /uploads with CORS headers for
// exactly this); it's a no-op for normal printing.
export function InvoiceDocument({ sale, branding }: { sale: InvoiceSaleDetail; branding: InvoiceBranding }) {
  const totalTax = Number(sale.taxAmount);
  const halfTax = totalTax / 2;
  const isTaxInvoice = sale.invoiceType === "TAX" || sale.invoiceType === "WHOLESALE";

  return (
    <div className="border p-3">
      <div className="d-flex justify-content-between align-items-start border-bottom pb-2 mb-2">
        <div className="d-flex align-items-start gap-3">
          {branding.logoUrl && (
            <img src={branding.logoUrl} alt="" crossOrigin="anonymous" style={{ height: 56, width: 56, objectFit: "contain" }} />
          )}
          <div>
            <h4 className="mb-0">{branding.businessName}</h4>
            {branding.legalName && branding.legalName !== branding.businessName && (
              <div className="small text-muted">{branding.legalName}</div>
            )}
            {branding.address && (
              <div className="small">
                {branding.address}, {branding.city} {branding.state} {branding.pincode}
              </div>
            )}
            <div className="small text-muted">
              {sale.branch.name}
              {sale.branch.contactNumber ? ` · ${sale.branch.contactNumber}` : ""}
            </div>
            {branding.whatsappNumber && <div className="small text-muted">WhatsApp: {branding.whatsappNumber}</div>}
          </div>
        </div>
        <div className="text-end small">
          <div className="fs-5 fw-bold">{isTaxInvoice ? "TAX INVOICE" : "INVOICE"}</div>
          {branding.gstin && (
            <div>
              <strong>GSTIN:</strong> {branding.gstin}
            </div>
          )}
          {branding.drugLicenseNumber && (
            <div>
              <strong>Drug Lic:</strong> {branding.drugLicenseNumber}
            </div>
          )}
          {branding.fssaiLicenseNumber && (
            <div>
              <strong>FSSAI:</strong> {branding.fssaiLicenseNumber}
            </div>
          )}
        </div>
      </div>

      <div className="d-flex justify-content-between mb-3 py-2">
        <div>
          <div>
            <strong>Invoice #:</strong> {sale.invoiceNumber}
          </div>
          <div>
            <strong>Date:</strong> {new Date(sale.saleDate).toLocaleString()}
          </div>
          <div>
            <strong>Type:</strong> {sale.invoiceType}
          </div>
        </div>
        <div className="text-end">
          <div>
            <strong>Bill to:</strong> {sale.customer?.name ?? "Walk-in customer"}
          </div>
          {sale.customer?.mobile && <div>📞 {sale.customer.mobile}</div>}
          {sale.customer?.email && <div>{sale.customer.email}</div>}
          {sale.customer?.address && <div className="text-muted small">{sale.customer.address}</div>}
          {sale.doctor && <div>Dr. {sale.doctor.name}</div>}
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table className="table table-sm table-bordered mb-0" style={{ fontSize: "0.85rem", minWidth: 720 }}>
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th>HSN</th>
              <th>Batch</th>
              <th>Expiry</th>
              <th className="text-end">Qty</th>
              <th className="text-end">Rate</th>
              <th className="text-end">Disc%</th>
              <th className="text-end">CGST%</th>
              <th className="text-end">SGST%</th>
              <th className="text-end">Amount</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((item, idx) => {
              const halfRate = Number(item.gstRatePercent) / 2;
              return (
                <tr key={item.id}>
                  <td>{idx + 1}</td>
                  <td>
                    {item.product.name}
                    <div className="text-muted small">{item.product.sku}</div>
                  </td>
                  <td>{item.product.hsnCode ?? "—"}</td>
                  <td>{item.batch.batchNumber}</td>
                  <td>{new Date(item.batch.expiryDate).toLocaleDateString()}</td>
                  <td className="text-end">{item.quantity}</td>
                  <td className="text-end">₹{item.sellingPrice}</td>
                  <td className="text-end">{item.discountPercent}</td>
                  <td className="text-end">{halfRate}%</td>
                  <td className="text-end">{halfRate}%</td>
                  <td className="text-end">₹{item.lineTotal}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="d-flex justify-content-between align-items-start flex-wrap gap-3">
        <div style={{ maxWidth: 420 }}>
          <div className="small fst-italic">{amountInWords(Number(sale.totalAmount))}</div>
          <div className="mt-2">
            <strong>Payments:</strong> {sale.payments.map((p) => `${p.paymentMode} ₹${p.amount}`).join(", ") || "—"} ({sale.paymentStatus})
          </div>
        </div>

        <table className="table table-sm" style={{ width: 300 }}>
          <tbody>
            <tr>
              <td>Subtotal</td>
              <td className="text-end">₹{sale.subtotal}</td>
            </tr>
            <tr>
              <td>Discount</td>
              <td className="text-end">₹{sale.discountAmount}</td>
            </tr>
            <tr>
              <td>CGST</td>
              <td className="text-end">₹{halfTax.toFixed(2)}</td>
            </tr>
            <tr>
              <td>SGST</td>
              <td className="text-end">₹{halfTax.toFixed(2)}</td>
            </tr>
            <tr className="fw-bold border-top">
              <td>Total</td>
              <td className="text-end">₹{sale.totalAmount}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="d-flex justify-content-between align-items-end mt-4 pt-3 border-top">
        <div style={{ maxWidth: 420 }}>
          {branding.termsAndConditions && (
            <>
              <div className="small fw-semibold">Terms & Conditions</div>
              <div className="small text-muted">{branding.termsAndConditions}</div>
            </>
          )}
        </div>
        <div className="text-center">
          {branding.signatureUrl ? (
            <img src={branding.signatureUrl} alt="" crossOrigin="anonymous" style={{ height: 50, objectFit: "contain" }} />
          ) : (
            <div style={{ height: 50 }} />
          )}
          <div className="small border-top pt-1 mt-1">Authorized Signatory</div>
        </div>
      </div>

      {branding.invoiceFooter && <div className="text-center text-muted small border-top pt-2 mt-3">{branding.invoiceFooter}</div>}
    </div>
  );
}
