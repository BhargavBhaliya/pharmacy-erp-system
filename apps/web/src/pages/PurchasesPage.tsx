import { useEffect, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface Branch {
  id: string;
  name: string;
}
interface Supplier {
  id: string;
  name: string;
}
interface ProductLite {
  id: string;
  name: string;
  sku: string;
  purchasePrice: string;
  mrp: string;
  gstRatePercent: string;
}
interface Purchase {
  id: string;
  referenceNumber: string;
  supplierInvoiceNumber?: string | null;
  totalAmount: string;
  paidAmount: string;
  paymentStatus: string;
  supplier: { name: string };
  createdAt: string;
}

interface LineItem {
  productId: string;
  productName: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  freeQuantity: number;
  purchaseRate: number;
  mrp: number;
  discountPercent: number;
  gstRatePercent: number;
}

export function PurchasesPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [branchId, setBranchId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [supplierInvoiceNumber, setSupplierInvoiceNumber] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await api.get<{ data: Branch[] }>("/branches")).data.data,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => (await api.get<{ data: Supplier[] }>("/suppliers")).data.data,
  });

  const { data: purchases = [], isLoading } = useQuery({
    queryKey: ["purchases"],
    queryFn: async () => (await api.get<{ data: Purchase[] }>("/purchases")).data.data,
  });

  useEffect(() => {
    if (search.trim().length < 2) {
      setDebouncedSearch("");
      return;
    }
    const handle = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(handle);
  }, [search]);

  const { data: results = [] } = useQuery({
    queryKey: ["products", debouncedSearch],
    queryFn: async () => (await api.get<{ data: ProductLite[] }>("/products", { params: { search: debouncedSearch, pageSize: 10 } })).data.data,
    enabled: debouncedSearch.trim().length >= 2,
  });

  const createMutation = useMutation({
    mutationFn: (payload: { branchId: string; supplierId: string; supplierInvoiceNumber?: string; items: unknown[] }) => api.post("/purchases", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      setShowForm(false);
      setItems([]);
      setSupplierInvoiceNumber("");
      setError(null);
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to record purchase");
    },
  });

  const payMutation = useMutation({
    mutationFn: ({ purchaseId, amount }: { purchaseId: string; amount: number }) => api.post(`/purchases/${purchaseId}/payments`, { amount, paymentMode: "CASH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      setPayingId(null);
      setPayAmount(0);
      setError(null);
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to record payment");
    },
  });

  function addLine(p: ProductLite) {
    setItems((prev) => [
      ...prev,
      {
        productId: p.id,
        productName: p.name,
        batchNumber: "",
        expiryDate: "",
        quantity: 1,
        freeQuantity: 0,
        purchaseRate: Number(p.purchasePrice),
        mrp: Number(p.mrp),
        discountPercent: 0,
        gstRatePercent: Number(p.gstRatePercent),
      },
    ]);
    setSearch("");
    setDebouncedSearch("");
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      addLine(results[0]);
    }
  }

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate({
      branchId,
      supplierId,
      supplierInvoiceNumber: supplierInvoiceNumber || undefined,
      items: items.map((i) => ({ ...i, expiryDate: new Date(i.expiryDate).toISOString() })),
    });
  }

  function handlePay(purchaseId: string) {
    payMutation.mutate({ purchaseId, amount: payAmount });
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = { UNPAID: "text-bg-danger", PARTIAL: "text-bg-warning", PAID: "text-bg-success" };
    return <span className={`badge ${map[status] ?? "text-bg-secondary"}`}>{status}</span>;
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="mb-0">Purchases (Goods Receipt / Invoice)</h3>
        {hasPermission("purchase", "add") && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "Record purchase"}
          </button>
        )}
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      {showForm && (
        <form className="card card-body mb-4" onSubmit={handleCreate}>
          <div className="row g-3 mb-2">
            <div className="col-md-3">
              <label className="form-label">Branch</label>
              <select className="form-select" required value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">Select</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Supplier</label>
              <select className="form-select" required value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">Select</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <label className="form-label">Supplier invoice #</label>
              <input className="form-control" value={supplierInvoiceNumber} onChange={(e) => setSupplierInvoiceNumber(e.target.value)} />
            </div>
          </div>

          <div className="position-relative mb-3">
            <input
              className="form-control"
              placeholder="Scan barcode or search product name / SKU to add a line..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
            {results.length > 0 && (
              <div className="list-group position-absolute w-100 shadow" style={{ zIndex: 10 }}>
                {results.map((p) => (
                  <button key={p.id} type="button" className="list-group-item list-group-item-action" onClick={() => addLine(p)}>
                    {p.name} <span className="text-muted small">({p.sku})</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="table-responsive">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th style={{ minWidth: 180 }}>Product</th>
                  <th>Batch #</th>
                  <th>Expiry</th>
                  <th>Qty</th>
                  <th>Free</th>
                  <th>Rate</th>
                  <th>MRP</th>
                  <th>Disc %</th>
                  <th>GST %</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center text-muted py-3">
                      Scan or search a product above to add a line.
                    </td>
                  </tr>
                )}
                {items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="align-middle">{item.productName}</td>
                    <td>
                      <input className="form-control form-control-sm" required value={item.batchNumber} onChange={(e) => updateItem(idx, { batchNumber: e.target.value })} />
                    </td>
                    <td>
                      <input type="date" className="form-control form-control-sm" required value={item.expiryDate} onChange={(e) => updateItem(idx, { expiryDate: e.target.value })} />
                    </td>
                    <td>
                      <input type="number" className="form-control form-control-sm" style={{ width: 70 }} min={1} value={item.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} />
                    </td>
                    <td>
                      <input type="number" className="form-control form-control-sm" style={{ width: 60 }} min={0} value={item.freeQuantity} onChange={(e) => updateItem(idx, { freeQuantity: Number(e.target.value) })} />
                    </td>
                    <td>
                      <input type="number" step="0.01" className="form-control form-control-sm" style={{ width: 80 }} value={item.purchaseRate} onChange={(e) => updateItem(idx, { purchaseRate: Number(e.target.value) })} />
                    </td>
                    <td>
                      <input type="number" step="0.01" className="form-control form-control-sm" style={{ width: 80 }} value={item.mrp} onChange={(e) => updateItem(idx, { mrp: Number(e.target.value) })} />
                    </td>
                    <td>
                      <input type="number" className="form-control form-control-sm" style={{ width: 60 }} value={item.discountPercent} onChange={(e) => updateItem(idx, { discountPercent: Number(e.target.value) })} />
                    </td>
                    <td>
                      <input type="number" className="form-control form-control-sm" style={{ width: 60 }} value={item.gstRatePercent} onChange={(e) => updateItem(idx, { gstRatePercent: Number(e.target.value) })} />
                    </td>
                    <td>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}>
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <button type="submit" className="btn btn-primary" style={{ width: 180 }} disabled={items.length === 0 || createMutation.isPending}>
              {createMutation.isPending ? "Saving..." : "Save & update stock"}
            </button>
          </div>
        </form>
      )}

      <div className="card">
        <table className="table mb-0">
          <thead>
            <tr>
              <th>Reference #</th>
              <th>Supplier</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="text-center text-muted py-4">
                  Loading...
                </td>
              </tr>
            )}
            {purchases.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.referenceNumber}
                  {p.supplierInvoiceNumber && <div className="text-muted small">Supplier inv: {p.supplierInvoiceNumber}</div>}
                </td>
                <td>{p.supplier.name}</td>
                <td>₹{p.totalAmount}</td>
                <td>₹{p.paidAmount}</td>
                <td>{statusBadge(p.paymentStatus)}</td>
                <td className="text-end">
                  {p.paymentStatus !== "PAID" && hasPermission("purchase", "edit") && (
                    payingId === p.id ? (
                      <div className="d-flex gap-1 justify-content-end">
                        <input type="number" className="form-control form-control-sm" style={{ width: 90 }} value={payAmount} onChange={(e) => setPayAmount(Number(e.target.value))} />
                        <button className="btn btn-sm btn-primary" onClick={() => handlePay(p.id)} disabled={payMutation.isPending}>
                          {payMutation.isPending ? "Saving..." : "Pay"}
                        </button>
                      </div>
                    ) : (
                      <button className="btn btn-sm btn-outline-secondary" onClick={() => setPayingId(p.id)}>
                        Record payment
                      </button>
                    )
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
