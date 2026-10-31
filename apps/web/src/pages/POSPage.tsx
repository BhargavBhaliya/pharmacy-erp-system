import { useEffect, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import html2canvas from "html2canvas";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { InvoiceDocument, type InvoiceBranding, type InvoiceSaleDetail } from "../components/InvoiceDocument";

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
  manufacturer?: { id: string; name: string } | null;
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
interface CompletedInvoice extends InvoiceSaleDetail {
  id: string;
  customerId?: string;
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

// wa.me needs a country-code-prefixed, digits-only number. Indian mobiles are stored as plain
// 10-digit numbers (sometimes with a leading 0 or +91) — normalize to the 91XXXXXXXXXX shape.
// There's no WhatsApp Business API integration here (that needs a paid, verified account), so
// this opens WhatsApp Web/app pre-filled on whichever device the cashier is using, ready to hit
// Send — not an automated send from the business's own number.
function buildWhatsAppLink(mobile: string, message: string): string | null {
  let digits = mobile.replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  else if (digits.length === 11 && digits.startsWith("0")) digits = `91${digits.slice(1)}`;
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function POSPage() {
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [debouncedCustomerQuery, setDebouncedCustomerQuery] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [newCustomerMobile, setNewCustomerMobile] = useState("");
  const [invoiceType, setInvoiceType] = useState<(typeof INVOICE_TYPES)[number]>("CASH");
  const [payments, setPayments] = useState<PaymentLine[]>([]);
  const [autoPayment, setAutoPayment] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastInvoice, setLastInvoice] = useState<CompletedInvoice | null>(null);
  const [editingMobile, setEditingMobile] = useState<string | null>(null);
  const [sharingInvoice, setSharingInvoice] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [pendingBatchProduct, setPendingBatchProduct] = useState<ProductLite | null>(null);
  const [batchPickerProduct, setBatchPickerProduct] = useState<ProductLite | null>(null);
  const [batchPickerOptions, setBatchPickerOptions] = useState<BatchOption[]>([]);
  const [batchFilterQuery, setBatchFilterQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const invoiceCaptureRef = useRef<HTMLDivElement>(null);

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await api.get<{ data: Branch[] }>("/branches")).data.data,
  });

  const { data: branding } = useQuery({
    queryKey: ["settings", "branding"],
    queryFn: async () => (await api.get<{ data: InvoiceBranding }>("/settings/branding")).data.data,
  });

  // Default to the first branch once the list arrives, but only if the cashier hasn't
  // already picked one (so a refetch never silently overrides their selection).
  useEffect(() => {
    if (!branchId && branches.length > 0) setBranchId(branches[0].id);
  }, [branches, branchId]);

  const { data: customerDetail } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: async () => (await api.get<{ data: CustomerDetail }>(`/customers/${customerId}`)).data.data,
    enabled: !!customerId,
  });

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedCustomerQuery(customerQuery), 250);
    return () => clearTimeout(handle);
  }, [customerQuery]);

  const customerSearchQuery = useQuery({
    queryKey: ["customers", "search", debouncedCustomerQuery],
    queryFn: async () =>
      (await api.get<{ data: Customer[] }>("/customers", { params: { search: debouncedCustomerQuery } })).data.data.slice(0, 8),
    enabled: !customerId && debouncedCustomerQuery.trim().length >= 2,
  });
  const customerResults = customerId || customerQuery.trim().length < 2 ? [] : customerSearchQuery.data ?? [];

  function selectCustomer(c: Customer) {
    setCustomerId(c.id);
    setCustomerQuery(c.name);
  }

  function clearCustomer() {
    setCustomerId("");
    setCustomerQuery("");
    setNewCustomerMobile("");
  }

  const createCustomerMutation = useMutation({
    mutationFn: (payload: { name: string; mobile?: string }) => api.post<{ data: Customer }>("/customers", payload),
    onSuccess: (res) => {
      const created = res.data.data;
      setCustomerId(created.id);
      setCustomerQuery(created.name);
      setNewCustomerMobile("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to create customer");
    },
  });

  function handleCreateCustomerInline() {
    const name = customerQuery.trim();
    if (!name || !newCustomerMobile.trim()) return;
    createCustomerMutation.mutate({ name, mobile: newCustomerMobile.trim() || undefined });
  }

  // Lets a cashier fill in a phone number for an already-existing customer who doesn't have one
  // on file yet, right from the billing screen (or from the just-completed-sale popup) — needed
  // for WhatsApp invoice sharing to work.
  const updateCustomerMobileMutation = useMutation({
    mutationFn: ({ id, mobile }: { id: string; mobile: string }) => api.put(`/customers/${id}`, { mobile }),
    onSuccess: (_res, { id, mobile }) => {
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setLastInvoice((prev) => (prev && prev.customerId === id ? { ...prev, customer: prev.customer ? { ...prev.customer, mobile } : prev.customer } : prev));
      setEditingMobile(null);
      setError(null);
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to save phone number");
    },
  });

  function saveCustomerMobile(id: string) {
    if (!id || !editingMobile?.trim()) return;
    updateCustomerMobileMutation.mutate({ id, mobile: editingMobile.trim() });
  }

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(handle);
  }, [search]);

  const productSearchQuery = useQuery({
    queryKey: ["products", "search", debouncedSearch],
    queryFn: async () =>
      (await api.get<{ data: ProductLite[] }>("/products", { params: { search: debouncedSearch, pageSize: 10 } })).data.data,
    enabled: debouncedSearch.trim().length >= 2,
  });
  const results = search.trim().length < 2 ? [] : productSearchQuery.data ?? [];

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
    searchRef.current?.focus();
  }

  // Looks up which batches are actually sellable for this product at this branch. staleTime: 0
  // keeps this always-fresh (never cached) — a cashier actively building a cart must never sell
  // against stock numbers that could already be stale. If more than one manufacturer has stock,
  // the cashier is asked which to sell instead of the system silently picking one via FEFO.
  const availableBatchesQuery = useQuery({
    queryKey: ["available-batches", pendingBatchProduct?.id, branchId],
    queryFn: async () =>
      (
        await api.get<{ data: BatchOption[] }>("/sales/available-batches", {
          params: { productId: pendingBatchProduct!.id, branchId },
        })
      ).data.data,
    enabled: !!pendingBatchProduct && !!branchId,
    staleTime: 0,
  });
  const batchPickerLoading = availableBatchesQuery.isFetching;

  useEffect(() => {
    if (!pendingBatchProduct || !availableBatchesQuery.data) return;
    const batches = availableBatchesQuery.data;
    const manufacturerIds = new Set(batches.map((b) => b.manufacturer?.id ?? "unspecified"));
    if (batches.length === 0) {
      addToCart(pendingBatchProduct);
    } else if (manufacturerIds.size <= 1) {
      addToCart(pendingBatchProduct);
    } else {
      setBatchPickerProduct(pendingBatchProduct);
      setBatchPickerOptions(batches);
      setBatchFilterQuery("");
    }
    setPendingBatchProduct(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableBatchesQuery.data]);

  function handleProductSelect(p: ProductLite) {
    setSearch("");
    if (!branchId) return;
    setPendingBatchProduct(p);
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

  const checkoutMutation = useMutation({
    mutationFn: (payload: {
      branchId: string;
      customerId?: string;
      invoiceType: typeof invoiceType;
      items: { productId: string; batchId?: string; quantity: number; sellingPrice: number; discountPercent: number }[];
      payments: { amount: number; paymentMode: string }[];
    }) => api.post<{ data: InvoiceSaleDetail & { id: string; customer?: (InvoiceSaleDetail["customer"] & { id: string }) | null } }>(
      "/sales",
      payload
    ),
    onSuccess: (res) => {
      const sale = res.data.data;
      setLastInvoice({ ...sale, customerId: sale.customer?.id });
      setEditingMobile(null);
      setShareError(null);
      setCart([]);
      setPayments([]);
      setAutoPayment(true);
      clearCustomer();
      setInvoiceType("CASH");
      setError(null);
      searchRef.current?.focus();
      queryClient.invalidateQueries({ queryKey: ["sales"] });
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Checkout failed");
    },
  });

  const checkoutDisabled = checkoutMutation.isPending || blockingReason !== null;

  function handleCheckout() {
    setError(null);
    checkoutMutation.mutate({
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
  }

  // Renders the off-screen InvoiceDocument (with logo/signature) to a PNG and hands it to the
  // OS share sheet via the Web Share API's file support, so the cashier can pick WhatsApp and
  // send the actual invoice image — not just a text message. Only mobile Chrome/Safari and a
  // handful of desktop browsers support sharing files this way; where it's missing, the image
  // downloads instead and a WhatsApp chat opens with the customer so it can be attached by hand.
  async function handleShareInvoiceImage() {
    if (!lastInvoice || !invoiceCaptureRef.current) return;
    setShareError(null);
    setSharingInvoice(true);
    try {
      const canvas = await html2canvas(invoiceCaptureRef.current, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Could not render the invoice image");

      const fileName = `Invoice-${lastInvoice.invoiceNumber}.png`;
      const file = new File([blob], fileName, { type: "image/png" });
      const message = `Hi ${lastInvoice.customer?.name ?? "there"}, thank you for shopping at ${branding?.businessName ?? ""}! Invoice ${lastInvoice.invoiceNumber}, total ₹${lastInvoice.totalAmount}.`;

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName, text: message });
        return;
      }

      // Fallback: download the image, then open a WhatsApp chat with the customer so the
      // cashier can attach the just-downloaded file manually.
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      setShareError(`"${fileName}" downloaded. Attach it in the WhatsApp chat that's about to open.`);
      const waLink = lastInvoice.customer?.mobile && buildWhatsAppLink(lastInvoice.customer.mobile, message);
      if (waLink) window.open(waLink, "_blank");
    } catch (err) {
      // A user cancelling the native share sheet also lands here (AbortError) — not a real
      // failure, so don't show it as one.
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setShareError("Couldn't prepare the invoice image for sharing.");
      }
    } finally {
      setSharingInvoice(false);
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
                    {p.manufacturer && <span className="badge text-bg-light border ms-1">{p.manufacturer.name}</span>}
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
                    {customerDetail.mobile ? (
                      <div className="small">📞 {customerDetail.mobile}</div>
                    ) : hasPermission("customers", "edit") ? (
                      editingMobile !== null ? (
                        <div className="d-flex gap-1 mt-1">
                          <input
                            className="form-control form-control-sm"
                            placeholder="Mobile number"
                            value={editingMobile}
                            onChange={(e) => setEditingMobile(e.target.value)}
                            autoFocus
                          />
                          <button
                            className="btn btn-sm btn-primary"
                            type="button"
                            disabled={!editingMobile.trim() || updateCustomerMobileMutation.isPending}
                            onClick={() => saveCustomerMobile(customerId)}
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <button className="btn btn-sm btn-link p-0 small" type="button" onClick={() => setEditingMobile("")}>
                          + Add phone number
                        </button>
                      )
                    ) : null}
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
                          disabled={!newCustomerMobile.trim() || createCustomerMutation.isPending}
                          onClick={handleCreateCustomerInline}
                        >
                          {createCustomerMutation.isPending ? "Saving..." : `+ Add "${customerQuery.trim()}" as new customer`}
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
            {checkoutMutation.isPending ? "Processing..." : "Complete Sale"}
          </button>
          {blockingReason && !checkoutMutation.isPending && <div className="text-danger small mt-2 text-center">{blockingReason}</div>}
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

      {lastInvoice && (
        <div className="modal d-block" tabIndex={-1} style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Sale complete</h5>
                <button type="button" className="btn-close" onClick={() => setLastInvoice(null)}></button>
              </div>
              <div className="modal-body">
                <div className="fs-5">
                  Invoice <strong>{lastInvoice.invoiceNumber}</strong>
                </div>
                <div className="text-muted mb-2">{lastInvoice.customer?.name ?? "Walk-in customer"}</div>
                <div className="fs-4 fw-semibold mb-3">₹{lastInvoice.totalAmount}</div>

                {lastInvoice.customerId && !lastInvoice.customer?.mobile && hasPermission("customers", "edit") && (
                  <div className="border rounded p-2 mb-3">
                    <div className="small text-muted mb-1">No phone number on file — add one to share this invoice on WhatsApp:</div>
                    <div className="d-flex gap-1">
                      <input
                        className="form-control form-control-sm"
                        placeholder="Mobile number"
                        value={editingMobile ?? ""}
                        onChange={(e) => setEditingMobile(e.target.value)}
                      />
                      <button
                        className="btn btn-sm btn-primary"
                        type="button"
                        disabled={!editingMobile?.trim() || updateCustomerMobileMutation.isPending}
                        onClick={() => lastInvoice.customerId && saveCustomerMobile(lastInvoice.customerId)}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}

                {shareError && <div className="alert alert-warning py-2 small">{shareError}</div>}

                <div className="d-grid gap-2">
                  <button
                    className="btn btn-outline-secondary"
                    type="button"
                    onClick={() => window.open(`/sales/${lastInvoice.id}/print`, "_blank")}
                  >
                    🖨️ Print invoice
                  </button>
                  {lastInvoice.customer?.mobile && branding?.whatsappNumber && (
                    <button className="btn btn-success" type="button" disabled={sharingInvoice} onClick={handleShareInvoiceImage}>
                      {sharingInvoice ? "Preparing image..." : "💬 Share on WhatsApp"}
                    </button>
                  )}
                  {lastInvoice.customer?.mobile && !branding?.whatsappNumber && (
                    <div className="text-muted small text-center">
                      Set a WhatsApp number in Settings to enable sharing invoices.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Off-screen render used only to capture a shareable invoice image (see
          handleShareInvoiceImage) — never visible, but must be actually laid out in the DOM for
          html2canvas to read it, so this can't be display:none. */}
      {lastInvoice && branding && (
        <div style={{ position: "fixed", top: 0, left: -10_000, width: 850, background: "#fff" }}>
          <div ref={invoiceCaptureRef} className="p-4">
            <InvoiceDocument sale={lastInvoice} branding={branding} />
          </div>
        </div>
      )}
    </div>
  );
}
