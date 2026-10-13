import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FaAward,
  FaExclamationTriangle,
  FaCheckCircle,
  FaMapMarkerAlt,
  FaPrint,
  FaFilter,
  FaTimes,
  FaInbox,
  FaChevronDown,
  FaCalendarAlt
} from "react-icons/fa";
import { getItems, getLeaderboardSettings } from "../api/api";
import ComparativeReport, {
  buildComparison,
  COMPARISON_MODES
} from "../components/ComparativeReport";
import saoLogo from "../assets/sao.png";
import slcLogo from "../assets/slc-logo.png";
import seekBalikLogo from "../assets/seek-balik-logo.jpg";

const SCHOOL_NAME = "Saint Louis College";
const SCHOOL_ADDRESS = "City of San Fernando, La Union";

// ================= HELPERS =================

// Whole-number percent. Never rounds up to 100% unless it really is all of
// them (199 of 200 used to show "100%").
const pct = (a, b) => {
  if (b === 0) return 0;
  const value = Math.round((a / b) * 100);
  return value === 100 && a < b ? 99 : value;
};

const riskLevel = (lost) =>
  lost >= 15 ? "High Risk" : lost >= 8 ? "Medium Risk" : "Low Risk";

const riskColor = (risk) =>
  risk.startsWith("High")
    ? "bg-rose-50 text-rose-600 border border-rose-100"
    : risk.startsWith("Medium")
    ? "bg-amber-50 text-amber-600 border border-amber-100"
    : "bg-emerald-50 text-emerald-600 border border-emerald-100";

const EMPTY_FILTERS = {
  locations: [],
  categories: [],
  statuses: [],
  types: [],
  dateRange: { start: "", end: "" }
};

// ─── Reference lists ────────────────────────────────────────────────────────
// These are the EXACT values the LostItems.jsx / FoundItems.jsx forms submit,
// so records match by plain (case-insensitive) comparison — no alias maps
// needed. If a form's dropdown changes, update the matching list here.

// Same list as the AREAS dropdown in LostItems.jsx / FoundItems.jsx.
// "Others" is the catch-all: any location not on this list (custom text typed
// under "Others", or old free-text values) is counted under it.
const AREAS_REFERENCE = [
  'Grandstand',
  'Verbist Building',
  'Chapel',
  'Administrative Building (Main Building)',
  'Library',
  'Gymnasium',
  'ICT Center',
  'New Building (CEA Building)',
  'New Elementary Building',
  'SLC Canteen',
  'Old Elementary Building',
  'Conrado Dela Cruz Sports Center (CDC)',
  'Senior High School Department Building',
  'HM Laboratory Building',
  'Student Affairs Office Lobby',
  'Others'
];

// Same list as CATS in LostItems.jsx / FoundItems.jsx. Retired categories
// (e.g. "Personal", "Valuables") no longer exist, so they are not listed and
// are left out of the Category filter and the Item Categories breakdown.
const CATEGORIES_REFERENCE = [
  'Accessories', 'ID', 'Academic Materials', 'Bags & Wallets', 'Clothing', 'Electronic', 'Keys'
];

// Item status lifecycle. Used to keep the Status filter, chart and summary in
// a sensible order (Pending → Approved → Claimed → Archived → Declined).
const STATUS_REFERENCE = ['Pending', 'Approved', 'Claimed', 'Archived', 'Declined'];

// The only two item types: LostItems.jsx saves "Lost", FoundItems.jsx saves
// "Surrendered".
const TYPES_REFERENCE = ['Lost', 'Surrendered'];

// Case/whitespace-insensitive match against a reference list.
// Returns the canonical value, or null when there is no match.
const matchReference = (raw, referenceList) => {
  const lower = String(raw || '').trim().toLowerCase();
  if (!lower) return null;
  return referenceList.find((ref) => ref.toLowerCase() === lower) || null;
};

// Older public reports saved "SAO Lobby"; count them with the lobby.
const LOCATION_ALIASES = { 'sao lobby': 'Student Affairs Office Lobby' };
const normalizeLocation = (raw) =>
  matchReference(raw, AREAS_REFERENCE) ||
  LOCATION_ALIASES[String(raw || '').trim().toLowerCase()] ||
  'Others';
const normalizeCategory = (raw) => matchReference(raw, CATEGORIES_REFERENCE); // null = not a current category
const normalizeStatus = (raw) => matchReference(raw, STATUS_REFERENCE) || String(raw || '').trim();
const normalizeType = (raw) => matchReference(raw, TYPES_REFERENCE) || String(raw || '').trim();

// LostItems.jsx can store several areas in one comma-separated string
// (e.g. "Library, Chapel"). Returns each area normalized and de-duplicated,
// so a report with 3 areas counts once in each of them.
const splitLocations = (raw) => {
  const parts = String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(parts.map(normalizeLocation))];
};

