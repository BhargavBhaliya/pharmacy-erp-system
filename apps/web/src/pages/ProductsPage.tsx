import { useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

interface LookupItem {
  id: string;
  name: string;
}
interface Product {
  id: string;
  sku: string;
  name: string;
  genericName?: string | null;
  mrp: string;
  sellingPrice: string;
  reorderLevel: number;
  isActive: boolean;
  manufacturer?: { name: string } | null;
  category?: { name: string } | null;
  unit?: { name: string } | null;
}

const emptyForm = {
  sku: "",
  name: "",
  genericName: "",
  manufacturerId: "",
  categoryId: "",
  unitId: "",
  hsnCode: "",
  gstRatePercent: 0,
  mrp: 0,
  purchasePrice: 0,
  sellingPrice: 0,
  reorderLevel: 0,
  requiresPrescription: false,
};
const emptyBarcodes: string[] = [];

export function ProductsPage() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [barcodes, setBarcodes] = useState<string[]>(emptyBarcodes);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", search],
    queryFn: async () => (await api.get<{ data: Product[] }>("/products", { params: search ? { search } : {} })).data.data,
  });

  const { data: manufacturers = [] } = useQuery({
    queryKey: ["manufacturers"],
    queryFn: async () => (await api.get<{ data: LookupItem[] }>("/manufacturers")).data.data,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["product-categories"],
    queryFn: async () => (await api.get<{ data: LookupItem[] }>("/product-categories")).data.data,
  });

  const { data: units = [] } = useQuery({
    queryKey: ["units"],
    queryFn: async () => (await api.get<{ data: LookupItem[] }>("/units")).data.data,
  });

  const createMutation = useMutation({
    mutationFn: (payload: Omit<typeof emptyForm, "manufacturerId" | "categoryId" | "unitId"> & {
      manufacturerId?: string;
      categoryId?: string;
      unitId?: string;
      barcodes: string[];
    }) => api.post("/products", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setShowForm(false);
      setForm(emptyForm);
      setBarcodes(emptyBarcodes);
      setBarcodeInput("");
      setError(null);
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to create product");
    },
  });

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      manufacturerId: form.manufacturerId || undefined,
      categoryId: form.categoryId || undefined,
      unitId: form.unitId || undefined,
      barcodes,
    };
    createMutation.mutate(payload);
  }

  function addBarcode(code: string) {
    const trimmed = code.trim();
    if (!trimmed || barcodes.includes(trimmed)) return;
    setBarcodes((prev) => [...prev, trimmed]);
    setBarcodeInput("");
  }

  function handleBarcodeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addBarcode(barcodeInput);
    }
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="mb-0">Products</h3>
        {hasPermission("products", "add") && (
          <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "Add product"}
          </button>
        )}
      </div>

      <form
        className="d-flex gap-2 mb-3"
        style={{ maxWidth: 420 }}
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(searchInput);
        }}
      >
        <input className="form-control" placeholder="Search name, SKU, generic, barcode..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
        <button className="btn btn-outline-secondary" type="submit">
          Search
        </button>
      </form>

      {showForm && (
        <form className="card card-body mb-4" onSubmit={handleCreate}>
          {error && <div className="alert alert-danger py-2">{error}</div>}
          <div className="row g-3">
            <div className="col-md-3">
              <label className="form-label">SKU</label>
              <input className="form-control" required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </div>
            <div className="col-md-5">
              <label className="form-label">Product name</label>
              <input className="form-control" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="col-md-4">
              <label className="form-label">Generic name</label>
              <input className="form-control" value={form.genericName} onChange={(e) => setForm({ ...form, genericName: e.target.value })} />
            </div>

            <div className="col-md-4">
              <label className="form-label">Manufacturer</label>
              <select className="form-select" value={form.manufacturerId} onChange={(e) => setForm({ ...form, manufacturerId: e.target.value })}>
                <option value="">—</option>
                {manufacturers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">Category</label>
              <select className="form-select" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label">Unit</label>
              <select className="form-select" value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })}>
                <option value="">—</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-3">
              <label className="form-label">HSN code</label>
              <input className="form-control" value={form.hsnCode} onChange={(e) => setForm({ ...form, hsnCode: e.target.value })} />
            </div>
            <div className="col-md-2">
              <label className="form-label">GST %</label>
              <input type="number" className="form-control" value={form.gstRatePercent} onChange={(e) => setForm({ ...form, gstRatePercent: Number(e.target.value) })} />
            </div>
            <div className="col-md-2">
              <label className="form-label">MRP</label>
              <input type="number" step="0.01" className="form-control" required value={form.mrp} onChange={(e) => setForm({ ...form, mrp: Number(e.target.value) })} />
            </div>
            <div className="col-md-2">
              <label className="form-label">Purchase price</label>
              <input type="number" step="0.01" className="form-control" required value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) })} />
            </div>
            <div className="col-md-2">
              <label className="form-label">Selling price</label>
              <input type="number" step="0.01" className="form-control" required value={form.sellingPrice} onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) })} />
            </div>
            <div className="col-md-1">
              <label className="form-label">Reorder</label>
              <input type="number" className="form-control" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: Number(e.target.value) })} />
            </div>

            <div className="col-12">
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="requiresRx"
                  checked={form.requiresPrescription}
                  onChange={(e) => setForm({ ...form, requiresPrescription: e.target.checked })}
                />
                <label className="form-check-label" htmlFor="requiresRx">
                  Requires prescription
                </label>
              </div>
            </div>

            <div className="col-12">
              <label className="form-label">Barcode(s)</label>
              <div className="d-flex gap-2 mb-2">
                <input
                  className="form-control"
                  placeholder="Scan barcode here, or type and press Enter / Add"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={handleBarcodeKeyDown}
                />
                <button type="button" className="btn btn-outline-secondary" onClick={() => addBarcode(barcodeInput)} disabled={!barcodeInput.trim()}>
                  Add
                </button>
              </div>
              {barcodes.length === 0 ? (
                <div className="text-muted small">
                  No barcode scanned yet — product can still be saved, but won't be found by barcode scan until one is added here or later on the product's edit screen.
                </div>
              ) : (
                <div className="d-flex gap-2 flex-wrap">
                  {barcodes.map((code) => (
                    <span key={code} className="badge text-bg-light border d-flex align-items-center gap-2">
                      {code}
                      <button
                        type="button"
                        className="btn-close"
                        style={{ fontSize: 10 }}
                        onClick={() => setBarcodes((prev) => prev.filter((c) => c !== code))}
                      ></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button type="submit" className="btn btn-primary mt-3" style={{ width: 160 }} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Saving..." : "Save product"}
          </button>
        </form>
      )}

      <div className="card">
        <table className="table mb-0">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Manufacturer</th>
              <th>MRP</th>
              <th>Selling price</th>
              <th>Reorder level</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="text-center text-muted py-4">
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && products.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-muted py-4">
                  No products found.
                </td>
              </tr>
            )}
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.sku}</td>
                <td>
                  {p.name}
                  {p.genericName && <div className="text-muted small">{p.genericName}</div>}
                </td>
                <td>{p.manufacturer?.name ?? "—"}</td>
                <td>₹{p.mrp}</td>
                <td>₹{p.sellingPrice}</td>
                <td>{p.reorderLevel}</td>
                <td>
                  <span className={`badge ${p.isActive ? "text-bg-success" : "text-bg-secondary"}`}>{p.isActive ? "Active" : "Inactive"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
