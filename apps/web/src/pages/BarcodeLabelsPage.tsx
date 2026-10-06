import { useEffect, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";

interface ProductLite {
  id: string;
  sku: string;
  name: string;
  mrp: string;
  barcodes: { barcode: string }[];
}

function Label({ value, name, mrp }: { value: string; name: string; mrp: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current) {
      try {
        JsBarcode(svgRef.current, value, { format: "CODE128", width: 1.5, height: 40, displayValue: true, fontSize: 12, margin: 4 });
      } catch {
        // Invalid characters for CODE128 (rare for SKUs) — leave the SVG empty rather than crash the page.
      }
    }
  }, [value]);

  return (
    <div className="border rounded p-2 text-center" style={{ width: 220, breakInside: "avoid" }}>
      <div className="small fw-semibold text-truncate">{name}</div>
      <svg ref={svgRef}></svg>
      <div className="small">MRP: ₹{mrp}</div>
    </div>
  );
}

export function BarcodeLabelsPage() {
  const [selectedId, setSelectedId] = useState("");
  const [copies, setCopies] = useState(1);
  const [sheet, setSheet] = useState<{ value: string; name: string; mrp: string }[]>([]);

  const { data: products = [] } = useQuery({
    queryKey: ["products", "barcode-lookup"],
    queryFn: async () => (await api.get<{ data: ProductLite[] }>("/products", { params: { pageSize: 200 } })).data.data,
  });

  function addToSheet() {
    const product = products.find((p) => p.id === selectedId);
    if (!product) return;
    const barcodeValue = product.barcodes[0]?.barcode || product.sku;
    const additions = Array.from({ length: copies }, () => ({ value: barcodeValue, name: product.name, mrp: product.mrp }));
    setSheet((prev) => [...prev, ...additions]);
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2 no-print">
        <h3 className="mb-0">Barcode Labels</h3>
        <button className="btn btn-outline-secondary" onClick={() => window.print()} disabled={sheet.length === 0}>
          Print sheet
        </button>
      </div>

      <div className="card card-body mb-4 no-print">
        <div className="row g-3 align-items-end">
          <div className="col-md-6">
            <label className="form-label">Product</label>
            <select className="form-select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">Select a product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label">Copies</label>
            <input type="number" className="form-control" min={1} value={copies} onChange={(e) => setCopies(Number(e.target.value))} />
          </div>
          <div className="col-md-2">
            <button className="btn btn-primary w-100" onClick={addToSheet} disabled={!selectedId}>
              Add to sheet
            </button>
          </div>
          <div className="col-md-2">
            <button className="btn btn-outline-danger w-100" onClick={() => setSheet([])} disabled={sheet.length === 0}>
              Clear sheet
            </button>
          </div>
        </div>
      </div>

      <div className="d-flex flex-wrap gap-2">
        {sheet.length === 0 && <div className="text-muted">No labels added yet. Uses the product's own barcode if set, otherwise its SKU.</div>}
        {sheet.map((label, idx) => (
          <Label key={idx} value={label.value} name={label.name} mrp={label.mrp} />
        ))}
      </div>
    </div>
  );
}
