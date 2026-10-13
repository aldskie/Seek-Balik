import React, { useEffect, useState, useRef } from "react";
import { Filter, X, Printer, ChevronDown, ChevronLeft, ChevronRight, Check, Settings } from "lucide-react";
import { getLeaderboardSettings, updateLeaderboardSettings, getPointsTracking } from "../api/api";
import saoLogo from "../assets/sao.png";
import slcLogo from "../assets/slc-logo.png";
import seekBalikLogo from "../assets/seek-balik-logo.jpg";
import Pagination from "../components/Pagination";
import { confirmAction } from "../components/ConfirmDialog";
import { showToast } from "../utils/toast";

const SCHOOL_NAME = "Saint Louis College";
const SCHOOL_ADDRESS = "City of San Fernando, La Union";

// Default semester configuration (Months are 0-indexed)
const DEFAULT_SEMESTER_CONFIG = {
  firstSem: { startMonth: 7, endMonth: 11 }, // Aug - Dec
  secondSem: { startMonth: 0, endMonth: 4 }, // Jan - May
  shortTerm: { startMonth: 5, endMonth: 6 }, // Jun - Jul
};

// Always use the item's own ID. Never fall back to the ticket number,
// because the ticket number is already shown elsewhere (redundant information).
const getItemId = (record) => {
  const id = record?.item_id;
  return id === null || id === undefined || id === "" ? "-" : String(id);
};

const getSchoolYearAndSemFromDate = (dateString, semConfig = DEFAULT_SEMESTER_CONFIG) => {
  const referenceDate = dateString ? new Date(dateString) : new Date();
  const finalDate = isNaN(referenceDate.getTime()) ? new Date() : referenceDate;

  const year = finalDate.getFullYear();
  const month = finalDate.getMonth(); // 0 = Jan, 11 = Dec

  let sem = "";
  let schoolYear = "";

  // Missing ranges fall back to the defaults (a partly saved config used to crash here).
  const { firstSem, secondSem, shortTerm } = { ...DEFAULT_SEMESTER_CONFIG, ...(semConfig || {}) };

  // Function to check if a month is in range (handles year wrap-around if needed)
  const isMonthInRange = (m, start, end) => {
    if (start <= end) return m >= start && m <= end;
    return m >= start || m <= end; // Crosses calendar year border
  };

  if (isMonthInRange(month, Number(firstSem.startMonth), Number(firstSem.endMonth))) {
    sem = "1st Semester";
    // e.g. Sep-Jan: January still belongs to the school year that began last year.
    const startYear = month >= Number(firstSem.startMonth) ? year : year - 1;
    schoolYear = `${startYear}-${startYear + 1}`;
  } else if (isMonthInRange(month, Number(secondSem.startMonth), Number(secondSem.endMonth))) {
    sem = "2nd Semester";
    const endYear = month <= Number(secondSem.endMonth) ? year : year + 1;
    schoolYear = `${endYear - 1}-${endYear}`;
  } else if (isMonthInRange(month, Number(shortTerm.startMonth), Number(shortTerm.endMonth))) {
    sem = "Short Term";
    schoolYear = `${year}`;
  } else {
    sem = "Custom Term";
    schoolYear = `${year}`;
  }

  return { schoolYear, sem };
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const SEMESTER_OPTIONS = ["1st Semester", "2nd Semester", "Short Term"];

const buildYearOptions = () => {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear + 1; y >= currentYear - 5; y--) {
    years.push(`${y}-${y + 1}`);
  }
  return years;
};

const YEAR_OPTIONS = buildYearOptions();

const EMPTY_FILTERS = { year: [], month: [], semester: "" };

