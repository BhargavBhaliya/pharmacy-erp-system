import { useEffect, useRef, useState } from "react";
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
  gstRatePercent: string;
}
interface Customer {
  id: string;
  name: string;
  mobile?: string | null;
}
interface CustomerDetail extends Customer {
  address?: string | null;
  creditLimit: string;
  creditDays: number;
  outstandingBalance: number;
}
interface BatchOption {
  id: string;
  batchNumber: string;
  quantity: number;
  mrp: string;
  gstRatePercent: string;
  expiryDate: string;
  manufacturer: { id: string; name: string } | null;
}
interface CartLine {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  sellingPrice: number;
  discountPercent: number;
  gstRatePercent: number;
  batchId?: string;
  batchNumber?: string;
  manufacturerName?: string;
  maxQuantity?: number;
}
interface PaymentLine {
  amount: number;
  paymentMode: string;
}

const PAYMENT_MODES = ["CASH", "UPI", "CARD", "BANK_TRANSFER", "CHEQUE", "OTHER"];
const INVOICE_TYPES = ["CASH", "CREDIT", "TAX", "RETAIL", "WHOLESALE"] as const;

export function POSPage() {
  const { user, hasPermission } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<ProductLite[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [customerDetail, setCustomerDetail] = useState<CustomerDetail | null>(null);
  const [newCustomerMobile, setNewCustomerMobile] = useState("");
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [invoiceType, setInvoiceType] = useState<(typeof INVOICE_TYPES)[number]>("CASH");
  const [payments, setPayments] = useState<PaymentLine[]>([]);
  const [autoPayment, setAutoPayment] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastInvoice, setLastInvoice] = useState<{ invoiceNumber: string; totalAmount: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [batchPickerProduct, setBatchPickerProduct] = useState<ProductLite | null>(null);
  const [batchPickerOptions, setBatchPickerOptions] = useState<BatchOption[]>([]);
  const [batchPickerLoading, setBatchPickerLoading] = useState(false);
  const [batchFilterQuery, setBatchFilterQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<{ data: Branch[] }>("/branches").then((res) => {
      setBranches(res.data.data);
      if (res.data.data.length > 0) setBranchId(res.data.data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!customerId) {
      setCustomerDetail(null);
      return;
    }
    api.get<{ data: CustomerDetail }>(`/customers/${customerId}`).then((res) => setCustomerDetail(res.data.data));
  }, [customerId]);

  useEffect(() => {
    if (customerId || customerQuery.trim().length < 2) {
      setCustomerResults([]);
      return;
    }
    const handle = setTimeout(() => {
      api.get<{ data: Customer[] }>("/customers", { params: { search: customerQuery } }).then((res) => setCustomerResults(res.data.data.slice(0, 8)));
    }, 250);
    return () => clearTimeout(handle);
  }, [customerQuery, customerId]);

  function selectCustomer(c: Customer) {
    setCustomerId(c.id);
    setCustomerQuery(c.name);
    setCustomerResults([]);
  }

  function clearCustomer() {
    setCustomerId("");
    setCustomerDetail(null);
    setCustomerQuery("");
    setNewCustomerMobile("");
  }

  async function handleCreateCustomerInline() {
    const name = customerQuery.trim();
    if (!name || !newCustomerMobile.trim()) return;
    setSavingCustomer(true);
    setError(null);
    try {
      const res = await api.post<{ data: Customer }>("/customers", {
        name,
        mobile: newCustomerMobile.trim() || undefined,
      });
      const created = res.data.data;
      setCustomerId(created.id);
      setCustomerQuery(created.name);
      setCustomerResults([]);
      setNewCustomerMobile("");
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to create customer");
    } finally {
      setSavingCustomer(false);
    }
  }

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

  function addToCart(p: ProductLite, batch?: BatchOption) {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === p.id && l.batchId === batch?.id);
      if (existing) {
        return prev.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          productId: p.id,
          name: p.name,
          sku: p.sku,
          quantity: 1,
          sellingPrice: Number(p.sellingPrice),
          discountPercent: 0,
          gstRatePercent: batch ? Number(batch.gstRatePercent) : Number(p.gstRatePercent),
          batchId: batch?.id,
          batchNumber: batch?.batchNumber,
          manufacturerName: batch?.manufacturer?.name,
          maxQuantity: batch?.quantity,
        },
      ];
    });
    setSearch("");
    setResults([]);
    searchRef.current?.focus();
  }

  // Looks up which batches are actually sellable for this product at this branch. If more
  // than one manufacturer has stock, the cashier is asked which to sell instead of the
  // system silently picking one via FEFO.
  async function handleProductSelect(p: ProductLite) {
    setSearch("");
    setResults([]);
    if (!branchId) return;
    setBatchPickerLoading(true);
    try {
      const res = await api.get<{ data: BatchOption[] }>("/sales/available-batches", { params: { productId: p.id, branchId } });
      const batches = res.data.data;
      const manufacturerIds = new Set(batches.map((b) => b.manufacturer?.id ?? "unspecified"));
      if (batches.length === 0) {
        addToCart(p);
      } else if (manufacturerIds.size <= 1) {
        addToCart(p);
      } else {
        setBatchPickerProduct(p);
        setBatchPickerOptions(batches);
        setBatchFilterQuery("");
      }
    } finally {
      setBatchPickerLoading(false);
    }
  }

  function pickBatch(batch: BatchOption) {
    if (batchPickerProduct) addToCart(batchPickerProduct, batch);
    setBatchPickerProduct(null);
    setBatchPickerOptions([]);
  }

  const filteredBatchOptions = batchPickerOptions.filter((b) => {
    const q = batchFilterQuery.trim().toLowerCase();
    if (!q) return true;
    return (b.manufacturer?.name ?? "unspecified").toLowerCase().includes(q) || b.batchNumber.toLowerCase().includes(q);
  });

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      handleProductSelect(results[0]);
    }
  }

  function updateLine(productId: string, batchId: string | undefined, patch: Partial<CartLine>) {
    setCart((prev) => prev.map((l) => (l.productId === productId && l.batchId === batchId ? { ...l, ...patch } : l)));
  }

  function removeLine(productId: string, batchId: string | undefined) {
    setCart((prev) => prev.filter((l) => !(l.productId === productId && l.batchId === batchId)));
  }

  const taxableAmount = (l: CartLine) => Math.round(l.quantity * l.sellingPrice * (1 - l.discountPercent / 100) * 100) / 100;
  const gstAmount = (l: CartLine) => Math.round(taxableAmount(l) * (l.gstRatePercent / 100) * 100) / 100;
  const lineTotal = (l: CartLine) => Math.round((taxableAmount(l) + gstAmount(l)) * 100) / 100;
  const subtotal = Math.round(cart.reduce((sum, l) => sum + taxableAmount(l), 0) * 100) / 100;
  const totalTax = Math.round(cart.reduce((sum, l) => sum + gstAmount(l), 0) * 100) / 100;
  const grandTotal = Math.round(cart.reduce((sum, l) => sum + lineTotal(l), 0) * 100) / 100;
  const paidTotal = Math.round(payments.reduce((sum, p) => sum + p.amount, 0) * 100) / 100;
  const balance = Math.round((grandTotal - paidTotal) * 100) / 100;
  const changeDue = balance < -0.01 ? Math.abs(balance) : 0;

  // Keep a single payment line in sync with the invoice total for the common
  // case (full cash/card payment). Any manual edit switches this off so the
  // cashier's own numbers are never silently overwritten.
  useEffect(() => {
    if (!autoPayment) return;
    if (invoiceType === "CREDIT" || cart.length === 0) {
      setPayments((prev) => (prev.length === 0 ? prev : []));
      return;
    }
    setPayments((prev) => [{ amount: grandTotal, paymentMode: prev[0]?.paymentMode ?? "CASH" }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grandTotal, invoiceType, cart.length, autoPayment]);

  function addPayment() {
    setAutoPayment(false);
    setPayments((prev) => [...prev, { amount: Math.max(balance, 0), paymentMode: "CASH" }]);
  }

  function updatePaymentAmount(idx: number, amount: number) {
    setAutoPayment(false);
    setPayments((prev) => prev.map((p, i) => (i === idx ? { ...p, amount } : p)));
  }

  function removePayment(idx: number) {
    setAutoPayment(false);
    setPayments((prev) => prev.filter((_, i) => i !== idx));
  }

  function payFullAmount() {
    setAutoPayment(true);
    setPayments([{ amount: grandTotal, paymentMode: payments[0]?.paymentMode ?? "CASH" }]);
  }

  const insufficientPayment = invoiceType !== "CREDIT" && balance > 0.01;
  const blockingReason =
    cart.length === 0
      ? "Add at least one item to the cart"
      : !branchId
        ? "Select a branch"
        : !customerId
          ? "Select or add a customer before billing"
          : insufficientPayment
            ? `₹${balance.toFixed(2)} payment still due`
            : null;
  const checkoutDisabled = submitting || blockingReason !== null;

  async function handleCheckout() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post("/sales", {
        branchId,
        customerId: customerId || undefined,
        invoiceType,
        items: cart.map((l) => ({
          productId: l.productId,
          batchId: l.batchId,
          quantity: l.quantity,
          sellingPrice: l.sellingPrice,
          discountPercent: l.discountPercent,
        })),
        payments: payments.map((p) => ({ amount: p.amount, paymentMode: p.paymentMode })),
      });
      setLastInvoice({ invoiceNumber: res.data.data.invoiceNumber, totalAmount: res.data.data.totalAmount });
      setCart([]);
      setPayments([]);
      setAutoPayment(true);
      clearCustomer();
      setInvoiceType("CASH");
      searchRef.current?.focus();
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
              ref={searchRef}
              className="form-control form-control-lg"
              placeholder="Scan barcode or search product name / SKU... (Enter adds top match)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              autoFocus
            />
            {results.length > 0 && (
              <div className="list-group position-absolute w-100 shadow" style={{ zIndex: 10 }}>
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="list-group-item list-group-item-action"
                    disabled={batchPickerLoading}
                    onClick={() => handleProductSelect(p)}
                  >
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
                  <th style={{ width: 70 }}>GST %</th>
                  <th style={{ width: 100 }}>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cart.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-muted py-4">
                      Cart is empty. Search above to add items.
                    </td>
                  </tr>
                )}
                {cart.map((l) => (
                  <tr key={`${l.productId}-${l.batchId ?? "fefo"}`}>
                    <td>
                      {l.name}
                      <div className="text-muted small">
                        {l.sku}
                        {l.manufacturerName && (
                          <>
                            {" · "}
                            <span className="badge text-bg-light border">{l.manufacturerName}</span>
                            {l.batchNumber && ` (Batch ${l.batchNumber})`}
                          </>
                        )}
                      </div>
                    </td>
                    <td>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        min={1}
                        max={l.maxQuantity}
                        value={l.quantity}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const raw = Math.max(1, Number(e.target.value) || 1);
                          const qty = l.maxQuantity ? Math.min(raw, l.maxQuantity) : raw;
                          updateLine(l.productId, l.batchId, { quantity: qty });
                        }}
                      />
                      {l.maxQuantity !== undefined && l.quantity >= l.maxQuantity && (
                        <div className="text-warning small">Max stock {l.maxQuantity}</div>
                      )}
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        className="form-control form-control-sm"
                        value={l.sellingPrice}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => updateLine(l.productId, l.batchId, { sellingPrice: Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        value={l.discountPercent}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => updateLine(l.productId, l.batchId, { discountPercent: Number(e.target.value) })}
                      />
                    </td>
                    <td className="text-muted small align-middle">{l.gstRatePercent}%</td>
                    <td>₹{lineTotal(l).toFixed(2)}</td>
                    <td>
                      <button className="btn btn-sm btn-outline-danger" onClick={() => removeLine(l.productId, l.batchId)}>
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
            <label className="form-label">Customer *</label>

            {customerId && customerDetail ? (
              <div className="border rounded p-2 mb-3">
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <div className="fw-semibold">{customerDetail.name}</div>
                    {customerDetail.mobile && <div className="small">📞 {customerDetail.mobile}</div>}
                    {customerDetail.address && <div className="small text-muted">{customerDetail.address}</div>}
                  </div>
                  <button className="btn btn-sm btn-link p-0" type="button" onClick={clearCustomer}>
                    Change
                  </button>
                </div>
                <div className="d-flex justify-content-between small mt-2 border-top pt-1">
                  <span>Outstanding</span>
                  <span className={Number(customerDetail.outstandingBalance) > 0 ? "text-danger fw-semibold" : ""}>
                    ₹{Number(customerDetail.outstandingBalance).toFixed(2)}
                  </span>
                </div>
                <div className="d-flex justify-content-between small">
                  <span>Credit limit</span>
                  <span>₹{Number(customerDetail.creditLimit).toFixed(2)}</span>
                </div>
              </div>
            ) : (
              <div className="position-relative mb-3">
                <input
                  className="form-control"
                  placeholder="Type customer name or mobile..."
                  value={customerQuery}
                  onChange={(e) => setCustomerQuery(e.target.value)}
                />
                {customerResults.length > 0 && (
                  <div className="list-group position-absolute w-100 shadow" style={{ zIndex: 10 }}>
                    {customerResults.map((c) => (
                      <button key={c.id} type="button" className="list-group-item list-group-item-action" onClick={() => selectCustomer(c)}>
                        {c.name} {c.mobile ? <span className="text-muted small">({c.mobile})</span> : null}
                      </button>
                    ))}
                  </div>
                )}
                {customerQuery.trim().length >= 2 && customerResults.length === 0 && (
                  <div className="border rounded p-2 mt-1 bg-light-subtle">
                    {hasPermission("customers", "add") ? (
                      <>
                        <div className="small text-muted mb-1">No existing customer found — add as new:</div>
                        <input
                          className="form-control form-control-sm mb-2"
                          placeholder="Mobile number *"
                          value={newCustomerMobile}
                          onChange={(e) => setNewCustomerMobile(e.target.value)}
                        />
                        <button
                          className="btn btn-sm btn-primary w-100"
                          type="button"
                          disabled={!newCustomerMobile.trim() || savingCustomer}
                          onClick={handleCreateCustomerInline}
                        >
                          {savingCustomer ? "Saving..." : `+ Add "${customerQuery.trim()}" as new customer`}
                        </button>
                      </>
                    ) : (
                      <div className="small text-muted">No matching customer found. Ask a manager to add this customer.</div>
                    )}
                  </div>
                )}
                <div className="text-danger small mt-1">Customer details are required before billing.</div>
              </div>
            )}

            <label className="form-label">Invoice type</label>
            <select className="form-select mb-3" value={invoiceType} onChange={(e) => setInvoiceType(e.target.value as typeof invoiceType)}>
              {INVOICE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            <div className="border-top pt-2">
              <div className="d-flex justify-content-between small text-muted">
                <span>Subtotal</span>
                <span>₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="d-flex justify-content-between small text-muted">
                <span>GST</span>
                <span>₹{totalTax.toFixed(2)}</span>
              </div>
              <div className="d-flex justify-content-between fs-5 fw-semibold">
                <span>Total</span>
                <span>₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="card card-body mb-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <label className="form-label mb-0">Payments</label>
              <div className="d-flex gap-1">
                {invoiceType !== "CREDIT" && (
                  <button className="btn btn-sm btn-outline-success" onClick={payFullAmount} type="button">
                    Pay full
                  </button>
                )}
                <button className="btn btn-sm btn-outline-primary" onClick={addPayment} type="button">
                  + Split
                </button>
              </div>
            </div>
            {payments.length === 0 && invoiceType === "CREDIT" && (
              <div className="text-muted small mb-2">No payment due now — full amount goes on customer credit.</div>
            )}
            {payments.map((p, idx) => (
              <div key={idx} className="d-flex gap-2 mb-2">
                <input
                  type="number"
                  className="form-control form-control-sm"
                  value={p.amount}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => updatePaymentAmount(idx, Number(e.target.value))}
                />
                <select
                  className="form-select form-select-sm"
                  value={p.paymentMode}
                  onChange={(e) => setPayments((prev) => prev.map((pp, i) => (i === idx ? { ...pp, paymentMode: e.target.value } : pp)))}
                >
                  {PAYMENT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <button className="btn btn-sm btn-outline-danger" onClick={() => removePayment(idx)}>
                  ×
                </button>
              </div>
            ))}
            <div className="d-flex justify-content-between small text-muted">
              <span>Balance due</span>
              <span className={balance > 0.01 ? "text-danger fw-semibold" : ""}>₹{Math.max(balance, 0).toFixed(2)}</span>
            </div>
            {changeDue > 0.01 && (
              <div className="d-flex justify-content-between small text-success fw-semibold">
                <span>Change to return</span>
                <span>₹{changeDue.toFixed(2)}</span>
              </div>
            )}
          </div>

          <button className="btn btn-success btn-lg w-100" disabled={checkoutDisabled} onClick={handleCheckout}>
            {submitting ? "Processing..." : "Complete Sale"}
          </button>
          {blockingReason && !submitting && <div className="text-danger small mt-2 text-center">{blockingReason}</div>}
          <div className="text-muted small mt-2">Billed by {user?.name}</div>
        </div>
      </div>

      {batchPickerProduct && (
        <div className="modal d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog modal-dialog-scrollable" style={{ maxHeight: "80vh" }}>
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Choose manufacturer — {batchPickerProduct.name}</h5>
                <button type="button" className="btn-close" onClick={() => setBatchPickerProduct(null)}></button>
              </div>
              <div className="modal-body">
                <div className="text-muted small mb-2">
                  Stock available from {batchPickerOptions.length} manufacturers/batches. Pick which one to sell:
                </div>
                {batchPickerOptions.length > 6 && (
                  <input
                    className="form-control form-control-sm mb-2"
                    placeholder="Filter by manufacturer or batch number..."
                    value={batchFilterQuery}
                    onChange={(e) => setBatchFilterQuery(e.target.value)}
                    autoFocus
                  />
                )}
                <div className="list-group">
                  {filteredBatchOptions.length === 0 && <div className="text-muted small py-2">No matches.</div>}
                  {filteredBatchOptions.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                      onClick={() => pickBatch(b)}
                    >
                      <span>
                        <strong>{b.manufacturer?.name ?? "Unspecified manufacturer"}</strong>
                        <div className="small text-muted">
                          Batch {b.batchNumber} · Exp {new Date(b.expiryDate).toLocaleDateString()} · Stock {b.quantity}
                        </div>
                      </span>
                      <span>₹{b.mrp}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
