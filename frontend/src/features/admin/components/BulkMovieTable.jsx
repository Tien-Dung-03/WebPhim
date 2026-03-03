function BulkMovieTable({ rows, selectedIds, onToggle, onToggleAll }) {
  const allSelected = rows.length > 0 && rows.every((row) => selectedIds.includes(row.id));

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-slate-200 text-sm text-slate-700">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left">
              <input type="checkbox" checked={allSelected} onChange={(e) => onToggleAll(e.target.checked)} />
            </th>
            <th className="px-3 py-2 text-left">Movie</th>
            <th className="px-3 py-2 text-left">Slug</th>
            <th className="px-3 py-2 text-left">Rating</th>
            <th className="px-3 py-2 text-left">Deleted</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-slate-50">
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(row.id)}
                  onChange={() => onToggle(row.id)}
                />
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-3">
                  <img
                    src={row.poster_url || row.thumb_url || ""}
                    alt={row.name}
                    className="h-12 w-8 rounded object-cover"
                    loading="lazy"
                  />
                  <p className="font-medium text-slate-900">{row.name}</p>
                </div>
              </td>
              <td className="px-3 py-2 text-slate-500">{row.slug}</td>
              <td className="px-3 py-2">{row.average_rating || 0}/5</td>
              <td className="px-3 py-2">
                <span
                  className={`rounded-full px-2 py-1 text-xs font-semibold ${
                    row.is_deleted ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {row.is_deleted ? "Deleted" : "Active"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default BulkMovieTable;
