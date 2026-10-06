import { useState, type FormEvent } from "react";
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
}
interface PurchaseOrder {
  id: string;
  orderNumber: string;
  status: string;
  supplier: { name: string };
  branch: { name: string };
  items: { id: string; quantity: number; rate: string; product: { name: string } }[];
  createdAt: string;
}

interface LineItem {
  productId: string;
  quantity: number;
  rate: number;
}

export function PurchaseOrdersPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [branchId, setBranchId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [items, setItems] = useState<LineItem[]>([{ productId: "", quantity: 1, rate: 0 }]);
  const [error, setError] = useState<string | null>(null);

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await api.get<{ data: Branch[] }>("/branches")).data.data,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => (await api.get<{ data: Supplier[] }>("/suppliers")).data.data,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products", { pageSize: 200 }],
    queryFn: async () => (await api.get<{ data: ProductLite[] }>("/products", { params: { pageSize: 200 } })).data.data,
  });

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: async () => (await api.get<{ data: PurchaseOrder[] }>("/purchase-orders")).data.data,
  });

  const createMutation = useMutation({
    mutationFn: (payload: { branchId: string; supplierId: string; items: LineItem[] }) => api.post("/purchase-orders", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      setShowForm(false);
      setItems([{ productId: "", quantity: 1, rate: 0 }]);
      setError(null);
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to create purchase order");
    },
  });

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate({ branchId, supplierId, items });
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      DRAFT: "text-bg-secondary",
      SENT: "text-bg-info",
      PARTIALLY_RECEIVED: "text-bg-warning",
      RECEIVED: "text-bg-success",
      CANCELLED: "text-bg-danger",
    };
    return <span className={`badge ${map[status] ?? "text-bg-secondary"}`}>{status.replace("_", " ")}</span>;
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="mb-0">Purchase Orders</h3>
        {hasPermission("purchase", "add") && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "New purchase order"}
          </button>
        )}
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}

      {showForm && (
        <form className="card card-body mb-4" onSubmit={handleCreate}>
          <div className="row g-3 mb-2">
            <div className="col-md-4">
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
            <div className="col-md-4">
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
          </div>

          <table className="table table-sm">
            <thead>
              <tr>
                <th>Product</th>
                <th style={{ width: 120 }}>Quantity</th>
                <th style={{ width: 140 }}>Rate</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx}>
                  <td>
                    <select
                      className="form-select form-select-sm"
                      required
                      value={item.productId}
                      onChange={(e) => {
                        const p = products.find((pr) => pr.id === e.target.value);
                        updateItem(idx, { productId: e.target.value, rate: p ? Number(p.purchasePrice) : item.rate });
                      }}
                    >
                      <option value="">Select product</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku})
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input type="number" className="form-control form-control-sm" min={1} value={item.quantity} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} />
                  </td>
                  <td>
                    <input type="number" step="0.01" className="form-control form-control-sm" value={item.rate} onChange={(e) => updateItem(idx, { rate: Number(e.target.value) })} />
                  </td>
                  <td>
                    {items.length > 1 && (
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}>
                        ×
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn btn-sm btn-outline-secondary mb-3" style={{ width: 140 }} onClick={() => setItems((prev) => [...prev, { productId: "", quantity: 1, rate: 0 }])}>
            + Add line
          </button>
          <div>
            <button type="submit" className="btn btn-primary" style={{ width: 160 }} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Saving..." : "Send order"}
            </button>
          </div>
        </form>
      )}

      <div className="card">
        <table className="table mb-0">
          <thead>
            <tr>
              <th>Order #</th>
              <th>Supplier</th>
              <th>Branch</th>
              <th>Items</th>
              <th>Status</th>
              <th>Date</th>
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
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.orderNumber}</td>
                <td>{o.supplier.name}</td>
                <td>{o.branch.name}</td>
                <td>{o.items.length} line(s)</td>
                <td>{statusBadge(o.status)}</td>
                <td>{new Date(o.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
