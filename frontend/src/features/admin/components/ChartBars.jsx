function ChartBars({ title, items }) {
  const maxValue = Math.max(...(items || []).map((item) => item.value || item.total || 0), 1);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <div className="mt-3 space-y-2">
        {(items || []).map((item) => {
          const value = item.value ?? item.total ?? 0;
          const width = Math.max((value / maxValue) * 100, 2);
          const label = item.label || item.month || "N/A";
          return (
            <div key={`${label}-${value}`}>
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>{label}</span>
                <span>{value}</span>
              </div>
              <div className="mt-1 h-2 rounded bg-slate-100">
                <div className="h-2 rounded bg-emerald-500" style={{ width: `${width}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ChartBars;