// Sorts already-normalized values into the order of a reference list, with
// anything not found pushed to the end instead of being dropped.
function sortByReference(values, referenceList) {
  return [...values].sort((a, b) => {
    const ia = referenceList.indexOf(a);
    const ib = referenceList.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

// ================= STAT CARD =================

const StatCard = ({ label, count, icon: Icon, color, bgColor, description }) => (
  <div className="bg-white p-6 rounded-2xl border border-slate-200/70 shadow-sm hover:shadow-md transition-shadow print:shadow-none h-full flex flex-col justify-between">
    <div className="flex justify-between items-start">
      <div className="min-w-0">
        <p className="text-[10px] uppercase font-black text-slate-400 tracking-wider">
          {label}
        </p>
        <h3 className="text-3xl font-black text-slate-800 mt-1 truncate">
          {count}
        </h3>
      </div>

      <div className={`${bgColor} ${color} p-3 rounded-xl shrink-0`}>
        <Icon size={18} />
      </div>
    </div>

    <p className="mt-4 text-xs text-slate-400">{description}</p>
  </div>
);

// ================= DONUT =================

const Donut = ({ value, label, color = "#2D366D" }) => {
  const radius = 55;
  const circumference = 2 * Math.PI * radius;
  const progress = (value / 100) * circumference;

  return (
    <svg width="160" height="160">
      <circle cx="80" cy="80" r={radius} stroke="#E2E8F0" strokeWidth="16" fill="none" />

      <circle
        cx="80"
        cy="80"
        r={radius}
        stroke={color}
        strokeWidth="16"
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${progress} ${circumference}`}
        transform="rotate(-90 80 80)"
        style={{ transition: "stroke-dasharray 0.4s ease" }}
      />

      <text x="80" y="76" textAnchor="middle" fontSize="26" fontWeight="900" fill="#1E254E">
        {value}%
      </text>

      <text x="80" y="96" textAnchor="middle" fontSize="9" fontWeight="800" fill="#94A3B8" letterSpacing="1">
        {label}
      </text>
    </svg>
  );
};

// ================= HORIZONTAL BAR =================

// Two-segment bar used by the Item Categories panel — splits each category's
// total into its Lost vs Found (Surrendered) portion.
const StackedHBar = ({ lost, found, total }) => (
  <div className="h-3 bg-slate-100 rounded-full overflow-hidden flex">
    <div
      className="h-full bg-rose-400 transition-all duration-300"
      style={{ width: `${total ? (lost / total) * 100 : 0}%` }}
    />
    <div
      className="h-full bg-emerald-400 transition-all duration-300"
      style={{ width: `${total ? (found / total) * 100 : 0}%` }}
    />
  </div>
);

const BAR_PALETTE = ["#2D366D", "#4F5FA8", "#7C88C9", "#B7BEE4", "#E08B4F", "#3FAE8A"];

const BarChart = ({ data }) => {
  const max = Math.max(...data.map((x) => x.value), 1);

  if (data.length === 0) {
    return <EmptyState message="No data for the current filters" />;
  }

  return (
    <div className="space-y-4">
      {data.map((item, index) => (
        <div key={index}>
          <div className="flex justify-between text-xs font-bold mb-2 text-slate-600">
            <span>{item.label}</span>
            <span>{item.value}</span>
          </div>

          <div className="h-4 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${(item.value / max) * 100}%`,
                background: BAR_PALETTE[index % BAR_PALETTE.length]
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

// ================= EMPTY STATE =================

const EmptyState = ({ message = "No records match these filters" }) => (
  <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-300">
    <FaInbox size={28} />
    <p className="text-xs font-bold text-slate-400">{message}</p>
  </div>
);

// ================= SECTION WRAPPER =================

const Section = ({ title, className = "", children }) => (
  <div className={`bg-white rounded-2xl p-7 border border-slate-200/70 print-section flex flex-col justify-between ${className}`}>
    <h2 className="font-black uppercase text-sm tracking-widest text-slate-700 mb-7">
      {title}
    </h2>
    <div className="flex-1">{children}</div>
  </div>
);

// ================= SUMMARY REPORT (PRINT-ONLY) =================
// This is what actually gets printed / exported when "Print Report" is
// pressed. It's a plain, formal written summary of the filtered data —
// not the dashboard cards/charts.

const SummaryReport = ({
  totalItems,
  lostItems,
  surrendered,
  claimed,
  recoveredLost = [],
  releasedFound = [],
  recoveryRate,
  areaStats,
  catStats,
  statusStats = [],
  declinedLeftOut = 0,
  topHotspot,
  activeChips,
  filters,
  comparativeRows = [],
  comparativeMode = "monthly"
}) => {
  const now = new Date();
  const generatedOn = `${now.toLocaleDateString()} ${now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  })}`;



  const periodLabel =
    filters.dateRange.start && filters.dateRange.end
      ? `${filters.dateRange.start} to ${filters.dateRange.end}`
      : filters.dateRange.start
      ? `From ${filters.dateRange.start}`
      : filters.dateRange.end
      ? `Up to ${filters.dateRange.end}`
      : "All available records";

  return (
    <div className="summary-report">
      <div className="sr-letterhead">
        <div className="sr-letterhead-logos-left">
          <img src={saoLogo} alt="Student Affairs Office seal" className="sr-logo" />
          <img src={slcLogo} alt={`${SCHOOL_NAME} seal`} className="sr-logo" />
        </div>
        <div className="sr-letterhead-text">
          <p className="sr-school-name">{SCHOOL_NAME}</p>
          <p className="sr-school-address">{SCHOOL_ADDRESS}</p>
          <p className="sr-office-label">Student Affairs Office</p>
        </div>
        <div className="sr-letterhead-logos-right">
          <img src={seekBalikLogo} alt="Seek &amp; Balik logo" className="sr-logo-brand" />
        </div>
      </div>

      <div className="sr-brandbar">
        <p className="sr-brand-name">Seek &amp; Balik</p>
        <p className="sr-brand-tagline">A Lost and Found Management System</p>
      </div>

      <h1 className="sr-title">Lost &amp; Found Statistical Summary Report</h1>

      <table className="sr-meta">
        <tbody>
          <tr>
            <td>Generated</td>
            <td>{generatedOn}</td>
          </tr>
          <tr>
            <td>Reporting Period</td>
            <td>{periodLabel}</td>
          </tr>
          {activeChips.length > 0 && (
            <tr>
              <td>Filters Applied</td>
              <td>{activeChips.map((c) => c.label).join("; ")}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Every section is a table (no paragraphs), so the printout reads
          like a form. Sections stay together across page breaks. */}
      <div className="sr-keep">
        <h2 className="sr-heading">1. Summary</h2>
        <table className="sr-table">
          <thead>
            <tr>
              <th>Measure</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Total Item Records</td><td>{totalItems}</td></tr>
            <tr><td>Lost Items Reported</td><td>{lostItems.length}</td></tr>
            <tr><td>Surrendered Items</td><td>{surrendered.length}</td></tr>
            <tr><td>Claimed Items (total)</td><td>{claimed.length}</td></tr>
            <tr><td>&nbsp;&nbsp;Lost Reports Recovered</td><td>{recoveredLost.length}</td></tr>
            <tr><td>&nbsp;&nbsp;Surrendered Items Released to Owners</td><td>{releasedFound.length}</td></tr>
            <tr><td>Recovery Rate</td><td>{recoveryRate}%</td></tr>
            <tr><td>Top Hotspot</td><td>{topHotspot}</td></tr>
            {declinedLeftOut > 0 && (
              <tr><td>Declined Reports (not counted above)</td><td>{declinedLeftOut}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="sr-keep">
        <h2 className="sr-heading">2. Location Risk Analysis</h2>
        <table className="sr-table">
          <thead>
            <tr>
              <th>Location</th>
              <th>Lost</th>
              <th>Surrendered</th>
              <th>Recovered</th>
              <th>Rate</th>
              <th>Risk</th>
            </tr>
          </thead>
          <tbody>
            {areaStats.length === 0 ? (
              <tr><td colSpan={6}>No location data for the current filters.</td></tr>
            ) : (
              areaStats.map((area, index) => (
                <tr key={index}>
                  <td>{area.area}</td>
                  <td>{area.lost}</td>
                  <td>{area.surrendered}</td>
                  <td>{area.recovered}</td>
                  <td>{pct(area.recovered, area.lost)}%</td>
                  <td>{riskLevel(area.lost)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="sr-keep">
        <h2 className="sr-heading">3. Category Breakdown</h2>
        <table className="sr-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Lost</th>
              <th>Surrendered</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {catStats.length === 0 ? (
              <tr><td colSpan={4}>No category data for the current filters.</td></tr>
            ) : (
              catStats.map((cat, index) => (
                <tr key={index}>
                  <td>{cat.cat}</td>
                  <td>{cat.lost}</td>
                  <td>{cat.surrendered}</td>
                  <td>{cat.count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* The status breakdown was passed in but never printed. */}
      <div className="sr-keep">
        <h2 className="sr-heading">4. Status Breakdown</h2>
        <table className="sr-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Items</th>
            </tr>
          </thead>
          <tbody>
            {statusStats.length === 0 ? (
              <tr><td colSpan={2}>No status data for the current filters.</td></tr>
            ) : (
              statusStats.map((st) => (
                <tr key={st.label}>
                  <td>{st.label}</td>
                  <td>{st.value}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {comparativeRows.length > 0 && (
        <div className="sr-keep">
          <h2 className="sr-heading">
            5. Lost vs Surrendered Comparison (
            {(COMPARISON_MODES.find((m) => m.key === comparativeMode) || {}).label})
          </h2>
          <table className="sr-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Lost Items</th>
                <th>Surrendered Items</th>
              </tr>
            </thead>
            <tbody>
              {[...comparativeRows].reverse().map((r) => (
                <tr key={r.key}>
                  <td>{r.label}{r.current ? " (so far)" : ""}</td>
                  <td>{r.lost}</td>
                  <td>{r.found}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="sr-footer">
        This report was generated automatically by the Lost &amp; Found Management System on {generatedOn}.
      </p>
    </div>
  );
};

// ================= MULTI-SELECT DROPDOWN =================

const MultiSelectDropdown = ({ label, options, selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const toggleOption = (opt) => {
    if (selected.includes(opt)) {
      onChange(selected.filter((o) => o !== opt));
    } else {
      onChange([...selected, opt]);
    }
  };

  const displayLabel =
    selected.length === 0
      ? "All"
      : selected.length === 1
      ? selected[0]
      : `${selected.length} selected`;

  return (
    <div className="relative flex-1 min-w-[150px]" ref={ref}>
      <label className="text-xs font-bold text-slate-500">{label}</label>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="
          w-full mt-1 flex items-center justify-between gap-2
          bg-white border border-slate-200 rounded-xl
          px-3 py-2 text-sm font-bold text-slate-700
          hover:border-slate-300
          focus:outline-none focus:ring-2 focus:ring-[#2D366D]/30
        "
      >
        <span className="truncate">{displayLabel}</span>
        <FaChevronDown
          size={10}
          className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className="
            absolute z-20 mt-2 w-52
            bg-white border border-slate-200 rounded-xl shadow-lg
            p-2 max-h-60 overflow-y-auto
          "
        >
          {options.length === 0 ? (
            <p className="text-xs font-bold text-slate-400 px-2 py-1.5">No options</p>
          ) : (
            options.map((opt) => (
              <label
                key={opt}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-sm font-bold text-slate-600"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggleOption(opt)}
                  className="accent-[#2D366D] w-3.5 h-3.5"
                />
                {opt}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// ================= DATE RANGE PICKER =================

const DATE_PRESETS = [
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "last30", label: "Last 30 Days" },
  { key: "year", label: "This Year" }
];

const toISODate = (d) => {
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().split("T")[0];
};

const DateRangePicker = ({ range, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const applyPreset = (key) => {
    const today = new Date();
    let start;
    let end;

    if (key === "week") {
      // Monday to Sunday, the same week the public board and the
      // comparison chart use.
      start = new Date(today);
      start.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      end = new Date(start);
      end.setDate(start.getDate() + 6);
    } else if (key === "month") {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (key === "last30") {
      // Today and the 29 days before it (it used to cover 31 days).
      end = today;
      start = new Date(today);
      start.setDate(today.getDate() - 29);
    } else if (key === "year") {
      start = new Date(today.getFullYear(), 0, 1);
      end = new Date(today.getFullYear(), 11, 31);
    }

    onChange({ start: toISODate(start), end: toISODate(end) });
  };

  const displayLabel =
    range.start && range.end
      ? `${range.start} → ${range.end}`
      : range.start
      ? `From ${range.start}`
      : range.end
      ? `Until ${range.end}`
      : "All dates";

  return (
    <div className="relative flex-1 min-w-[200px]" ref={ref}>
      <label className="text-xs font-bold text-slate-500">Date Range</label>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="
          w-full mt-1 flex items-center justify-between gap-2
          bg-white border border-slate-200 rounded-xl
          px-3 py-2 text-sm font-bold text-slate-700
          hover:border-slate-300
          focus:outline-none focus:ring-2 focus:ring-[#2D366D]/30
        "
      >
        <span className="truncate flex items-center gap-2 min-w-0">
          <FaCalendarAlt size={12} className="text-slate-400 shrink-0" />
          <span className="truncate">{displayLabel}</span>
        </span>
        <FaChevronDown
          size={10}
          className={`text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          className="
            absolute z-20 mt-2 w-72
            bg-white border border-slate-200 rounded-xl shadow-lg
            p-4
          "
        >
          <div className="flex flex-wrap gap-2 mb-4">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key)}
                className="text-[11px] font-black uppercase tracking-wide bg-slate-50 hover:bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">From</label>
              <input
                type="date"
                value={range.start}
                max={range.end || undefined}
                onChange={(e) => onChange({ ...range, start: e.target.value })}
                className="
                  w-full mt-1 bg-slate-50 border border-slate-200 rounded-lg
                  px-2 py-1.5 text-xs font-bold text-slate-700
                  focus:outline-none focus:ring-2 focus:ring-[#2D366D]/30
                "
              />
            </div>

            <div className="flex-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">To</label>
              <input
                type="date"
                value={range.end}
                min={range.start || undefined}
                onChange={(e) => onChange({ ...range, end: e.target.value })}
                className="
                  w-full mt-1 bg-slate-50 border border-slate-200 rounded-lg
                  px-2 py-1.5 text-xs font-bold text-slate-700
                  focus:outline-none focus:ring-2 focus:ring-[#2D366D]/30
                "
              />
            </div>
          </div>

          {(range.start || range.end) && (
            <button
              type="button"
              onClick={() => onChange({ start: "", end: "" })}
              className="mt-3 text-[11px] font-black text-rose-500 hover:text-rose-600"
            >
              Clear dates
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ================= FILTER BAR =================

const FilterBar = ({ filters, setFilters, options, activeCount, onReset, onPrint }) => (
  <div className="bg-white rounded-2xl px-6 py-4 border border-slate-200/70 print-section w-full">
    <div className="flex flex-wrap items-end gap-4 w-full">
      <div className="flex items-center gap-2 text-slate-400 pb-2.5 shrink-0">
        <FaFilter size={14} />
      </div>

      <div className="flex flex-1 flex-wrap items-end gap-4 min-w-0">
        <MultiSelectDropdown
          label="Location"
          options={options.locations}
          selected={filters.locations}
          onChange={(v) => setFilters((f) => ({ ...f, locations: v }))}
        />

        <MultiSelectDropdown
          label="Category"
          options={options.categories}
          selected={filters.categories}
          onChange={(v) => setFilters((f) => ({ ...f, categories: v }))}
        />

        <MultiSelectDropdown
          label="Status"
          options={options.statuses}
          selected={filters.statuses}
          onChange={(v) => setFilters((f) => ({ ...f, statuses: v }))}
        />

        <MultiSelectDropdown
          label="Item Type"
          options={options.types}
          selected={filters.types}
          onChange={(v) => setFilters((f) => ({ ...f, types: v }))}
        />

        <DateRangePicker
          range={filters.dateRange}
          onChange={(v) => setFilters((f) => ({ ...f, dateRange: v }))}
        />
      </div>

      <div className="flex items-center gap-4 ml-auto shrink-0 no-print">
        {activeCount > 0 && (
          <button
            onClick={onReset}
            className="flex items-center gap-1 text-xs font-black text-rose-500 hover:text-rose-600 pb-2.5"
          >
            <FaTimes size={10} />
            Clear ({activeCount})
          </button>
        )}

        <button
          onClick={onPrint}
          className="
            flex items-center gap-2
            bg-[#2D366D] text-white
            px-5 py-2.5 rounded-xl
            font-black text-sm
            hover:opacity-90 transition-opacity
            shrink-0
          "
        >
          <FaPrint size={15} />
          Print Report
        </button>
      </div>
    </div>
  </div>
);

// ================= MAIN =================

export default function Reports() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  // Lost vs Found comparison period: weekly / monthly / semestral / yearly.
  const [compareMode, setCompareMode] = useState("monthly");
  // Semester months from Leaderboard Control, for the Semestral comparison.
  const [semConfig, setSemConfig] = useState(null);

  useEffect(() => {
    getLeaderboardSettings()
      .then((data) => setSemConfig(data?.semConfig || null))
      .catch(() => setSemConfig(null));
  }, []);

  // ─── Real-time data ────────────────────────────────────────────────────
  // getItems() is the same endpoint FoundItems.jsx and LostItems.jsx poll,
  // and it returns BOTH item types together (type "Lost" from LostItems.jsx,
  // type "Surrendered" from FoundItems.jsx). Polled every 3s to match those
  // pages, so a new report/turn-in shows up here without a manual refresh.
  useEffect(() => {
    async function fetchItems() {
      try {
        const data = await getItems();
        setItems(Array.isArray(data) ? data : data?.results || []);
      } catch (error) {
        console.log("Reports fetch error:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchItems();

    const interval = setInterval(() => {
      fetchItems();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // ================= DATE HELPERS =================

  // LostItems.jsx and FoundItems.jsx both save the date as `created_date`.
  const getItemDate = (item) => {
    const raw = item.created_date || item.date || item.dateReported || item.createdAt;
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  };

  // ================= FILTER OPTIONS =================

  const filterOptions = useMemo(() => {
    const locationSet = new Set();
    const categorySet = new Set();
    // Always list the full status lifecycle (Pending, Approved, Claimed,
    // Archived, Declined), plus any other status found in the data,
    // so the filter doesn't depend on which statuses happen to exist right now.
    const statusSet = new Set(STATUS_REFERENCE);

    items.forEach((i) => {
      splitLocations(i.location).forEach((l) => locationSet.add(l));

      const cat = normalizeCategory(i.category);
      if (cat) categorySet.add(cat);

      const status = normalizeStatus(i.status);
      if (status) statusSet.add(status);
    });

    return {
      locations: sortByReference([...locationSet], AREAS_REFERENCE),
      categories: sortByReference([...categorySet], CATEGORIES_REFERENCE),
      statuses: sortByReference([...statusSet], STATUS_REFERENCE),
      types: TYPES_REFERENCE
    };
  }, [items]);

  const activeFilterCount =
    filters.locations.length +
    filters.categories.length +
    filters.statuses.length +
    filters.types.length +
    (filters.dateRange.start || filters.dateRange.end ? 1 : 0);

  const resetFilters = () => setFilters(EMPTY_FILTERS);

  // ================= FILTERED DATA =================

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (
        filters.locations.length &&
        !splitLocations(item.location).some((l) => filters.locations.includes(l))
      )
        return false;

      if (filters.categories.length && !filters.categories.includes(normalizeCategory(item.category)))
        return false;

      if (filters.statuses.length && !filters.statuses.includes(normalizeStatus(item.status)))
        return false;

      if (filters.types.length && !filters.types.includes(normalizeType(item.type))) return false;

      if (filters.dateRange.start || filters.dateRange.end) {
        const itemDate = getItemDate(item);

        if (!itemDate) return false;

        const itemDateStr = toISODate(itemDate);

        if (filters.dateRange.start && itemDateStr < filters.dateRange.start) return false;
        if (filters.dateRange.end && itemDateStr > filters.dateRange.end) return false;
      }

      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, filters]);

  // ================= DATA PROCESSING =================

  // Declined reports (rejected by staff as invalid or duplicate) are not real
  // lost/surrendered items, so they are left out of the counts, rates,
  // hotspots and categories, unless "Declined" is picked in the Status
  // filter. The Status chart still shows how many there are.
  const showDeclined = filters.statuses.includes("Declined");
  const countsAsRecord = (item) => showDeclined || normalizeStatus(item.status) !== "Declined";
  const recordItems = filteredItems.filter(countsAsRecord);
  const declinedLeftOut = filteredItems.length - recordItems.length;

  const lostItems = recordItems.filter((item) => normalizeType(item.type) === "Lost");

  const surrendered = recordItems.filter((item) => normalizeType(item.type) === "Surrendered");

  // "Recovered" / "Claimed" means: a LOST report that reached status
  // Claimed. Restricting to Lost-type items keeps recovered <= lost,
  // so the recovery percentage can never exceed 100%.
  // An archived item still counts as recovered if it had been Claimed
  // before it was archived (status_before_archive); otherwise archiving old
  // claimed records made the recovery rate drop.
  const isRecovered = (item) => {
    const status = normalizeStatus(item.status);
    if (status === "Archived") return normalizeStatus(item.status_before_archive) === "Claimed";
    return status === "Claimed";
  };

  // Lost reports that ended with the owner getting the item back.
  const recoveredLost = lostItems.filter(isRecovered);
  // Found (surrendered) items released to their owners.
  const releasedFound = surrendered.filter(isRecovered);
  // Every item handed back, from either list (matches the Dashboard).
  const claimed = [...recoveredLost, ...releasedFound];

  // Recovery rate stays "recovered lost reports / lost reports", so it can
  // never go above 100%.
  const recoveryRate = pct(recoveredLost.length, lostItems.length);

  // Location hotspots — a lost report with several areas counts once in each.
  const locations = {};

  recordItems.forEach((item) => {
    const itemType = normalizeType(item.type);
    if (itemType !== "Lost" && itemType !== "Surrendered") return;
    const recovered = itemType === "Lost" && isRecovered(item);

    splitLocations(item.location).forEach((locKey) => {
      // With a Location filter on, a report that lists several areas only
      // counts toward the areas that were picked (the others used to show
      // up in the table too).
      if (filters.locations.length && !filters.locations.includes(locKey)) return;
      if (!locations[locKey]) locations[locKey] = { lost: 0, recovered: 0, surrendered: 0 };
      if (itemType === "Lost") {
        locations[locKey].lost++;
        if (recovered) locations[locKey].recovered++;
      } else {
        locations[locKey].surrendered++;
      }
    });
  });

  const areaStats = Object.entries(locations)
    .map(([area, data]) => ({ area, ...data }))
    .sort((a, b) => b.lost - a.lost || b.surrendered - a.surrendered);

  // Item Categories — tracked per type (Lost vs Surrendered/Found). Items in
  // a category that no longer exists (e.g. "Personal", "Valuables") are
  // skipped here.
  const categories = {};

  recordItems.forEach((item) => {
    const catKey = normalizeCategory(item.category);
    if (!catKey) return;
    if (!categories[catKey]) categories[catKey] = { lost: 0, surrendered: 0 };
    const itemType = normalizeType(item.type);
    if (itemType === "Lost") categories[catKey].lost++;
    else if (itemType === "Surrendered") categories[catKey].surrendered++;
  });

  const catStats = Object.entries(categories)
    .map(([cat, data]) => ({ cat, ...data, count: data.lost + data.surrendered }))
    .sort((a, b) => b.count - a.count);

  const statuses = {};

  filteredItems.forEach((item) => {
    const statusKey = normalizeStatus(item.status);
    if (!statusKey) return;
    statuses[statusKey] = (statuses[statusKey] || 0) + 1;
  });

  const statusStats = sortByReference(Object.keys(statuses), STATUS_REFERENCE).map((label) => ({
    label,
    value: statuses[label]
  }));

  const comparisonData = [
    { label: "Lost Items", value: lostItems.length },
    { label: "Surrendered Items", value: surrendered.length },
    { label: "Claimed Items", value: claimed.length }
  ];

  const totalItems = recordItems.length;

  // ================= LOST vs FOUND COMPARISON =================
  // Same Location/Category/Status filters, but NOT the Type filter (it
  // compares both types) or the date range (the period picker sets it).
  const comparativeRows = useMemo(() => {
    const base = items.filter((item) => {
      if (
        filters.locations.length &&
        !splitLocations(item.location).some((l) => filters.locations.includes(l))
      )
        return false;
      if (filters.categories.length && !filters.categories.includes(normalizeCategory(item.category)))
        return false;
      if (filters.statuses.length && !filters.statuses.includes(normalizeStatus(item.status)))
        return false;
      if (!filters.statuses.includes("Declined") && normalizeStatus(item.status) === "Declined")
        return false;
      return true;
    });
    return buildComparison(base, compareMode, getItemDate, (item) => normalizeType(item.type), semConfig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, filters.locations, filters.categories, filters.statuses, compareMode, semConfig]);

  const topHotspot = areaStats[0]?.lost > 0 ? areaStats[0].area : "None";

  // ================= ACTIVE FILTER CHIPS =================

  const activeChips = [
    ...filters.locations.map((v) => ({ key: `location-${v}`, label: `Location: ${v}` })),
    ...filters.categories.map((v) => ({ key: `category-${v}`, label: `Category: ${v}` })),
    ...filters.statuses.map((v) => ({ key: `status-${v}`, label: `Status: ${v}` })),
    ...filters.types.map((v) => ({ key: `type-${v}`, label: `Type: ${v}` })),
    ...(filters.dateRange.start || filters.dateRange.end
      ? [
          {
            key: "date-range",
            label:
              filters.dateRange.start && filters.dateRange.end
                ? `Date: ${filters.dateRange.start} → ${filters.dateRange.end}`
                : filters.dateRange.start
                ? `Date: From ${filters.dateRange.start}`
                : `Date: Until ${filters.dateRange.end}`
          }
        ]
      : [])
  ];

  if (loading)
    return (
      <div className="min-h-screen w-full flex items-center justify-center font-black text-slate-400">
        Loading Reports...
      </div>
    );

  return (
    <>
      <style>
        {`
.print-report-only {
  display: none;
}

@media print {
  body {
    background: white !important;
  }

  body * {
    visibility: hidden;
  }

  #print-report,
  #print-report * {
    visibility: visible;
  }

  /* The dashboard layout around this page (DashboardLayout.jsx) is a
     full-screen box with hidden overflow, which cut the printout off
     after the first page. On paper every box that contains the report
     grows to fit it instead. */
  html,
  body,
  #root,
  #root *:has(#print-report) {
    height: auto !important;
    min-height: 0 !important;
    max-height: none !important;
    overflow: visible !important;
    display: block !important;
  }

  /* The on-screen dashboard takes no space on paper (it used to leave
     blank pages at the end of the printout). */
  .screen-dashboard {
    display: none !important;
  }

  .reports-root {
    min-height: 0 !important;
    padding: 0 !important;
  }

  /* Keep a section's heading together with its table. */
  .sr-keep {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .sr-heading {
    break-after: avoid;
    page-break-after: avoid;
  }

  #print-report {
    display: block !important;
    position: static;
    top: 0;
    left: 0;
    width: 100% !important;
    padding: 0 !important;
    background: white !important;
  }

  .no-print {
    display: none !important;
  }

  table {
    page-break-inside: auto;
  }

  tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  @page {
    size: A4 portrait;
    margin: 15mm;
  }

  /* ---- formal summary report styling ---- */
  .summary-report {
    font-family: Georgia, "Times New Roman", serif;
    color: #1a1a1a;
    line-height: 1.5;
  }

  .sr-letterhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 0;
    padding-bottom: 10px;
    border-bottom: 3px double #1a1a1a;
  }

  .sr-letterhead-logos-left {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .sr-logo {
    width: 50px;
    height: 50px;
    object-fit: contain;
    flex-shrink: 0;
  }

  .sr-letterhead-text {
    flex: 1;
    text-align: center;
    padding: 0 8px;
  }

  .sr-school-name {
    font-size: 17px;
    font-weight: 700;
    font-family: Georgia, "Times New Roman", serif;
    color: #1a1a1a;
    margin: 0;
    letter-spacing: 0.3px;
  }

  .sr-school-address {
    font-size: 10.5px;
    font-weight: 600;
    color: #333;
    margin: 1px 0 0 0;
  }

  .sr-office-label {
    font-size: 9.5px;
    font-weight: 700;
    color: #2D366D;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin: 3px 0 0 0;
  }

  .sr-letterhead-logos-right {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-shrink: 0;
  }

  .sr-logo-brand {
    width: 54px;
    height: 54px;
    object-fit: contain;
  }

  .sr-brandbar {
    text-align: center;
    margin: 0 0 16px 0;
    padding: 8px 0 10px 0;
    border-bottom: 1px solid #999;
  }

  .sr-brand-name {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 1px;
    color: #2D366D;
    margin: 0;
  }

  .sr-brand-tagline {
    font-size: 8.5px;
    font-weight: 600;
    letter-spacing: 1px;
    text-transform: uppercase;
    color: #666;
    margin: 2px 0 0 0;
  }

  .sr-title {
    font-size: 16px;
    font-weight: 700;
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 16px 0;
    padding-bottom: 0;
  }

  .sr-meta {
    width: 100%;
    margin-bottom: 20px;
    font-size: 12px;
  }

  .sr-meta td {
    padding: 2px 0;
    vertical-align: top;
  }

  .sr-meta td:first-child {
    font-weight: 700;
    width: 160px;
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.5px;
    color: #444;
  }

  .sr-heading {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 20px 0 8px 0;
    border-bottom: 1px solid #999;
    padding-bottom: 4px;
  }

  .sr-body {
    font-size: 12.5px;
    text-align: justify;
    margin: 0 0 10px 0;
  }

  .sr-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    margin-bottom: 10px;
  }

  .sr-table th,
  .sr-table td {
    border: 1px solid #ccc;
    padding: 5px 8px;
    text-align: left;
  }

  .sr-table th {
    background: #f2f2f2;
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.5px;
  }

  .sr-footer {
    margin-top: 24px;
    padding-top: 10px;
    border-top: 1px solid #999;
    font-size: 10.5px;
    font-style: italic;
    color: #555;
  }
}
`}
      </style>

      {/* FULL-SCREEN CONTAINER */}
      <div className="reports-root w-full min-h-screen bg-slate-50/50 p-4 sm:p-6 lg:p-8">
        {/* ON-SCREEN DASHBOARD (hidden on print, replaced by the formal summary below) */}
        <div className="screen-dashboard space-y-6 w-full">
          {/* HEADER */}
          <div className="bg-gradient-to-br from-[#2D366D] to-[#1E254E] rounded-2xl p-8 text-white w-full">
            <h1 className="text-3xl font-black uppercase italic tracking-wide">
              Lost &amp; Found Statistics
            </h1>

            <p className="mt-3 text-white/70 text-sm">
              Generated from live campus item records. Current recovery efficiency:
              <b className="ml-2 text-white">{recoveryRate}%</b>
              <br />
              <span className="text-xs text-white/50">
                Generated: {new Date().toLocaleDateString()}{" "}
                {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            </p>

            {activeChips.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-4">
                {activeChips.map((chip) => (
                  <span
                    key={chip.key}
                    className="bg-white/15 text-white text-[10px] font-black uppercase tracking-wide px-3 py-1 rounded-full"
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* FILTERS + PRINT */}
          <FilterBar
            filters={filters}
            setFilters={setFilters}
            options={filterOptions}
            activeCount={activeFilterCount}
            onReset={resetFilters}
            onPrint={() => window.print()}
          />

          {/* STAT CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 print-section w-full">
            <StatCard
              label="Recovery Rate"
              count={`${recoveryRate}%`}
              icon={FaAward}
              color="text-indigo-600"
              bgColor="bg-indigo-50"
              description={`${recoveredLost.length} of ${lostItems.length} lost reports recovered${
                declinedLeftOut > 0 ? ` · ${declinedLeftOut} declined report${declinedLeftOut === 1 ? "" : "s"} not counted` : ""
              }`}
            />

            <StatCard
              label="Lost Items"
              count={lostItems.length}
              icon={FaExclamationTriangle}
              color="text-rose-600"
              bgColor="bg-rose-50"
              description="Reported missing items"
            />

            <StatCard
              label="Surrendered Items"
              count={surrendered.length}
              icon={FaCheckCircle}
              color="text-emerald-600"
              bgColor="bg-emerald-50"
              description="Surrendered items"
            />

            <StatCard
              label="Top Hotspot"
              count={topHotspot}
              icon={FaMapMarkerAlt}
              color="text-amber-600"
              bgColor="bg-amber-50"
              description="Highest reported area"
            />
          </div>

          {/* RESPONSIVE FULL-WIDTH CHARTS GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
            {/* RECOVERY GRAPH */}
            <Section title="Recovery Performance">
              {totalItems === 0 ? (
                <EmptyState />
              ) : (
                <div className="flex justify-center items-center h-full py-4">
                  <Donut value={recoveryRate} label="RECOVERED" />
                </div>
              )}
            </Section>

            {/* ITEM ACTIVITY COMPARISON */}
            <Section title="Item Activity Overview">
              <BarChart data={comparisonData} />
            </Section>

            {/* STATUS BREAKDOWN */}
            <Section title="Current Status Distribution">
              <BarChart data={statusStats} />
            </Section>

            {/* CATEGORY REPORT — Lost vs Found per category */}
            <Section title="Item Categories">
              {catStats.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="space-y-5">
                  <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-wide text-slate-400 mb-1">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-400 inline-block" />
                      Lost
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" />
                      Surrendered
                    </span>
                  </div>

                  {catStats.map((cat, index) => (
                    <div key={index}>
                      <div className="flex justify-between text-xs font-bold mb-2 text-slate-600">
                        <span>{cat.cat}</span>
                        <span className="text-slate-400 font-semibold">
                          {cat.lost} lost · {cat.surrendered} surrendered
                        </span>
                      </div>

                      <StackedHBar lost={cat.lost} found={cat.surrendered} total={cat.count} />
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>

          {/* LOST vs SURRENDERED COMPARATIVE REPORT — just above Location Hotspots */}
          <ComparativeReport
            rows={comparativeRows}
            mode={compareMode}
            onModeChange={setCompareMode}
          />

          {/* LOCATION TABLE */}
          <div className="bg-white rounded-2xl border border-slate-200/70 overflow-hidden print-section w-full">
            <div className="p-7 pb-0">
              <h2 className="font-black uppercase text-sm tracking-widest text-slate-700">
                Location Hotspots
              </h2>
            </div>

            {areaStats.length === 0 ? (
              <div className="p-7">
                <EmptyState />
              </div>
            ) : (
              <div className="overflow-x-auto w-full">
                <table className="w-full text-sm mt-5 mb-2">
                  <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                    <tr>
                      <th className="p-4 text-left">Location</th>
                      <th className="p-4 text-center">Lost</th>
                      <th className="p-4 text-center">Surrendered</th>
                      <th className="p-4 text-center">Recovered</th>
                      <th className="p-4 text-center">Risk</th>
                    </tr>
                  </thead>

                  <tbody>
                    {areaStats.map((area, index) => {
                      const risk = riskLevel(area.lost);

                      return (
                        <tr key={index} className="border-t border-slate-100 hover:bg-slate-50/60">
                          <td className="p-4 font-black text-slate-700">{area.area}</td>

                          <td className="p-4 text-center">{area.lost}</td>

                          <td className="p-4 text-center text-emerald-600 font-bold">
                            {area.surrendered}
                          </td>

                          <td className="p-4 text-center text-emerald-600 font-bold">
                            {area.recovered}
                          </td>

                          <td className="p-4 text-center">
                            <span
                              className={`inline-block px-3 py-1 rounded-full text-xs font-black ${riskColor(
                                risk
                              )}`}
                            >
                              {risk}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* PRINT-ONLY FORMAL SUMMARY REPORT */}
        <div id="print-report" className="print-report-only">
          <SummaryReport
            totalItems={totalItems}
            lostItems={lostItems}
            surrendered={surrendered}
            claimed={claimed}
            recoveredLost={recoveredLost}
            releasedFound={releasedFound}
            recoveryRate={recoveryRate}
            areaStats={areaStats}
            catStats={catStats}
            statusStats={statusStats}
            declinedLeftOut={declinedLeftOut}
            topHotspot={topHotspot}
            activeChips={activeChips}
            filters={filters}
            comparativeRows={comparativeRows}
            comparativeMode={compareMode}
          />
        </div>
      </div>
    </>
  );
}
