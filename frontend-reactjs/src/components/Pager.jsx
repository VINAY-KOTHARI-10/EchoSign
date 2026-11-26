export default function Pager({ page, totalPages, onChange }) {
  if (!totalPages || totalPages <= 1) return null;
  // Layout with Tailwind utilities (prefix tw-): a row, centred, with a gap; stacked on very small screens.
  return (
    <div className="tw-mt-4 tw-flex tw-flex-col tw-items-center tw-justify-center tw-gap-3 xs:tw-flex-row">
      <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>← Prev</button>
      <span className="muted" style={{ fontSize: 14 }}>Page {page} of {totalPages}</span>
      <button className="btn btn-outline btn-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next →</button>
    </div>
  );
}
