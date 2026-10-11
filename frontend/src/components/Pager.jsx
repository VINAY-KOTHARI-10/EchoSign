export default function Pager({ page, totalPages, onChange }) {
  if (!totalPages || totalPages <= 1) return null;
  return (
    <div className="pager">
      <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>← Prev</button>
      <span className="muted" style={{ fontSize: 14 }}>Page {page} of {totalPages}</span>
      <button className="btn btn-outline btn-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next →</button>
    </div>
  );
}
