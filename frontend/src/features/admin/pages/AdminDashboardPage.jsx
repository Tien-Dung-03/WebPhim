import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  adminBulkAction,
  adminCreateCategory,
  adminDeleteCategory,
  adminGetActivityLogs,
  adminGetAnalytics,
  adminGetCategories,
  adminGetCommentReports,
  adminGetHomepageConfig,
  adminGetMovies,
  adminGetPermissions,
  adminGetSyncJob,
  adminGetTrashMovies,
  adminReviewCommentReport,
  adminSyncMovies,
  adminUpdateCategory,
  adminUpdateHomepageConfig,
} from "../../../api/movies";
import { getUser, isLoggedIn } from "../../../authToken";
import BulkMovieTable from "../components/BulkMovieTable";
import ChartBars from "../components/ChartBars";
import StatCard from "../components/StatCard";

const TAB_CONFIG = [
  { key: "dashboard", label: "Dashboard", permission: "analytics.view" },
  { key: "movies", label: "Movies", permission: "movies.view" },
  { key: "categories", label: "Categories", permission: "categories.view" },
  { key: "reports", label: "Reports", permission: "reports.view" },
  { key: "homepage", label: "Homepage", permission: "homepage_config.view" },
  { key: "logs", label: "Activity", permission: "activity_logs.view" },
  { key: "trash", label: "Trash", permission: "movies.view" },
];

const DEFAULT_SYNC_FORM = {
  feed_type: "the-loai",
  category: "hanh-dong",
  from_page: 1,
  to_page: 5,
  delay: 0.8,
  max_movies: 0,
  skip_existing: true,
};

