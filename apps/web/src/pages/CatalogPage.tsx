import { useEffect, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { api } from "../api/client";

interface CatalogItem {
  id: string;
  name: string;
  isActive: boolean;
}

const TABS = [
  { key: "manufacturers", label: "Manufacturers", endpoint: "/manufacturers" },
  { key: "categories", label: "Categories", endpoint: "/product-categories" },
  { key: "units", label: "Units", endpoint: "/units" },
] as const;

export function CatalogPage() {
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["key"]>("manufacturers");
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const tab = TABS.find((t) => t.key === activeTab)!;

  async function load() {
    setLoading(true);
    const res = await api.get<{ data: CatalogItem[] }>(tab.endpoint);
    setItems(res.data.data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.post(tab.endpoint, { name });
      setName("");
      await load();
    } catch (err) {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to create");
    }
  }

  async function toggleActive(item: CatalogItem) {
    if (item.isActive) {
      await api.delete(`${tab.endpoint}/${item.id}`);
    } else {
      await api.put(`${tab.endpoint}/${item.id}`, { isActive: true });
    }
    await load();
  }

  return (
    <div>
      <h3 className="mb-4">Product Catalog</h3>
      <ul className="nav nav-tabs mb-3">
        {TABS.map((t) => (
          <li className="nav-item" key={t.key}>
            <button className={`nav-link ${activeTab === t.key ? "active" : ""}`} onClick={() => setActiveTab(t.key)}>
              {t.label}
            </button>
          </li>
        ))}
      </ul>

      <form className="d-flex gap-2 mb-3" onSubmit={handleCreate} style={{ maxWidth: 420 }}>
        <input className="form-control" placeholder={`New ${tab.label.slice(0, -1).toLowerCase()} name`} value={name} onChange={(e) => setName(e.target.value)} required />
        <button className="btn btn-primary" type="submit">
          Add
        </button>
      </form>
      {error && <div className="alert alert-danger py-2" style={{ maxWidth: 420 }}>{error}</div>}

      <div className="card" style={{ maxWidth: 500 }}>
        <table className="table mb-0">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={3} className="text-center text-muted py-3">
                  Loading...
                </td>
              </tr>
            )}
            {items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>
                  <span className={`badge ${item.isActive ? "text-bg-success" : "text-bg-secondary"}`}>
                    {item.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="text-end">
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => toggleActive(item)}>
                    {item.isActive ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
