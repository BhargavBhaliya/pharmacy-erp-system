import { useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

interface Branch {
  id: string;
  name: string;
}
interface Suggestion {
  productId: string;
  productName: string;
  sku: string;
  branchId: string;
  currentStock: number;
  reorderLevel: number;
  suggestedQuantity: number;
  supplierId: string | null;
  supplierName: string | null;
  lastPurchaseRate: string | null;
}
interface LineDraft {
  include: boolean;
  quantity: number;
  rate: number;
}

export function ReorderSuggestionsPage() {
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, LineDraft>>({});
  const [error, setError] = useState<string | null>(null);
  const [lastCreated, setLastCreated] = useState<string | null>(null);

  const { data: branches = [] } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => (await api.get<{ data: Branch[] }>("/branches")).data.data,
  });

  useEffect(() => {
    if (!branchId && branches.length > 0) setBranchId(branches[0].id);
  }, [branches, branchId]);

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ["inventory", "reorder-suggestions", branchId],
    queryFn: async () =>
      (await api.get<{ data: Suggestion[] }>("/inventory/reorder-suggestions", { params: { branchId } })).data.data,
    enabled: !!branchId,
  });

  // Reset per-row quantity/rate drafts to the server's suggestion whenever the underlying list
  // changes (branch switch, or a PO just removed some items from the list).
  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, LineDraft> = {};
      for (const s of suggestions) {
        next[s.productId] = prev[s.productId] ?? {
          include: true,
          quantity: s.suggestedQuantity,
          rate: s.lastPurchaseRate ? Number(s.lastPurchaseRate) : 0,
        };
      }
      return next;
    });
  }, [suggestions]);

  const createOrderMutation = useMutation({
    mutationFn: (payload: { supplierId: string; supplierName: string; items: { productId: string; quantity: number; rate: number }[] }) =>
      api.post("/purchase-orders", {
        branchId,
        supplierId: payload.supplierId,
        items: payload.items.map((i) => ({ productId: i.productId, quantity: i.quantity, rate: i.rate })),
      }),
    onSuccess: (_res, payload) => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "reorder-suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      setLastCreated(`Purchase order created for ${payload.supplierName} (${payload.items.length} item(s)).`);
      setError(null);
    },
    onError: (err) => {
      setError(isAxiosError(err) ? err.response?.data?.error?.message : "Failed to create purchase order");
    },
  });

  function updateDraft(productId: string, patch: Partial<LineDraft>) {
    setDrafts((prev) => ({ ...prev, [productId]: { ...prev[productId], ...patch } }));
  }

  function handleCreateOrder(supplierId: string, supplierName: string, items: Suggestion[]) {
    setLastCreated(null);
    setError(null);
    const selected = items.filter((i) => drafts[i.productId]?.include);
    if (selected.length === 0) return;
    createOrderMutation.mutate({
      supplierId,
      supplierName,
      items: selected.map((i) => ({ productId: i.productId, quantity: drafts[i.productId].quantity, rate: drafts[i.productId].rate })),
    });
  }

  // Group by supplier because a PurchaseOrder belongs to exactly one supplier — a product with
  // no purchase history yet (never bought before) has no known supplier to suggest, so it gets
  // its own "pick a supplier manually" group instead of silently being left off the list.
  const groups = new Map<string, { supplierName: string; items: Suggestion[] }>();
  for (const s of suggestions) {
    const key = s.supplierId ?? "unknown";
    const group = groups.get(key) ?? { supplierName: s.supplierName ?? "Unknown supplier — no purchase history", items: [] };
    group.items.push(s);
    groups.set(key, group);
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="mb-0">Reorder Suggestions</h3>
        <select className="form-select" style={{ width: 220 }} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <p className="text-muted small">
        Products whose available stock has dropped to or below their reorder level. Quantity and rate are suggested
        from the most recent purchase — edit either before creating the order.
      </p>

      {lastCreated && <div className="alert alert-success py-2">{lastCreated}</div>}
      {error && <div className="alert alert-danger py-2">{error}</div>}
      {isLoading && <div className="text-muted">Loading...</div>}

      {!isLoading && suggestions.length === 0 && (
        <div className="card card-body text-center text-muted py-5">
          <div className="fs-1 mb-2">✓</div>
          Nothing needs reordering at this branch right now.
        </div>
      )}

      {Array.from(groups.entries()).map(([supplierId, group]) => (
        <div className="card mb-3" key={supplierId}>
          <div className="card-header d-flex justify-content-between align-items-center">
            <strong>{group.supplierName}</strong>
            {supplierId !== "unknown" ? (
              <button
                className="btn btn-sm btn-primary"
                disabled={createOrderMutation.isPending || group.items.every((i) => !drafts[i.productId]?.include)}
                onClick={() => handleCreateOrder(supplierId, group.supplierName, group.items)}
              >
                {createOrderMutation.isPending ? "Creating..." : "Create Purchase Order"}
              </button>
            ) : (
              <span className="small text-muted">Create a purchase order manually for these</span>
            )}
          </div>
          <table className="table table-sm mb-0">
            <thead>
              <tr>
                <th style={{ width: 36 }}></th>
                <th>Product</th>
                <th className="text-end">Current stock</th>
                <th className="text-end">Reorder level</th>
                <th className="text-end" style={{ width: 110 }}>
                  Order qty
                </th>
                <th className="text-end" style={{ width: 110 }}>
                  Rate
                </th>
              </tr>
            </thead>
            <tbody>
              {group.items.map((s) => {
                const draft = drafts[s.productId];
                if (!draft) return null;
                return (
                  <tr key={s.productId}>
                    <td>
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={draft.include}
                        onChange={(e) => updateDraft(s.productId, { include: e.target.checked })}
                      />
                    </td>
                    <td>
                      {s.productName}
                      <div className="text-muted small">{s.sku}</div>
                    </td>
                    <td className="text-end">{s.currentStock}</td>
                    <td className="text-end">{s.reorderLevel}</td>
                    <td>
                      <input
                        type="number"
                        min={1}
                        className="form-control form-control-sm text-end"
                        value={draft.quantity}
                        onChange={(e) => updateDraft(s.productId, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        step="0.01"
                        className="form-control form-control-sm text-end"
                        value={draft.rate}
                        onChange={(e) => updateDraft(s.productId, { rate: Number(e.target.value) || 0 })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
