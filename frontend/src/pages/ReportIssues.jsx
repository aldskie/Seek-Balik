import React, { useEffect, useMemo, useState } from "react";
import {
  FaBug,
  FaEye,
  FaTimes,
  FaSyncAlt,
  FaMobileAlt,
  FaUser,
  FaClock,
  FaCheckCircle,
  FaSpinner,
} from "react-icons/fa";
import { getReportIssues, updateReportIssue } from "../api/api";
import Pagination from "../components/Pagination";
import { confirmAction } from "../components/ConfirmDialog";

// Status values the backend saves: IssueReport.STATUS_CHOICES in the
// report_issue app ("open" / "in_review" / "resolved"). The page used
// "Pending" / "In Progress" / "Resolved" / "Dismissed", which the server
// rejects, so every status change failed and the counters stayed at 0.
const STATUSES = ["open", "in_review", "resolved"];
const STATUS_LABELS = {
  open: "Open",
  in_review: "In Review",
  resolved: "Resolved",
};
const PAGE_SIZE = 10;

const statusStyle = {
  open: "bg-amber-50 text-amber-700 border-amber-200",
  in_review: "bg-blue-50 text-blue-700 border-blue-200",
  resolved: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const statusLabel = (value) => STATUS_LABELS[value] || value;

// Accepts snake_case or camelCase fields from the backend.
const normalize = (r) => ({
  id: r.id ?? r._id,
  subject: r.subject ?? r.title ?? "Untitled report",
  description: r.description ?? r.message ?? "",
  // The backend sends the readable name as category_label.
  category: r.category_label ?? r.category ?? "Other",
  status: r.status ?? "open",
  screenshot: r.screenshot ?? r.screenshot_url ?? r.attachment ?? null,
  deviceInfo: r.device_info ?? r.deviceInfo ?? "",
  appVersion: r.app_version ?? r.appVersion ?? "",
  createdAt: r.created_at ?? r.createdAt ?? null,
  reporterName:
    r.reporter_name ??
    (r.user
      ? `${r.user.first_name || ""} ${r.user.last_name || ""}`.trim()
      : "") ??
    "",
  reporterEmail: r.reporter_email ?? r.user?.email ?? "",
});

// Finds the list of reports in whatever shape the server sends back:
// a plain array, an axios response ({ data: ... }), DRF pagination
// ({ results: [...] }), or the list under another name such as
// { reports: [...] } / { issues: [...] }. Before this, anything other than
// an array, data or results was read as "no reports".
const LIST_KEYS = ["results", "data", "reports", "issues", "report_issues", "items"];

const extractReports = (payload, depth = 0) => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object" || depth > 3) return null;

  for (const key of LIST_KEYS) {
    const found = extractReports(payload[key], depth + 1);
    if (found) return found;
  }

  // Last resort: the only array-valued field on the object.
  const arrays = Object.values(payload).filter(Array.isArray);
  return arrays.length === 1 ? arrays[0] : null;
};

const formatDate = (d) =>
  d
    ? new Date(d).toLocaleString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