function AdminDashboardPage() {
  const user = getUser();
  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [authz, setAuthz] = useState({ role: "", permissions: [] });
  const [analytics, setAnalytics] = useState(null);
  const [movies, setMovies] = useState([]);
  const [trashRows, setTrashRows] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState({ name: "", slug: "", description: "" });
  const [reports, setReports] = useState([]);
  const [homepageConfig, setHomepageConfig] = useState(null);
  const [activityLogs, setActivityLogs] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncForm, setSyncForm] = useState(DEFAULT_SYNC_FORM);

  const permissionSet = useMemo(() => new Set(authz.permissions || []), [authz.permissions]);
  const hasPermission = (permissionCode) => permissionSet.has(permissionCode);

  const visibleTabs = useMemo(
    () => TAB_CONFIG.filter((item) => hasPermission(item.permission)),
    [permissionSet]
  );

  useEffect(() => {
    if (visibleTabs.length > 0 && !visibleTabs.some((item) => item.key === tab)) {
      setTab(visibleTabs[0].key);
    }
  }, [visibleTabs, tab]);

  const loadAll = async (permissions = authz.permissions || []) => {
    const can = (perm) => permissions.includes(perm);
    const [analyticsPayload, movieRows, categoryRows, reportRows, homeCfg, logsRows, trashPayload] = await Promise.all([
      can("analytics.view") ? adminGetAnalytics() : Promise.resolve(null),
      can("movies.view") ? adminGetMovies() : Promise.resolve([]),
      can("categories.view") ? adminGetCategories() : Promise.resolve([]),
      can("reports.view") ? adminGetCommentReports() : Promise.resolve([]),
      can("homepage_config.view") ? adminGetHomepageConfig() : Promise.resolve(null),
      can("activity_logs.view") ? adminGetActivityLogs() : Promise.resolve([]),
      can("movies.view") ? adminGetTrashMovies() : Promise.resolve([]),
    ]);
    setAnalytics(analyticsPayload);
    setMovies(movieRows || []);
    setCategories(categoryRows || []);
    setReports(reportRows || []);
    setHomepageConfig(homeCfg || null);
    setActivityLogs(logsRows || []);
    setTrashRows(trashPayload || []);
  };

  useEffect(() => {
    async function bootstrap() {
      setLoading(true);
      setMessage("");
      try {
        const permissionPayload = await adminGetPermissions();
        const permissionList = permissionPayload?.permissions || [];
        setAuthz({ role: permissionPayload?.role || "", permissions: permissionList });

        if (!permissionList.length) {
          setMessage("Tai khoan nay khong co quyen quan tri phim.");
          return;
        }
        await loadAll(permissionList);
      } catch {
        setMessage("Khong tai duoc du lieu admin.");
      } finally {
        setLoading(false);
      }
    }
    bootstrap();
  }, []);

  if (!isLoggedIn() || !user) return <Navigate to="/login" replace />;

  const toggleSelect = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };
  const toggleSelectAll = (checked) => {
    if (checked) setSelectedIds(movies.map((row) => row.id));
    else setSelectedIds([]);
  };

  const bulkRun = async (action) => {
    if (!selectedIds.length) return;
    const result = await adminBulkAction({ action, movie_ids: selectedIds });
    setMessage(`Bulk ${action}: ${result.affected} row(s)`);
    setSelectedIds([]);
    await loadAll();
  };

  const saveCategory = async () => {
    if (!newCategory.name || !newCategory.slug || !hasPermission("categories.manage")) return;
    await adminCreateCategory(newCategory);
    setNewCategory({ name: "", slug: "", description: "" });
    await loadAll();
  };

  const updateCategoryActive = async (category, isActive) => {
    if (!hasPermission("categories.manage")) return;
    await adminUpdateCategory({ id: category.id, is_active: isActive });
    await loadAll();
  };

  const resolveReport = async (reportId, status) => {
    if (!hasPermission("reports.manage")) return;
    await adminReviewCommentReport({ report_id: reportId, status });
    await loadAll();
  };

  const runSync = async () => {
    if (!hasPermission("sync.run")) return;
    setSyncing(true);
    setMessage("");
    try {
      const payload = {
        ...syncForm,
        from_page: Number(syncForm.from_page || 1),
        to_page: Number(syncForm.to_page || 5),
        delay: Number(syncForm.delay || 0.8),
        max_movies: Number(syncForm.max_movies || 0),
      };
      if (payload.feed_type === "phim-moi-cap-nhat") {
        payload.category = "phim-moi-cap-nhat";
      }
      const started = await adminSyncMovies(payload);
      const jobId = started?.job_id;
      if (!jobId) {
        setMessage("Khong tao duoc sync job.");
        return;
      }
      setMessage("Sync dang chay nen... vui long doi.");

      let tryCount = 0;
      while (tryCount < 300) {
        const job = await adminGetSyncJob(jobId);
        if (job?.status === "completed") {
          const summary = job.summary || {};
          setMessage(
            `Sync done: saved=${summary.saved || 0}, skipped=${summary.skipped || 0}, failed=${summary.failed || 0}, processed=${summary.processed || 0}`
          );
          await loadAll();
          return;
        }
        if (job?.status === "failed") {
          setMessage(`Sync that bai: ${job.error || "unknown error"}`);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
        tryCount += 1;
      }
      setMessage("Sync van dang chay nen. Ban co the load lai trang sau.");
    } catch (error) {
      setMessage(error?.response?.data?.detail || "Sync that bai.");
    } finally {
      setSyncing(false);
    }
  };

  const saveHomepageConfig = async () => {
    if (!hasPermission("homepage_config.manage")) return;
    await adminUpdateHomepageConfig(homepageConfig);
    setMessage("Da cap nhat homepage config.");
    await loadAll();
  };

  const stats = analytics?.stats || {};
  const charts = analytics?.charts || {};

  return (
    <section className="min-h-[70vh] rounded-2xl bg-slate-100 p-4 md:p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Movie Admin Console</h1>
            <p className="text-sm text-slate-500">
              Role: <strong>{authz.role || "none"}</strong> | Permissions: {authz.permissions.length}
            </p>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            Enterprise Mode
          </span>
        </div>
        {message && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</p>}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <nav className="space-y-2">
            {visibleTabs.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setTab(item.key);
                  setSelectedIds([]);
                }}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                  tab === item.key
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="space-y-4">
          {loading && <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Dang tai du lieu quan tri...</p>}

          {!loading && tab === "dashboard" && (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-5">
                <StatCard title="Movies" value={stats.total_movies || 0} />
                <StatCard title="Trash" value={stats.trashed_movies || 0} />
                <StatCard title="Comments" value={stats.total_comments || 0} />
                <StatCard title="Ratings" value={stats.total_ratings || 0} />
                <StatCard title="Open Reports" value={stats.open_reports || 0} />
              </div>
              <div className="grid gap-4 lg:grid-cols-3">
                <ChartBars title="Top Countries" items={charts.top_countries || []} />
                <ChartBars title="Top Genres" items={charts.top_genres || []} />
                <ChartBars title="Activity by Month" items={charts.activity_by_month || []} />
              </div>
            </div>
          )}

          {!loading && tab === "movies" && (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Movie Sync</h2>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="text-sm text-slate-600">
                  Feed type
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                    value={syncForm.feed_type}
                    onChange={(e) => setSyncForm((prev) => ({ ...prev, feed_type: e.target.value }))}
                  >
                    <option value="the-loai">Theo the loai</option>
                    <option value="phim-moi-cap-nhat">Phim moi cap nhat</option>
                  </select>
                </label>
                <label className="text-sm text-slate-600">
                  Category slug
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                    value={syncForm.category}
                    disabled={syncForm.feed_type === "phim-moi-cap-nhat"}
                    onChange={(e) => setSyncForm((prev) => ({ ...prev, category: e.target.value }))}
                    placeholder="hanh-dong, tinh-cam, ..."
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Delay (seconds)
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                    type="number"
                    step="0.1"
                    min="0.5"
                    value={syncForm.delay}
                    onChange={(e) => setSyncForm((prev) => ({ ...prev, delay: e.target.value }))}
                  />
                </label>
                <label className="text-sm text-slate-600">
                  From page
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                    type="number"
                    min="1"
                    value={syncForm.from_page}
                    onChange={(e) => setSyncForm((prev) => ({ ...prev, from_page: e.target.value }))}
                  />
                </label>
                <label className="text-sm text-slate-600">
                  To page
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                    type="number"
                    min="1"
                    value={syncForm.to_page}
                    onChange={(e) => setSyncForm((prev) => ({ ...prev, to_page: e.target.value }))}
                  />
                </label>
                <label className="text-sm text-slate-600">
                  Max movies (0 = no limit)
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900"
                    type="number"
                    min="0"
                    value={syncForm.max_movies}
                    onChange={(e) => setSyncForm((prev) => ({ ...prev, max_movies: e.target.value }))}
                  />
                </label>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={syncForm.skip_existing}
                  onChange={(e) => setSyncForm((prev) => ({ ...prev, skip_existing: e.target.checked }))}
                />
                Skip existing movies
              </label>
              <div>
                <button
                  type="button"
                  onClick={runSync}
                  disabled={!hasPermission("sync.run") || syncing}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {syncing ? "Syncing..." : "Run Sync"}
                </button>
              </div>

              <div className="h-px bg-slate-200" />
              <h2 className="text-lg font-semibold text-slate-900">Movie Bulk Actions</h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded bg-amber-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={!hasPermission("movies.bulk.soft_delete")}
                  onClick={() => bulkRun("soft_delete")}
                >
                  Soft delete
                </button>
                <button
                  type="button"
                  className="rounded bg-emerald-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={!hasPermission("movies.bulk.restore")}
                  onClick={() => bulkRun("restore")}
                >
                  Restore
                </button>
                <button
                  type="button"
                  className="rounded bg-red-600 px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={!hasPermission("movies.bulk.hard_delete")}
                  onClick={() => bulkRun("hard_delete")}
                >
                  Hard delete
                </button>
              </div>
              <BulkMovieTable rows={movies} selectedIds={selectedIds} onToggle={toggleSelect} onToggleAll={toggleSelectAll} />
            </div>
          )}

          {!loading && tab === "categories" && (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="grid gap-2 md:grid-cols-4">
                <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" placeholder="Name" value={newCategory.name} onChange={(e) => setNewCategory((p) => ({ ...p, name: e.target.value }))} />
                <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" placeholder="Slug" value={newCategory.slug} onChange={(e) => setNewCategory((p) => ({ ...p, slug: e.target.value }))} />
                <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900" placeholder="Description" value={newCategory.description} onChange={(e) => setNewCategory((p) => ({ ...p, description: e.target.value }))} />
                <button type="button" className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!hasPermission("categories.manage")} onClick={saveCategory}>Add Category</button>
              </div>
              <div className="space-y-2">
                {categories.map((category) => (
                  <div key={category.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <div>
                      <p className="font-medium text-slate-900">{category.name}</p>
                      <p className="text-xs text-slate-500">{category.slug}</p>
                    </div>
                    <div className="flex gap-2">
                      <button type="button" className="rounded bg-slate-700 px-2 py-1 text-xs text-white disabled:opacity-50" disabled={!hasPermission("categories.manage")} onClick={() => updateCategoryActive(category, !category.is_active)}>
                        {category.is_active ? "Disable" : "Enable"}
                      </button>
                      <button type="button" className="rounded bg-red-600 px-2 py-1 text-xs text-white disabled:opacity-50" disabled={!hasPermission("categories.manage")} onClick={() => adminDeleteCategory(category.id).then(() => loadAll())}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && tab === "reports" && (
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              {reports.map((report) => (
                <div key={report.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm text-slate-800">{report.comment_preview}</p>
                  <p className="mt-1 text-xs text-slate-500">Reason: {report.reason || "N/A"} | Status: {report.status}</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="rounded bg-emerald-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50" disabled={!hasPermission("reports.manage")} onClick={() => resolveReport(report.id, "reviewed")}>Mark reviewed</button>
                    <button type="button" className="rounded bg-slate-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50" disabled={!hasPermission("reports.manage")} onClick={() => resolveReport(report.id, "dismissed")}>Dismiss</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && tab === "homepage" && homepageConfig && (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                value={homepageConfig.featured_movie_slug || ""}
                onChange={(e) => setHomepageConfig((p) => ({ ...p, featured_movie_slug: e.target.value }))}
                placeholder="featured_movie_slug"
                disabled={!hasPermission("homepage_config.manage")}
              />
              <textarea
                className="h-32 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                value={JSON.stringify(homepageConfig.sections || [], null, 2)}
                onChange={(e) => {
                  try {
                    setHomepageConfig((p) => ({ ...p, sections: JSON.parse(e.target.value) }));
                  } catch {
                  }
                }}
                disabled={!hasPermission("homepage_config.manage")}
              />
              <button type="button" className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!hasPermission("homepage_config.manage")} onClick={saveHomepageConfig}>
                Save homepage config
              </button>
            </div>
          )}

          {!loading && tab === "logs" && (
            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              {activityLogs.map((log) => (
                <div key={log.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  <p><span className="font-semibold">{log.actor_name}</span> - {log.action}</p>
                  <p className="text-xs text-slate-500">{log.target_type}:{log.target_id}</p>
                </div>
              ))}
            </div>
          )}

          {!loading && tab === "trash" && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <BulkMovieTable
                rows={trashRows}
                selectedIds={selectedIds}
                onToggle={toggleSelect}
                onToggleAll={(checked) => setSelectedIds(checked ? trashRows.map((row) => row.id) : [])}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default AdminDashboardPage;