// ─── Multi-Select Dropdown Component ─────────────────────────────────────────
const MultiSelectFilter = ({ label, selectedValues, onChange, options }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (option) => {
    if (selectedValues.includes(option)) {
      onChange(selectedValues.filter((v) => v !== option));
    } else {
      onChange([...selectedValues, option]);
    }
  };

  const displayText =
    selectedValues.length === 0
      ? "All"
      : selectedValues.length === 1
      ? selectedValues[0]
      : `${selectedValues.length} Selected`;

  return (
    <div className="flex flex-col gap-1 text-xs font-bold text-slate-500 min-w-[170px]" ref={containerRef}>
      <span>{label}</span>
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0B6B8A]/30 focus:border-[#0B6B8A]"
        >
          <span className="truncate">{displayText}</span>
          <ChevronDown size={12} className="text-slate-400 ml-2 shrink-0" />
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-30 max-h-56 overflow-y-auto p-1.5 space-y-1">
            {options.map((option) => {
              const isSelected = selectedValues.includes(option);
              return (
                <div
                  key={option}
                  onClick={() => toggleOption(option)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-xs font-semibold transition ${
                    isSelected ? "bg-[#0B6B8A]/10 text-[#0B6B8A]" : "hover:bg-slate-100 text-slate-700"
                  }`}
                >
                  <span>{option}</span>
                  {isSelected && <Check size={13} className="text-[#0B6B8A]" />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Single Select Dropdown Component ───────────────────────────────────────
const FilterSelect = ({ label, value, onChange, options }) => (
  <label className="flex flex-col gap-1 text-xs font-bold text-slate-500 min-w-[170px]">
    {label}
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-white border border-slate-200 rounded-xl px-3 py-2 pr-9 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0B6B8A]/30 focus:border-[#0B6B8A]"
      >
        <option value="">All</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <ChevronDown size={12} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
    </div>
  </label>
);

// ─── Leaderboard Settings Modal ─────────────────────────────────────────────
const SemesterRow = ({ label, config, defaults, onChange }) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
    <span className="text-xs font-bold text-slate-700 w-28">{label}</span>
    <div className="flex items-center gap-2">
      <select
        value={config?.startMonth ?? defaults.startMonth}
        onChange={(e) => onChange({ ...config, startMonth: Number(e.target.value) })}
        className="border border-slate-300 rounded-lg p-1 text-xs font-semibold"
      >
        {MONTH_NAMES.map((m, idx) => (
          <option key={m} value={idx}>{m}</option>
        ))}
      </select>
      <span className="text-xs text-slate-400">to</span>
      <select
        value={config?.endMonth ?? defaults.endMonth}
        onChange={(e) => onChange({ ...config, endMonth: Number(e.target.value) })}
        className="border border-slate-300 rounded-lg p-1 text-xs font-semibold"
      >
        {MONTH_NAMES.map((m, idx) => (
          <option key={m} value={idx}>{m}</option>
        ))}
      </select>
    </div>
  </div>
);

const SettingsModal = ({ settings, set, saving, onSave, onClose }) => {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl max-h-[92vh] overflow-hidden rounded-md bg-white shadow-2xl">
        <div className="flex items-start justify-between bg-gradient-to-r from-[#0B648D] to-[#155F87] px-6 py-3 text-white">
          <div>
            <h3 className="text-2xl font-bold">Leaderboard Settings</h3>
            <p className="mt-1 text-sm text-white/90">Manage visibility, auto scheduling, and semester boundaries</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-xl text-white transition hover:bg-white/25"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="max-h-[calc(92vh-88px)] overflow-y-auto px-6 py-5">
          <div className="mx-auto max-w-xl space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-500">Leaderboard Status</p>
              <span
                className={`w-fit rounded-full px-3 py-1 text-xs font-black ${
                  settings.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                }`}
              >
                {settings.is_active ? "Active" : "Inactive"}
              </span>
            </div>

            {/* Manual & Auto Controls */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h4 className="font-black text-slate-800 text-sm">Manual On / Off</h4>
                    <p className="text-xs text-slate-500">Turn visibility on or off immediately.</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={settings.is_active}
                      onChange={(e) => set("is_active", e.target.checked)}
                      disabled={settings.auto_mode}
                      className="peer sr-only"
                    />
                    <div className="h-7 w-12 rounded-full bg-slate-300 after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:bg-[#0B6B8A] peer-checked:after:translate-x-5 peer-disabled:opacity-50" />
                  </label>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h4 className="font-black text-slate-800 text-sm">Automatic Mode</h4>
                    <p className="text-xs text-slate-500">Activate between selected dates.</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={settings.auto_mode}
                      onChange={(e) => set("auto_mode", e.target.checked)}
                      className="peer sr-only"
                    />
                    <div className="h-7 w-12 rounded-full bg-slate-300 after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:bg-[#0B6B8A] peer-checked:after:translate-x-5" />
                  </label>
                </div>
              </div>
            </div>

            {/* Dates Configuration */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-black uppercase text-slate-600">Start Date</label>
                <input
                  type="date"
                  value={settings.open_date}
                  onChange={(e) => set("open_date", e.target.value)}
                  disabled={!settings.auto_mode}
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-[#0B6B8A] disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-black uppercase text-slate-600">Turn Off Date</label>
                <input
                  type="date"
                  value={settings.close_date}
                  onChange={(e) => set("close_date", e.target.value)}
                  disabled={!settings.auto_mode}
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-[#0B6B8A] disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>
            </div>

            {/* Semester Configuration Section */}
            <div className="border-t border-slate-200 pt-4">
              <h4 className="font-black text-slate-800 text-sm mb-1">Semester Boundaries Configuration</h4>
              <p className="text-xs text-slate-500 mb-3">Define month ranges used for automated semester assignment.</p>

              <div className="space-y-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <SemesterRow
                  label="1st Semester"
                  config={settings.semConfig?.firstSem}
                  defaults={DEFAULT_SEMESTER_CONFIG.firstSem}
                  onChange={(v) => set("semConfig", { ...settings.semConfig, firstSem: v })}
                />
                <SemesterRow
                  label="2nd Semester"
                  config={settings.semConfig?.secondSem}
                  defaults={DEFAULT_SEMESTER_CONFIG.secondSem}
                  onChange={(v) => set("semConfig", { ...settings.semConfig, secondSem: v })}
                />
                <SemesterRow
                  label="Short Term"
                  config={settings.semConfig?.shortTerm}
                  defaults={DEFAULT_SEMESTER_CONFIG.shortTerm}
                  onChange={(v) => set("semConfig", { ...settings.semConfig, shortTerm: v })}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className={`mt-2 w-full rounded-xl py-3 font-black uppercase tracking-wide text-white transition ${
                saving ? "cursor-not-allowed bg-slate-400" : "bg-[#2D366D] hover:bg-[#24305C]"
              }`}
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

function LeaderboardControl() {
  const [settings, setSettings] = useState({
    is_active: false,
    auto_mode: false,
    open_date: "",
    close_date: "",
    semConfig: DEFAULT_SEMESTER_CONFIG,
  });

  const [records, setRecords] = useState([]);
  const [countingPeriod, setCountingPeriod] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const activeFilterCount =
    filters.year.length + filters.month.length + (filters.semester ? 1 : 0);
  const isFiltered = activeFilterCount > 0;

  useEffect(() => {
    fetchInitialData();

    const interval = setInterval(fetchRecords, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filters]);

  const fetchInitialData = async () => {
    try {
      await Promise.all([fetchSettings(), fetchRecords()]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const data = await getLeaderboardSettings();

      setSettings({
        is_active: Boolean(data.is_active),
        auto_mode: Boolean(data.auto_mode),
        open_date: data.open_date || "",
        close_date: data.close_date || "",
        semConfig: data.semConfig || DEFAULT_SEMESTER_CONFIG,
      });
      // The date range whose points the public leaderboard is counting.
      setCountingPeriod(data.period || null);
    } catch (error) {
      console.error("Failed to fetch leaderboard settings:", error);
    }
  };

  const fetchRecords = async () => {
    try {
      const data = await getPointsTracking();
      setRecords(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch points records:", error);
      setRecords([]);
    }
  };

  const set = (key, value) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSave = async () => {
    if (saving) return;

    if (
      settings.auto_mode &&
      settings.open_date &&
      settings.close_date &&
      settings.open_date > settings.close_date
    ) {
      showToast("Open date cannot be later than close date.");
      return;
    }

    if (
      !(await confirmAction({
        message: "Save these leaderboard settings?",
        confirmLabel: "Save",
      }))
    ) {
      return;
    }

    setSaving(true);

    try {
      await updateLeaderboardSettings({
        is_active: settings.is_active,
        auto_mode: settings.auto_mode,
        open_date: settings.open_date || null,
        close_date: settings.close_date || null,
        semConfig: settings.semConfig,
      });

      showToast("Leaderboard settings updated.");
      await fetchSettings();
    } catch (error) {
      console.error("Failed to update leaderboard settings:", error);
      showToast("Failed to update leaderboard settings.");
    } finally {
      setSaving(false);
    }
  };

  const reasonLabel = (reason) => {
    if (reason === "SURRENDER_ITEM") return "Surrendered item";
    if (reason === "ITEM_CLAIMED") return "Item claimed by owner";
    return reason;
  };

  const resetFilters = () => setFilters(EMPTY_FILTERS);

  if (loading) {
    return (
      <div className="bg-white rounded-[18px] border border-[#D8E2EF] shadow-[0_8px_24px_rgba(45,54,109,0.08)] overflow-hidden flex flex-col items-center justify-center gap-3 h-[calc(100vh-135px)] text-center">
        <span className="text-4xl font-black tracking-tighter text-[#071E3D] opacity-20">
          LOADING
        </span>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#7B8AA6]">
          Fetching leaderboard control...
        </p>
      </div>
    );
  }

  const { schoolYear: liveSchoolYear, sem: liveSem } = getSchoolYearAndSemFromDate(
    settings.auto_mode ? settings.open_date : null,
    settings.semConfig
  );

  const reportSchoolYear = filters.year.length > 0 ? filters.year.join(", ") : liveSchoolYear;
  const reportSem = filters.semester || liveSem;

  const ITEMS_PER_PAGE = 10;

  const filteredRecords = records.filter((record) => {
    const searchText = search.toLowerCase();

    const matchesSearch =
      record.player_name?.toLowerCase().includes(searchText) ||
      reasonLabel(record.reason)?.toLowerCase().includes(searchText) ||
      String(record.item_id ?? "").toLowerCase().includes(searchText);

    if (!matchesSearch) return false;

    if (isFiltered) {
      const recordDate = new Date(record.created_at);
      if (isNaN(recordDate.getTime())) return false;

      const { schoolYear, sem } = getSchoolYearAndSemFromDate(record.created_at, settings.semConfig);

      if (filters.year.length > 0 && !filters.year.includes(schoolYear)) return false;
      if (filters.semester && sem !== filters.semester) return false;

      if (filters.month.length > 0) {
        const monthName = recordDate.toLocaleString("default", { month: "long" });
        if (!filters.month.includes(monthName)) return false;
      }
    }

    return true;
  });

  const totalPoints = filteredRecords.reduce((sum, r) => sum + (Number(r.points) || 0), 0);

  // Generate Report: each person's total for the records in view (same
  // search and filters), highest first. Grouped by ID number, so the same
  // student is one row even if their name was typed differently.
  const pointsPerUser = Object.values(
    filteredRecords.reduce((acc, r) => {
      const rawId = String(r.student_id || "").trim();
      const id = ["null", "none", "undefined"].includes(rawId.toLowerCase()) ? "" : rawId;
      const key = id || `name:${String(r.player_name || "").trim().toLowerCase()}`;
      if (!acc[key]) {
        acc[key] = { key, id, name: r.player_name || "-", surrendered: 0, claimed: 0, points: 0 };
      }
      const row = acc[key];
      if (r.reason === "SURRENDER_ITEM") row.surrendered += 1;
      if (r.reason === "ITEM_CLAIMED") row.claimed += 1;
      row.points += Number(r.points) || 0;
      if (r.player_name) row.name = r.player_name;
      return acc;
    }, {})
  ).sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  const totalPages = Math.ceil(filteredRecords.length / ITEMS_PER_PAGE) || 1;

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedRecords = filteredRecords.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  return (
    <div className="bg-white rounded-[18px] border border-[#D8E2EF] shadow-[0_8px_24px_rgba(45,54,109,0.08)] overflow-hidden flex flex-col h-[calc(100vh-135px)]">
      <style>
        {`
          @media print {
            body { background: white !important; }
            body * { visibility: hidden; }
            #print-report, #print-report * { visibility: visible; }
            #print-report {
              position: absolute;
              top: 0;
              left: 0;
              width: 100%;
              padding: 0 !important;
              background: white !important;
            }
            .no-print { display: none !important; }
            table { page-break-inside: auto; }
            tr { break-inside: avoid; page-break-inside: avoid; }
            @page { size: A4 portrait; margin: 12mm; }
          }
        `}
      </style>

      {/* Header */}
      <div className="bg-white px-6 sm:px-8 py-4 border-b border-[#D8E2EF] shrink-0">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-8 rounded-full bg-[#0B6B8A]" />
            <div>
              <h3 className="text-base sm:text-lg font-black uppercase tracking-[0.16em] text-[#071E3D]">
                Leaderboard Control for SY {liveSchoolYear} ({liveSem})
              </h3>
              <p className="text-xs sm:text-sm text-[#7B8AA6] italic mt-0.5">
                Manage leaderboard visibility, scheduling, and point records
              </p>
              {countingPeriod?.start && countingPeriod?.end && (
                <p className="text-[11px] sm:text-xs font-semibold text-[#0B6B8A] mt-0.5">
                  Public ranking counts points earned{" "}
                  {new Date(`${countingPeriod.start}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  {" – "}
                  {new Date(`${countingPeriod.end}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  {" "}(set by the semester months in Settings)
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:w-auto">
            <div className="relative w-full sm:w-[300px]">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#0B6B8A] text-sm">🔍</span>
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search point records..."
                className="w-full pl-10 pr-4 py-2.5 border border-[#CBD8E8] rounded-full text-sm outline-none bg-white text-[#071E3D] placeholder:text-[#8A98B3] focus:ring-2 focus:ring-[#0B6B8A]/20 focus:border-[#0B6B8A] transition-all"
              />
            </div>

            <span
              className={`w-fit rounded-full px-3 py-1 text-xs font-black uppercase ${
                settings.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
              }`}
            >
              {settings.is_active ? "Active" : "Inactive"}
            </span>

            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#2D366D] text-white font-black uppercase tracking-[0.1em] text-xs shadow-[0_6px_14px_rgba(45,54,109,0.25)] hover:bg-[#24305C] transition-all whitespace-nowrap"
            >
              <Settings size={14} /> Settings
            </button>
          </div>
        </div>
      </div>

      {/* Filters + Report */}
      <div className="px-6 sm:px-8 py-4 border-b border-[#D8E2EF] shrink-0 no-print">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-center gap-2 text-slate-400 pb-2.5">
            <Filter size={14} />
          </div>

          <MultiSelectFilter
            label="School Year"
            selectedValues={filters.year}
            onChange={(v) => setFilters((f) => ({ ...f, year: v }))}
            options={YEAR_OPTIONS}
          />

          <MultiSelectFilter
            label="Month"
            selectedValues={filters.month}
            onChange={(v) => setFilters((f) => ({ ...f, month: v }))}
            options={MONTH_NAMES}
          />

          <FilterSelect
            label="Semester"
            value={filters.semester}
            onChange={(v) => setFilters((f) => ({ ...f, semester: v }))}
            options={SEMESTER_OPTIONS}
          />

          <div className="flex items-center gap-4 ml-auto">
            {isFiltered && (
              <button
                type="button"
                onClick={resetFilters}
                className="flex items-center gap-1 text-xs font-black text-rose-500 hover:text-rose-600 pb-2.5"
              >
                <X size={12} />
                Clear ({activeFilterCount})
              </button>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#2D366D] text-white font-black uppercase tracking-[0.1em] text-xs shadow-[0_6px_14px_rgba(45,54,109,0.25)] hover:bg-[#24305C] transition-all whitespace-nowrap shrink-0"
            >
              <Printer size={14} />
              Generate Report
            </button>
          </div>
        </div>
      </div>

      {/* Content Table */}
      <div id="print-report" className="flex-1 overflow-auto bg-white">
        <div className="hidden print:block px-6 pt-6 pb-4">
          {/* Letterhead */}
          <div className="flex items-center justify-between gap-3 pb-2.5 border-b-4 border-double border-black">
            <div className="flex items-center gap-1.5 shrink-0">
              <img src={saoLogo} alt="Student Affairs Office seal" className="w-[50px] h-[50px] object-contain" />
              <img src={slcLogo} alt={`${SCHOOL_NAME} seal`} className="w-[50px] h-[50px] object-contain" />
            </div>
            <div className="flex-1 text-center px-2">
              <p className="text-[17px] font-bold text-black" style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}>
                {SCHOOL_NAME}
              </p>
              <p className="text-[10.5px] font-semibold text-slate-800 mt-0.5">{SCHOOL_ADDRESS}</p>
              <p className="text-[9.5px] font-bold text-[#2D366D] uppercase tracking-[2px] mt-0.5">
                Student Affairs Office
              </p>
            </div>
            <div className="flex items-center justify-end shrink-0">
              <img src={seekBalikLogo} alt="Seek &amp; Balik logo" className="w-[54px] h-[54px] object-contain" />
            </div>
          </div>

          {/* Brand bar */}
          <div className="text-center pt-2 pb-2.5 border-b border-slate-400">
            <p className="text-[13px] font-bold tracking-[1px] text-[#2D366D]">Seek &amp; Balik</p>
            <p className="text-[8.5px] font-semibold tracking-[1px] uppercase text-slate-500 mt-0.5">
              A Lost and Found Management System
            </p>
          </div>

          {/* Report title */}
          <h2 className="mt-4 text-center text-base font-black uppercase tracking-wide text-black">
            Points Tracking Report — SY {reportSchoolYear} ({reportSem})
          </h2>

          {/* Meta */}
          <p className="mt-3 text-xs text-slate-700">
            <span className="font-bold">Generated:</span>{" "}
            {new Date().toLocaleDateString()}{" "}
            {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="mt-1 text-xs text-slate-700">
            <span className="font-bold">Records:</span> {filteredRecords.length}
            {" · "}
            <span className="font-bold">Total points awarded:</span> {totalPoints}
            {" · "}
            <span className="font-bold">Students:</span> {pointsPerUser.length}
          </p>

          {/* A. Total points per user */}
          <h3 className="mt-5 mb-2 text-sm font-black uppercase tracking-wide text-black border-b border-slate-400 pb-1">
            A. Total Points per Student
          </h3>
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr>
                <th className="w-[8%] bg-[#0B6B8A] p-2.5 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Rank</th>
                <th className="w-[30%] bg-[#0B6B8A] p-2.5 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Student</th>
                <th className="w-[17%] bg-[#0B6B8A] p-2.5 border border-gray-300 text-center text-[11px] font-black uppercase text-white">ID Number</th>
                <th className="w-[15%] bg-[#0B6B8A] p-2.5 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Items Surrendered</th>
                <th className="w-[15%] bg-[#0B6B8A] p-2.5 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Items Claimed by Owner</th>
                <th className="w-[15%] bg-[#0B6B8A] p-2.5 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Total Points</th>
              </tr>
            </thead>
            <tbody>
              {pointsPerUser.length === 0 ? (
                <tr>
                  <td colSpan={6} className="border border-gray-300 p-3 text-center text-[13px] text-slate-500">
                    No point records for this period.
                  </td>
                </tr>
              ) : (
                pointsPerUser.map((u, index) => (
                  <tr key={u.key} className={index % 2 === 0 ? "bg-white" : "bg-[#F6FAFF]"}>
                    <td className="border border-gray-300 p-2.5 text-center text-[13px] text-slate-700">{index + 1}</td>
                    <td className="border border-gray-300 p-2.5 text-center text-[13px] font-bold text-[#071E3D]">{u.name}</td>
                    <td className="border border-gray-300 p-2.5 text-center text-[13px] text-slate-600">{u.id || "-"}</td>
                    <td className="border border-gray-300 p-2.5 text-center text-[13px] text-slate-600">{u.surrendered}</td>
                    <td className="border border-gray-300 p-2.5 text-center text-[13px] text-slate-600">{u.claimed}</td>
                    <td className="border border-gray-300 p-2.5 text-center text-[13px] font-black text-[#0B6B8A]">{u.points}</td>
                  </tr>
                ))
              )}
            </tbody>
            {pointsPerUser.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={5} className="border border-gray-300 p-2.5 text-right text-[13px] font-black text-[#071E3D]">
                    Total points awarded
                  </td>
                  <td className="border border-gray-300 p-2.5 text-center text-[13px] font-black text-[#0B6B8A]">{totalPoints}</td>
                </tr>
              </tfoot>
            )}
          </table>

          {/* B. Every point record */}
          <h3 className="mt-6 text-sm font-black uppercase tracking-wide text-black border-b border-slate-400 pb-1">
            B. Point Records
          </h3>
        </div>

        <table className="w-full min-w-[1000px] table-fixed border-collapse print:hidden">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-[18%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Date</th>
              <th className="w-[20%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Student</th>
              <th className="w-[26%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Reason</th>
              <th className="w-[18%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Item ID</th>
              <th className="w-[18%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Points</th>
            </tr>
          </thead>

          <tbody className="bg-white">
            {paginatedRecords.length > 0 ? (
              paginatedRecords.map((record, index) => (
                <tr key={record.id} className={`h-[70px] transition-colors ${index % 2 === 0 ? "bg-white" : "bg-[#F6FAFF]"} hover:bg-[#EAF4FF]`}>
                  <td className="border border-gray-300 p-4 text-center align-middle text-slate-600 text-[14px]">
                    {new Date(record.created_at).toLocaleString()}
                  </td>
                  <td className="truncate border border-gray-300 p-4 text-center align-middle font-bold text-[#071E3D]">
                    {record.player_name}
                  </td>
                  <td className="border border-gray-300 p-4 text-center align-middle text-slate-600 text-[14px]">
                    {reasonLabel(record.reason)}
                  </td>
                  <td className="border border-gray-300 p-4 text-center align-middle text-slate-600 text-[14px]">
                    {getItemId(record)}
                  </td>
                  <td className="border border-gray-300 p-4 text-center align-middle font-black text-[#0B6B8A]">
                    +{record.points}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="bg-white py-24 text-center">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <span className="text-4xl font-black tracking-tighter text-[#071E3D] opacity-20">
                      EMPTY
                    </span>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#7B8AA6]">
                      {isFiltered ? "No point records for this period" : "No point records yet"}
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Print-only Table */}
        <table className="hidden print:table w-full table-fixed border-collapse">
          <thead>
            <tr>
              <th className="w-[18%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Date</th>
              <th className="w-[20%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Student</th>
              <th className="w-[26%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Reason</th>
              <th className="w-[18%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Item ID</th>
              <th className="w-[18%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Points</th>
            </tr>
          </thead>
          <tbody className="bg-white">
            {filteredRecords.map((record, index) => (
              <tr key={record.id} className={index % 2 === 0 ? "bg-white" : "bg-[#F6FAFF]"}>
                <td className="border border-gray-300 p-3 text-center align-middle text-slate-600 text-[13px]">
                  {new Date(record.created_at).toLocaleString()}
                </td>
                <td className="border border-gray-300 p-3 text-center align-middle font-bold text-[#071E3D] text-[13px]">
                  {record.player_name}
                </td>
                <td className="border border-gray-300 p-3 text-center align-middle text-slate-600 text-[13px]">
                  {reasonLabel(record.reason)}
                </td>
                <td className="border border-gray-300 p-3 text-center align-middle text-slate-600 text-[13px]">
                  {getItemId(record)}
                </td>
                <td className="border border-gray-300 p-3 text-center align-middle font-black text-[#0B6B8A] text-[13px]">
                  +{record.points}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4} className="border border-gray-300 p-3 text-right align-middle font-black text-[#071E3D] text-[13px]">
                Total points awarded
              </td>
              <td className="border border-gray-300 p-3 text-center align-middle font-black text-[#0B6B8A] text-[13px]">
                {totalPoints}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Pagination Footer */}
      <Pagination
        className="no-print"
        currentPage={currentPage}
        totalItems={filteredRecords.length}
        pageSize={ITEMS_PER_PAGE}
        onPageChange={setCurrentPage}
        extra={
          isFiltered && (
            <span className="ml-2 text-[#0B6B8A]">({totalPoints} pts in view)</span>
          )
        }
      />

      {/* Settings Modal */}
      {settingsOpen && (
        <SettingsModal
          settings={settings}
          set={set}
          saving={saving}
          onSave={handleSave}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

export default LeaderboardControl;