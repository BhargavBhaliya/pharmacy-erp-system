import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface Branch {
  id: string;
  name: string;
}
interface ProductLite {
  id: string;
  name: string;
  sku: string;
  sellingPrice: string;
  mrp: string;
}
interface Customer {
  id: string;
  name: string;
  mobile?: string | null;
}
interface CartLine {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  sellingPrice: number;
  discountPercent: number;
}
interface PaymentLine {
  amount: number;
  paymentMode: string;
}

export function POSPage() {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ProductLite[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [invoiceType, setInvoiceType] = useState<"CASH" | "CREDIT" | "TAX" | "RETAIL" | "WHOLESALE">("CASH");
  const [payments, setPayments] = useState<PaymentLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastInvoice, setLastInvoice] = useState<{ invoiceNumber: string; totalAmount: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<{ data: Branch[] }>("/branches").then((res) => {
      setBranches(res.data.data);
      if (res.data.data.length > 0) setBranchId(res.data.data[0].id);
    });
    api.get<{ data: Customer[] }>("/customers").then((res) => setCustomers(res.data.data));
  }, []);

  useEffect(() => {
    if (search.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(() => {
      api.get<{ data: ProductLite[] }>("/products", { params: { search, pageSize: 10 } }).then((res) => setResults(res.data.data));
    }, 250);
    return () => clearTimeout(handle);
  }, [search]);

  function addToCart(p: ProductLite) {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) return prev.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...prev, { productId: p.id, name: p.name, sku: p.sku, quantity: 1, sellingPrice: Number(p.sellingPrice), discountPercent: 0 }];
    });
    setSearch("");
    setResults([]);
  }

  function updateLine(productId: string, patch: Partial<CartLine>) {
    setCart((prev) => prev.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((l) => l.productId !== productId));
  }

  const lineTotal = (l: CartLine) => Math.round(l.quantity * l.sellingPrice * (1 - l.discountPercent / 100) * 100) / 100;
  const grandTotal = Math.round(cart.reduce((sum, l) => sum + lineTotal(l), 0) * 100) / 100;
  const paidTotal = Math.round(payments.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
  const balance = Math.round((grandTotal - paidTotal) * 100) / 100;

  function addPayment() {
    setPayments((prev) => [...prev, { amount: Math.max(balance, 0), paymentMode: "CASH" }]);
  }

  async function handleCheckout() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post("/sales", {
        branchId,
        customerId: customerId || undefined,
        invoiceType,
        items: cart.map((l) => ({ productId: l.productId, quantity: l.quantity, sellingPrice: l.sellingPrice, discountPercent: l.discountPercent })),
        payments: payments.map((p) => ({ amount: p.amount, paymentMode: p.paymentMode })),
      });
      setLastInvoice({ invoiceNumber: res.data.data.invoiceNumber, totalAmount: res.data.data.totalAmount });
      setCart([]);
      setPayments([]);
      setCustomerId("");
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Checkout failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <h3 className="mb-0">POS Billing</h3>
        <select className="form-select" style={{ width: 220 }} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {lastInvoice && (
        <div className="alert alert-success d-flex justify-content-between align-items-center">
          <span>
            Invoice <strong>{lastInvoice.invoiceNumber}</strong> created — total ₹{lastInvoice.totalAmount}
          </span>
          <button className="btn-close" onClick={() => setLastInvoice(null)}></button>
        </div>
      )}
      {error && <div className="alert alert-danger py-2">{error}</div>}

      <div className="row g-3">
        <div className="col-lg-8">
          <div className="position-relative mb-3">
            <input
              className="form-control form-control-lg"
              placeholder="Scan barcode or search product name / SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            {results.length > 0 && (
              <div className="list-group position-absolute w-100 shadow" style={{ zIndex: 10 }}>
                {results.map((p) => (
                  <button key={p.id} type="button" className="list-group-item list-group-item-action" onClick={() => addToCart(p)}>
                    {p.name} <span className="text-muted small">({p.sku})</span>
                    <span className="float-end">₹{p.sellingPrice}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <table className="table mb-0">
              <thead>
                <tr>
                  <th>Product</th>
                  <th style={{ width: 90 }}>Qty</th>
                  <th style={{ width: 100 }}>Price</th>
                  <th style={{ width: 90 }}>Disc %</th>
                  <th style={{ width: 100 }}>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cart.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-muted py-4">
                      Cart is empty. Search above to add items.
                    </td>
                  </tr>
                )}
                {cart.map((l) => (
                  <tr key={l.productId}>
                    <td>
                      {l.name}
                      <div className="text-muted small">{l.sku}</div>
                    </td>
                    <td>
                      <input type="number" className="form-control form-control-sm" min={1} value={l.quantity} onChange={(e) => updateLine(l.productId, { quantity: Number(e.target.value) })} />
                    </td>
                    <td>
                      <input type="number" step="0.01" className="form-control form-control-sm" value={l.sellingPrice} onChange={(e) => updateLine(l.productId, { sellingPrice: Number(e.target.value) })} />
                    </td>
                    <td>
                      <input type="number" className="form-control form-control-sm" value={l.discountPercent} onChange={(e) => updateLine(l.productId, { discountPercent: Number(e.target.value) })} />
                    </td>
                    <td>₹{lineTotal(l).toFixed(2)}</td>
                    <td>
                      <button className="btn btn-sm btn-outline-danger" onClick={() => removeLine(l.productId)}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="col-lg-4">
          <div className="card card-body mb-3">
            <label className="form-label">Customer</label>
            <select className="form-select mb-3" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Walk-in customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.mobile ? `(${c.mobile})` : ""}
                </option>
              ))}
            </select>

            <label className="form-label">Invoice type</label>
            <select className="form-select mb-3" value={invoiceType} onChange={(e) => setInvoiceType(e.target.value as typeof invoiceType)}>
              {["CASH", "CREDIT", "TAX", "RETAIL", "WHOLESALE"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <div className="d-flex justify-content-between fs-5 fw-semibold border-top pt-2">
              <span>Total</span>
              <span>₹{grandTotal.toFixed(2)}</span>
            </div>
          </div>

          <div className="card card-body mb-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <label className="form-label mb-0">Payments</label>
              <button className="btn btn-sm btn-outline-primary" onClick={addPayment} type="button">
                + Add payment
              </button>
            </div>
            {payments.map((p, idx) => (
              <div key={idx} className="d-flex gap-2 mb-2">
                <input
                  type="number"
                  className="form-control form-control-sm"
                  value={p.amount}
                  onChange={(e) => setPayments((prev) => prev.map((pp, i) => (i === idx ? { ...pp, amount: Number(e.target.value) } : pp)))}
                />
                <select
                  className="form-select form-select-sm"
                  value={p.paymentMode}
                  onChange={(e) => setPayments((prev) => prev.map((pp, i) => (i === idx ? { ...pp, paymentMode: e.target.value } : pp)))}
                >
                  {["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "OTHER"].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <button className="btn btn-sm btn-outline-danger" onClick={() => setPayments((prev) => prev.filter((_, i) => i !== idx))}>
                  ×
                </button>
              </div>
            ))}
            <div className="d-flex justify-content-between small text-muted">
              <span>Balance</span>
              <span className={balance > 0.01 ? "text-danger" : ""}>₹{balance.toFixed(2)}</span>
            </div>
          </div>

          <button className="btn btn-success btn-lg w-100" disabled={cart.length === 0 || submitting || !branchId} onClick={handleCheckout}>
            {submitting ? "Processing..." : "Complete Sale"}
          </button>
          <div className="text-muted small mt-2">Billed by {user?.name}</div>
        </div>
      </div>
    </div>
  );
}
