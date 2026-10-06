// Google-style numbered pagination: Prev, numbered pages with "..." for gaps, Next.
// Always shows the first and last page, plus a window of pages around the current one.
// Renders even for a single page (just "1") so the control is visibly there, not silently
// hidden — it's easy to otherwise think pagination "isn't working" when there's little data.
export function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const pages: (number | "...")[] = [1];
  if (totalPages > 1) {
    const windowStart = Math.max(2, page - 2);
    const windowEnd = Math.min(totalPages - 1, page + 2);
    if (windowStart > 2) pages.push("...");
    for (let p = windowStart; p <= windowEnd; p++) pages.push(p);
    if (windowEnd < totalPages - 1) pages.push("...");
    pages.push(totalPages);
  }

  return (
    <nav className="d-flex justify-content-center align-items-center gap-2 mt-3">
      <ul className="pagination mb-0">
        <li className={`page-item ${page <= 1 ? "disabled" : ""}`}>
          <button className="page-link" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
            Prev
          </button>
        </li>
        {pages.map((p, idx) =>
          p === "..." ? (
            <li key={`ellipsis-${idx}`} className="page-item disabled">
              <span className="page-link">…</span>
            </li>
          ) : (
            <li key={p} className={`page-item ${p === page ? "active" : ""}`}>
              <button className="page-link" onClick={() => onPageChange(p)}>
                {p}
              </button>
            </li>
          )
        )}
        <li className={`page-item ${page >= totalPages ? "disabled" : ""}`}>
          <button className="page-link" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
            Next
          </button>
        </li>
      </ul>
      <select
        className="form-select form-select-sm"
        style={{ width: "auto" }}
        value={page}
        onChange={(e) => onPageChange(Number(e.target.value))}
        aria-label="Jump to page"
      >
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
          <option key={p} value={p}>
            Page {p}
          </option>
        ))}
      </select>
    </nav>
  );
}
