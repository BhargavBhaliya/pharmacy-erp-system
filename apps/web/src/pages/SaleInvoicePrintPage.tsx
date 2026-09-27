import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";

interface Branding {
  businessName: string;
  legalName?: string | null;
  gstin?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  invoiceFooter?: string | null;
}
interface SaleDetail {
  invoiceNumber: string;
  invoiceType: string;
  saleDate: string;
  totalAmount: string;
  subtotal: string;
  taxAmount: string;
  discountAmount: string;
  paymentStatus: string;
  customer?: { name: string; mobile?: string | null } | null;
  doctor?: { name: string } | null;
  branch: { name: string; gstin?: string | null; address?: string | null; contactNumber?: string | null };
  items: { id: string; quantity: number; sellingPrice: string; discountPercent: string; gstRatePercent: string; lineTotal: string; product: { name: string; sku: string }; batch: { batchNumber: string; expiryDate: string } }[];
  payments: { amount: string; paymentMode: string }[];
}

export function SaleInvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const [sale, setSale] = useState<SaleDetail | null>(null);
  const [branding, setBranding] = useState<Branding | null>(null);

  useEffect(() => {
    api.get(`/sales/${id}`).then((res) => setSale(res.data.data));
    api.get<{ data: Branding }>("/settings/branding").then((res) => setBranding(res.data.data));
  }, [id]);

  if (!sale || !branding) return <div className="p-4 text-muted">Loading invoice...</div>;

  return (
    <div className="p-4" style={{ maxWidth: 800, margin: "0 auto" }}>
      <div className="d-flex justify-content-end mb-3 no-print">
        <button className="btn btn-primary" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <div className="text-center mb-4">
        <h4 className="mb-0">{branding.businessName}</h4>
        {branding.address && <div className="small">{branding.address}, {branding.city} {branding.pincode}</div>}
        {branding.gstin && <div className="small">GSTIN: {branding.gstin}</div>}
        <div className="small text-muted">{sale.branch.name}{sale.branch.contactNumber ? ` · ${sale.branch.contactNumber}` : ""}</div>
      </div>

      <div className="d-flex justify-content-between mb-3 border-top border-bottom py-2">
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
            <strong>Customer:</strong> {sale.customer?.name ?? "Walk-in"}
          </div>
          {sale.customer?.mobile && <div>{sale.customer.mobile}</div>}
          {sale.doctor && <div>Dr. {sale.doctor.name}</div>}
        </div>
      </div>

      <table className="table table-sm">
        <thead>
          <tr>
            <th>Item</th>
            <th>Batch</th>
            <th>Expiry</th>
            <th className="text-end">Qty</th>
            <th className="text-end">Rate</th>
            <th className="text-end">Disc%</th>
            <th className="text-end">GST%</th>
            <th className="text-end">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item) => (
            <tr key={item.id}>
              <td>
                {item.product.name}
                <div className="text-muted small">{item.product.sku}</div>
              </td>
              <td>{item.batch.batchNumber}</td>
              <td>{new Date(item.batch.expiryDate).toLocaleDateString()}</td>
              <td className="text-end">{item.quantity}</td>
              <td className="text-end">₹{item.sellingPrice}</td>
              <td className="text-end">{item.discountPercent}</td>
              <td className="text-end">{item.gstRatePercent}</td>
              <td className="text-end">₹{item.lineTotal}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="d-flex justify-content-end">
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
              <td>Tax</td>
              <td className="text-end">₹{sale.taxAmount}</td>
            </tr>
            <tr className="fw-bold border-top">
              <td>Total</td>
              <td className="text-end">₹{sale.totalAmount}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="mb-3">
        <strong>Payments:</strong> {sale.payments.map((p) => `${p.paymentMode} ₹${p.amount}`).join(", ") || "—"} ({sale.paymentStatus})
      </div>

      {branding.invoiceFooter && <div className="text-center text-muted small border-top pt-2">{branding.invoiceFooter}</div>}
    </div>
  );
}