const ReportIssues = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState(null);
  const [editStatus, setEditStatus] = useState("open");
  const [saving, setSaving] = useState(false);

  const [toast, setToast] = useState("");

  const fetchReports = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getReportIssues();
      const list = extractReports(data);

      if (!list) {
        // The server answered, but not with a list we can read. Logged so
        // the exact shape can be checked in the browser console.
        console.warn("Report Issues: unexpected response from the server:", data);
        setReports([]);
        return;
      }

      if (list.length === 0) {
        // Helps tell "the endpoint returned nothing" apart from a page bug.
        console.info("Report Issues: the server returned 0 reports. Raw response:", data);
      }

      setReports(list.filter(Boolean).map(normalize));
      // Keep the page in range after a refresh.
      setPage(1);
    } catch (err) {
      console.error("Failed to fetch reports:", err);
      // Show the server's own reason (e.g. "You do not have permission to
      // view issue reports.") so the cause is visible on the page.
      const code = err?.response?.status;
      const reason = err?.response?.data?.error || err?.response?.data?.detail;
      setError(
        reason
          ? `Failed to load reported issues: ${reason}${code ? ` (${code})` : ""}`
          : code
            ? `Failed to load reported issues (server error ${code}).`
            : "Failed to load reported issues. Check that the server is running and the API address is correct."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const counts = useMemo(() => {
    const c = { total: reports.length };
    STATUSES.forEach((s) => (c[s] = reports.filter((r) => r.status === s).length));
    return c;
  }, [reports]);

  const filtered = useMemo(
    () =>
      [...reports].sort(
        (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      ),
    [reports]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const openReport = (r) => {
    setSelected(r);
    setEditStatus(r.status);
  };

  const handleSave = async () => {
    if (!selected) return;
    if (
      !(await confirmAction({
        message: `Save this report as "${statusLabel(editStatus)}"?`,
        confirmLabel: "Save",
      }))
    ) {
      return;
    }
    setSaving(true);
    try {
      // The backend only allows the status to be changed.
      await updateReportIssue(selected.id, { status: editStatus });
      setReports((prev) =>
        prev.map((r) => (r.id === selected.id ? { ...r, status: editStatus } : r))
      );
      setSelected(null);
      showToast("Report updated successfully.");
    } catch (err) {
      console.error("Failed to update report:", err);
      const detail = err?.response?.data?.status?.[0] || err?.response?.data?.detail;
      showToast(detail ? `Failed to update report: ${detail}` : "Failed to update report.");
    } finally {
      setSaving(false);
    }
  };

  const statCards = [
    { label: "Total Reports", value: counts.total, icon: FaBug, color: "text-[#0B6FA4] bg-[#E8F4FA]" },
    { label: "Open", value: counts.open, icon: FaClock, color: "text-amber-600 bg-amber-50" },
    { label: "In Review", value: counts.in_review, icon: FaSpinner, color: "text-blue-600 bg-blue-50" },
    { label: "Resolved", value: counts.resolved, icon: FaCheckCircle, color: "text-emerald-600 bg-emerald-50" },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#154B70]">Report Issues</h1>
          <p className="text-sm text-slate-500">
            Issues and feedback submitted by users from the mobile app.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchReports}
          className="flex items-center gap-2 rounded-xl bg-[#0B648D] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#094f70]"
        >
          <FaSyncAlt className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color}`}>
              <Icon size={20} />
            </div>
            <div>
              <p className="text-sm text-slate-500">{label}</p>
              <p className="text-2xl font-bold text-slate-800">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[#F3F8FB] text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Subject</th>
                <th className="px-5 py-3">Reporter</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Date Reported</th>
                <th className="px-5 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <FaSpinner className="mx-auto mb-2 animate-spin" size={22} />
                    Loading reports...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-red-500">
                    {error}
                  </td>
                </tr>
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No reported issues found.
                  </td>
                </tr>
              ) : (
                paged.map((r) => (
                  <tr key={r.id} className="transition hover:bg-slate-50">
                    <td className="max-w-[260px] px-5 py-4">
                      <p className="truncate font-semibold text-slate-800">{r.subject}</p>
                      <p className="truncate text-xs text-slate-400">{r.description}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-700">{r.reporterName || "Unknown"}</p>
                      <p className="text-xs text-slate-400">{r.reporterEmail}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{r.category}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          statusStyle[r.status] || statusStyle.open
                        }`}
                      >
                        {statusLabel(r.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-500">
                      {formatDate(r.createdAt)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-center gap-2">
                        <button
                          type="button"
                          title="View"
                          onClick={() => openReport(r)}
                          className="rounded-lg p-2 text-[#0B6FA4] transition hover:bg-[#E8F4FA]"
                        >
                          <FaEye />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && (
          <Pagination
            currentPage={page}
            totalItems={filtered.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        )}
      </div>

      {/* View / Update Modal */}
      {selected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-6 backdrop-blur-md">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-[0_30px_80px_rgba(0,0,0,.25)]">
            <div className="flex items-start justify-between border-b border-slate-100 p-6">
              <div>
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                    statusStyle[selected.status] || statusStyle.open
                  }`}
                >
                  {statusLabel(selected.status)}
                </span>
                <h3 className="mt-3 text-xl font-bold text-[#154B70]">{selected.subject}</h3>
                <p className="text-sm text-slate-400">{selected.category}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"
              >
                <FaTimes />
              </button>
            </div>

            <div className="space-y-5 p-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                  <FaUser className="text-[#0B6FA4]" />
                  <div>
                    <p className="text-sm font-semibold text-slate-700">
                      {selected.reporterName || "Unknown"}
                    </p>
                    <p className="text-xs text-slate-400">{selected.reporterEmail}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                  <FaClock className="text-[#0B6FA4]" />
                  <p className="text-sm text-slate-600">{formatDate(selected.createdAt)}</p>
                </div>
                {(selected.deviceInfo || selected.appVersion) && (
                  <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 sm:col-span-2">
                    <FaMobileAlt className="text-[#0B6FA4]" />
                    <p className="text-sm text-slate-600">
                      {selected.deviceInfo}
                      {selected.appVersion && ` · App v${selected.appVersion}`}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold uppercase text-slate-400">Description</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {selected.description || "No description provided."}
                </p>
              </div>

              {selected.screenshot && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-slate-400">Screenshot</p>
                  <a href={selected.screenshot} target="_blank" rel="noreferrer">
                    <img
                      src={selected.screenshot}
                      alt="Reported issue screenshot"
                      className="max-h-80 rounded-xl border border-slate-200 object-contain"
                    />
                  </a>
                </div>
              )}

              <div className="grid gap-4 border-t border-slate-100 pt-5">
                <label className="text-sm font-semibold text-slate-600">
                  Update Status
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-[#0B6FA4]"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 p-6">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-xl border border-[#0B648D] px-5 py-2.5 text-sm font-semibold text-[#0B648D] transition hover:bg-blue-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="rounded-xl bg-[#0B648D] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#094f70] disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[110] rounded-xl bg-[#154B70] px-5 py-3 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
};

export default ReportIssues;