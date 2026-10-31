import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { InvoiceDocument, type InvoiceBranding, type InvoiceSaleDetail } from "../components/InvoiceDocument";

export function SaleInvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const [sale, setSale] = useState<InvoiceSaleDetail | null>(null);
  const [branding, setBranding] = useState<InvoiceBranding | null>(null);

  useEffect(() => {
    api.get(`/sales/${id}`).then((res) => setSale(res.data.data));
    api.get<{ data: InvoiceBranding }>("/settings/branding").then((res) => setBranding(res.data.data));
  }, [id]);

  if (!sale || !branding) return <div className="p-4 text-muted">Loading invoice...</div>;

  return (
    <div className="p-4" style={{ maxWidth: 850, margin: "0 auto" }}>
      <style>{`
        @media print {
          @page { margin: 12mm; }
          .no-print { display: none !important; }
          tr { break-inside: avoid; }
        }
      `}</style>

      <div className="d-flex justify-content-between mb-3 no-print">
        <Link to="/sales" className="btn btn-outline-secondary">
          ← Back to Sales
        </Link>
        <button className="btn btn-primary" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <InvoiceDocument sale={sale} branding={branding} />
    </div>
  );
}
