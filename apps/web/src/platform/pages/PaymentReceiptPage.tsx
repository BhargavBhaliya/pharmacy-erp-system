import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { platformApi } from "../api/platformClient";
import { amountInWords } from "../../lib/numberToWords";

interface ReceiptData {
  payment: {
    id: string;
    amount: string;
    paymentDate: string;
    paymentMode: string;
    referenceNumber: string | null;
    notes: string | null;
  };
  store: { businessName: string; storeCode: string };
}

// Not a GST tax invoice — this is a subscription payment receipt from the platform to the
// store, and the platform doesn't model its own registered-business identity (GSTIN etc.)
// anywhere, so it deliberately doesn't claim tax-invoice compliance.
export function PaymentReceiptPage() {
  const { id, paymentId } = useParams<{ id: string; paymentId: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ["platform", "store", id, "payment", paymentId],
    queryFn: async () => (await platformApi.get<{ data: ReceiptData }>(`/stores/${id}/payments/${paymentId}`)).data.data,
    enabled: !!id && !!paymentId,
  });

  if (isLoading || !data) return <div className="p-4 text-muted">Loading receipt...</div>;

  const { payment, store } = data;

  return (
    <div className="p-4" style={{ maxWidth: 600, margin: "0 auto" }}>
      <style>{`
        @media print {
          @page { margin: 15mm; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="d-flex justify-content-end mb-3 no-print">
        <button className="btn btn-primary" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <div className="border p-4">
        <div className="text-center mb-3 border-bottom pb-3">
          <h4 className="mb-0">Payment Receipt</h4>
          <div className="small text-muted">Pharmacy ERP Platform Subscription</div>
        </div>

        <div className="row g-2 mb-3">
          <div className="col-6">
            <div className="small text-muted">Receipt #</div>
            <div className="fw-semibold">{payment.id.slice(-10).toUpperCase()}</div>
          </div>
          <div className="col-6 text-end">
            <div className="small text-muted">Date</div>
            <div className="fw-semibold">{new Date(payment.paymentDate).toLocaleDateString()}</div>
          </div>
          <div className="col-6">
            <div className="small text-muted">Store</div>
            <div className="fw-semibold">{store.businessName}</div>
          </div>
          <div className="col-6 text-end">
            <div className="small text-muted">Store code</div>
            <div className="fw-semibold">{store.storeCode}</div>
          </div>
        </div>

        <table className="table table-sm border mb-3">
          <tbody>
            <tr>
              <td>Amount received</td>
              <td className="text-end fw-bold">₹{payment.amount}</td>
            </tr>
            <tr>
              <td>Payment mode</td>
              <td className="text-end">{payment.paymentMode}</td>
            </tr>
            {payment.referenceNumber && (
              <tr>
                <td>Reference #</td>
                <td className="text-end">{payment.referenceNumber}</td>
              </tr>
            )}
            {payment.notes && (
              <tr>
                <td colSpan={2}>
                  <div className="small text-muted">Notes</div>
                  {payment.notes}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="small fst-italic mb-4">{amountInWords(Number(payment.amount))}</div>

        <div className="text-center small text-muted border-top pt-2">
          Thank you for your payment. This is a system-generated receipt and does not require a signature.
        </div>
      </div>
    </div>
  );
}
