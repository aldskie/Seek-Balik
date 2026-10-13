import React, { useMemo, useState } from "react";
import { FaArrowUp, FaArrowDown, FaMinus, FaTable, FaChartBar } from "react-icons/fa";

// ==========================================================
// LOST vs FOUND COMPARATIVE REPORT (Reports.jsx)
//
// Compares Lost reports and Found (Surrendered) items across periods:
//   Monthly   — last 12 months
//   Semestral — last 6 school terms, using the semester months set in
//               Leaderboard Control (default 1st Sem Aug–Dec, 2nd Sem
//               Jan–May, Short Term Jun–Jul)
//   Yearly    — last 5 calendar years
//
// The current period is counted "to date". Items are dated by
// created_date (the same date the rest of Reports.jsx uses).
//
// Colors: Lost #e11d48 / Found #0d9488, checked with the dataviz
// palette validator (colorblind separation ΔE 10.2, ≥ 3:1 contrast).
// ==========================================================

export const LOST_COLOR = "#e11d48";
export const FOUND_COLOR = "#0d9488";

export const COMPARISON_MODES = [
  { key: "monthly", label: "Monthly", count: 12, unit: "month" },
  { key: "semestral", label: "Semestral", count: 6, unit: "semester" },
  { key: "yearly", label: "Yearly", count: 5, unit: "year" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const fmtDay = (d) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;

// Semester month ranges, the same ones set in Leaderboard Control >
// Settings > "Semester Boundaries Configuration" (0 = January). The
// defaults match that page: 1st Sem Aug–Dec, 2nd Sem Jan–May, Short Term
// Jun–Jul. They used to be fixed here, so a school that changed its
// semester months got a different split on Reports than on the Leaderboard.
const DEFAULT_SEMESTER_CONFIG = {
  firstSem: { startMonth: 7, endMonth: 11 },
  secondSem: { startMonth: 0, endMonth: 4 },
  shortTerm: { startMonth: 5, endMonth: 6 },
};

const monthOf = (v, fallback) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 11 ? n : fallback;
};

function getSemesterPeriod(date, semConfig) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const saved = semConfig && typeof semConfig === "object" ? semConfig : {};
  const terms = [
    ["firstSem", "1st Sem", "1st Semester"],
    ["secondSem", "2nd Sem", "2nd Semester"],
    ["shortTerm", "Short Term", "Short Term"],
  ];

  for (const [key, short, long] of terms) {
    const def = DEFAULT_SEMESTER_CONFIG[key];
    const s0 = monthOf(saved[key]?.startMonth, def.startMonth);
    const e0 = monthOf(saved[key]?.endMonth, def.endMonth);
    const inside = s0 <= e0 ? m >= s0 && m <= e0 : m >= s0 || m <= e0;
    if (!inside) continue;

    // A range like Sep–Jan crosses New Year.
    const startYear = s0 <= e0 || m >= s0 ? y : y - 1;
    const endYear = s0 <= e0 ? startYear : startYear + 1;
    const start = new Date(startYear, s0, 1);
    const end = new Date(endYear, e0 + 1, 0);

    let sy;
    if (key === "firstSem") sy = [start.getFullYear(), start.getFullYear() + 1];
    else if (key === "secondSem") sy = [end.getFullYear() - 1, end.getFullYear()];
    else sy = [start.getFullYear() - 1, start.getFullYear()];
    const syShort = `${String(sy[0]).slice(2)}–${String(sy[1]).slice(2)}`;

    return {
      key: `s-${ymd(start)}`,
      start,
      end,
      short: `${short} ${syShort}`,
      label: `${long}, S.Y. ${sy[0]}–${sy[1]}`,
    };
  }

  // A month in none of the three ranges counts on its own.
  const start = new Date(y, m, 1);
  return {
    key: `s-${ymd(start)}`,
    start,
    end: new Date(y, m + 1, 0),
    short: `${MONTHS[m]} ${y}`,
    label: `Custom Term (${MONTHS[m]} ${y})`,
  };
}

// The period a date falls in, for the given mode.
export function getPeriod(date, mode, semConfig) {
  const y = date.getFullYear();
  const m = date.getMonth();

  if (mode === "weekly") {
    const start = new Date(y, m, date.getDate());
    const dow = (start.getDay() + 6) % 7; // Monday = 0
    start.setDate(start.getDate() - dow);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const sameMonth = start.getMonth() === end.getMonth();
    return {
      key: `w-${ymd(start)}`,
      start,
      end,
      short: fmtDay(start),
      label: `${fmtDay(start)} – ${sameMonth ? end.getDate() : fmtDay(end)}, ${end.getFullYear()}`,
    };
  }

  if (mode === "monthly") {
    return {
      key: `m-${y}-${m}`,
      start: new Date(y, m, 1),
      end: new Date(y, m + 1, 0),
      short: `${MONTHS[m]} '${String(y).slice(2)}`,
      label: `${MONTHS[m]} ${y}`,
    };
  }

  if (mode === "semestral") {
    return getSemesterPeriod(date, semConfig);
  }

  return {
    key: `y-${y}`,
    start: new Date(y, 0, 1),
    end: new Date(y, 11, 31),
    short: String(y),
    label: String(y),
  };
}

// Last `count` periods, oldest first, ending with the current one.
export function buildComparison(items, mode, getItemDate, getType, semConfig) {
  const cfg = COMPARISON_MODES.find((c) => c.key === mode) || COMPARISON_MODES[0];
  const periods = [];
  let cursor = new Date();
  for (let i = 0; i < cfg.count; i += 1) {
    const p = getPeriod(cursor, mode, semConfig);
    periods.unshift({ ...p, lost: 0, found: 0, current: i === 0 });
    cursor = new Date(p.start);
    cursor.setDate(cursor.getDate() - 1);
  }

  const byKey = new Map(periods.map((p) => [p.key, p]));
  items.forEach((item) => {
    const d = getItemDate(item);
    if (!d) return;
    const p = byKey.get(getPeriod(d, mode, semConfig).key);
    if (!p) return;
    const type = getType(item);
    if (type === "Lost") p.lost += 1;
    else if (type === "Surrendered") p.found += 1;
  });

  return periods.map((p, i) => {
    const prev = periods[i - 1];
    return {
      ...p,
      gap: p.found - p.lost,
      lostChange: prev ? p.lost - prev.lost : null,
      foundChange: prev ? p.found - prev.found : null,
    };
  });
}

// Rounds the y-axis top up so the 4 gridline steps are whole, round numbers.
// Plain-words result for one period: "2 more lost", "3 more found", "Same".
export const describeGap = (r) => {
  if (r.lost === r.found) return "Same number";
  return r.lost > r.found ? `${r.lost - r.found} more lost` : `${r.found - r.lost} more surrendered`;
};

// A few plain sentences summarising the comparison (screen and print).
export function buildComparisonSummary(rows, mode) {
  const cfg = COMPARISON_MODES.find((c) => c.key === mode) || COMPARISON_MODES[0];
  if (!rows.length) return [];
  const lost = rows.reduce((a, r) => a + r.lost, 0);
  const found = rows.reduce((a, r) => a + r.found, 0);
  const out = [
    `In the last ${rows.length} ${cfg.unit}s, ${lost} item${lost === 1 ? " was" : "s were"} reported lost and ${found} ${found === 1 ? "was" : "were"} surrendered.`,
  ];
  const topLost = rows.reduce((a, r) => (r.lost > a.lost ? r : a), rows[0]);
  const topFound = rows.reduce((a, r) => (r.found > a.found ? r : a), rows[0]);
  if (topLost.lost > 0 || topFound.found > 0) {
    out.push(
      `The most lost items were reported in ${topLost.label} (${topLost.lost}), and the most surrendered items in ${topFound.label} (${topFound.found}).`
    );
  }
  const cur = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  if (cur && prev) {
    out.push(
      `This ${cfg.unit} so far (${cur.label}): ${cur.lost} lost and ${cur.found} surrendered. Last ${cfg.unit} (${prev.label}): ${prev.lost} lost and ${prev.found} surrendered.`
    );
  }
  return out;
}

const niceMax = (v) => {
  if (v <= 4) return 4;
  const raw = v / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].find((s) => s * pow >= raw) * pow;
  return step * 4;
};

// Bar with a 4px rounded top, square on the baseline.
const barPath = (x, y, w, h) => {
  if (h <= 0) return "";
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
};

const pctChange = (now, before) => {
  if (before === 0) return now === 0 ? "0%" : "new";
  const v = Math.round(((now - before) / before) * 100);
  return `${v > 0 ? "+" : ""}${v}%`;
};

const ChangeLine = ({ change, now, unit }) => {
  if (change === null || change === undefined) return null;
  const before = now - change;
  const Icon = change > 0 ? FaArrowUp : change < 0 ? FaArrowDown : FaMinus;
  return (
    <p className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
      <Icon size={9} />
      {change === 0
        ? `Same as last ${unit}`
        : `${change > 0 ? "+" : ""}${change} (${pctChange(now, before)}) vs last ${unit}`}
    </p>
  );
};

// ---------------- CHART ----------------
// Shorter chart (was 720 x 280) so the whole comparison takes less room.
const W = 720;
const H = 200;
const M = { top: 18, right: 12, bottom: 40, left: 32 };

const GroupedBars = ({ rows, series = "both" }) => {
  const showLost = series !== "found";
  const showFound = series !== "lost";
  const [hover, setHover] = useState(null);
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const maxV = niceMax(
    Math.max(1, ...rows.map((r) => Math.max(showLost ? r.lost : 0, showFound ? r.found : 0)))
  );
  const ticks = [0, 1, 2, 3, 4].map((i) => (maxV / 4) * i);
  const groupW = plotW / rows.length;
  const barW = Math.max(6, Math.min(20, groupW * 0.28));
  const y = (v) => M.top + plotH - (v / maxV) * plotH;
  const last = rows.length - 1;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Lost and surrendered items per period">
        {/* gridlines + y ticks */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#cbd5e1" : "#eef2f6"} strokeWidth="1" />
            <text x={M.left - 8} y={y(t) + 4} textAnchor="end" fontSize="10.5" fill="#94a3b8">
              {Number.isInteger(t) ? t : t.toFixed(1)}
            </text>
          </g>
        ))}

        {rows.map((r, i) => {
          const gx = M.left + groupW * i;
          const cx = gx + groupW / 2;
          const both = showLost && showFound;
          const lx = both ? cx - barW - 1 : cx - barW / 2; // 2px surface gap between the pair
          const fx = both ? cx + 1 : cx - barW / 2;
          return (
            <g key={r.key}>
              {hover === i && (
                <rect x={gx + 2} y={M.top} width={groupW - 4} height={plotH} rx="6" fill="#f1f5f9" />
              )}
              {showLost && <path d={barPath(lx, y(r.lost), barW, y(0) - y(r.lost))} fill={LOST_COLOR} />}
              {showFound && <path d={barPath(fx, y(r.found), barW, y(0) - y(r.found))} fill={FOUND_COLOR} />}

              {/* direct labels on the current period only */}
              {i === last && (
                <>
                  {showLost && <text x={lx + barW / 2} y={y(r.lost) - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill="#334155">{r.lost}</text>}
                  {showFound && <text x={fx + barW / 2} y={y(r.found) - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill="#334155">{r.found}</text>}
                </>
              )}

              <text
                x={cx}
                y={H - M.bottom + 16}
                textAnchor="middle"
                fontSize={rows.length > 8 ? 10 : 11}
                fontWeight={r.current ? 700 : 500}
                fill={r.current ? "#334155" : "#64748b"}
              >
                {r.short}
              </text>
              {r.current && (
                <text x={cx} y={H - M.bottom + 29} textAnchor="middle" fontSize="9.5" fill="#94a3b8">to date</text>
              )}

              {/* hit target: whole column */}
              <rect
                x={gx}
                y={M.top}
                width={groupW}
                height={plotH + 24}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          );
        })}
      </svg>

      {hover !== null && rows[hover] && (
        <div
          className={`pointer-events-none absolute top-2 z-10 min-w-[170px] rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-lg ${
            hover >= rows.length / 2 ? "-translate-x-full" : ""
          }`}
          // Beside the hovered column (left of it on the right half), so it
          // never covers the bars it describes.
          style={{
            left: `${((M.left + ((W - M.left - M.right) / rows.length) * (hover >= rows.length / 2 ? hover : hover + 1)) / W) * 100}%`,
            marginLeft: hover >= rows.length / 2 ? -8 : 8,
          }}
        >
          <p className="text-xs font-bold text-slate-700">
            {rows[hover].label}
            {rows[hover].current ? " (to date)" : ""}
          </p>
          <div className="mt-1.5 space-y-1 text-xs text-slate-600">
            <p className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: LOST_COLOR }} />Lost</span>
              <b className="text-slate-800">{rows[hover].lost}</b>
            </p>
            <p className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: FOUND_COLOR }} />Surrendered</span>
              <b className="text-slate-800">{rows[hover].found}</b>
            </p>
            <p className="flex items-center justify-between gap-4 border-t border-slate-100 pt-1">
              <span>Surrendered − Lost</span>
              <b className="text-slate-800">{rows[hover].gap > 0 ? "+" : ""}{rows[hover].gap}</b>
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------- PERIOD vs PERIOD ----------------
// Lost compared with Lost, and Found with Found, for any two periods.
const fmtChange = (a, b) => {
  const d = a - b;
  if (d === 0) return "no change";
  return `${d > 0 ? "+" : ""}${d} (${pctChange(a, b)})`;
};

const PairRow = ({ label, color, a, b, labelA, labelB, max }) => (
  <div>
    <div className="mb-1 flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 font-bold text-slate-700">
        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
        {label}
      </span>
      <span className="font-semibold text-slate-500">
        {a === b ? (
          <FaMinus className="mr-1 inline" size={9} />
        ) : a > b ? (
          <FaArrowUp className="mr-1 inline" size={9} />
        ) : (
          <FaArrowDown className="mr-1 inline" size={9} />
        )}
        {fmtChange(a, b)}
      </span>
    </div>
    {[
      { name: labelA, v: a, strong: true },
      { name: labelB, v: b, strong: false },
    ].map((x, i) => (
      <div key={i} className="mb-0.5 flex items-center gap-2">
        <span className={`w-24 shrink-0 truncate text-[11px] ${x.strong ? "font-bold text-slate-700" : "text-slate-500"}`} title={x.name}>
          {x.name}
        </span>
        <div className="h-2.5 flex-1 rounded-r bg-slate-100">
          <div
            className="h-2.5 rounded-r transition-all duration-300"
            style={{ width: `${max ? (x.v / max) * 100 : 0}%`, background: color, opacity: x.strong ? 1 : 0.45 }}
          />
        </div>
        <span className={`w-8 text-right text-xs ${x.strong ? "font-bold text-slate-800" : "text-slate-500"}`}>{x.v}</span>
      </div>
    ))}
  </div>
);

// Defined outside PeriodVsPeriod: created inside it, React rebuilt the
// dropdown on every refresh (the page reloads its data every 3 seconds), so
// an open period dropdown kept closing by itself.
const Picker = ({ rows, value, onChange }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none focus:border-[#2D366D]"
  >
    {[...rows].reverse().map((r) => (
      <option key={r.key} value={r.key}>{r.label}{r.current ? " (to date)" : ""}</option>
    ))}
  </select>
);

const PeriodVsPeriod = ({ rows, unit }) => {
  const last = rows.length - 1;
  const [aKey, setAKey] = useState(rows[last]?.key);
  const [bKey, setBKey] = useState(rows[last - 1]?.key);
  const A = rows.find((r) => r.key === aKey) || rows[last];
  const B = rows.find((r) => r.key === bKey) || rows[Math.max(0, last - 1)];
  if (!A || !B) return null;
  const max = Math.max(A.lost, B.lost, A.found, B.found, 1);
  const nameOf = (r) => `${r.short}${r.current ? " (to date)" : ""}`;

  return (
    <div className="mb-4 rounded-xl border border-slate-200 p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <p className="mr-1 text-[10px] font-black uppercase tracking-wider text-slate-400">
          Compare {unit} to {unit}
        </p>
        <Picker rows={rows} value={A.key} onChange={setAKey} />
        <span className="text-xs font-semibold text-slate-400">with</span>
        <Picker rows={rows} value={B.key} onChange={setBKey} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <PairRow label="Lost vs Lost" color={LOST_COLOR} a={A.lost} b={B.lost} labelA={nameOf(A)} labelB={nameOf(B)} max={max} />
        <PairRow label="Surrendered vs Surrendered" color={FOUND_COLOR} a={A.found} b={B.found} labelA={nameOf(A)} labelB={nameOf(B)} max={max} />
      </div>
    </div>
  );
};

// ---------------- MAIN ----------------
const ComparativeReport = ({ rows, mode, onModeChange }) => {
  const [showTable, setShowTable] = useState(false);
  // Chart series: both, or Lost-only / Found-only to follow one trend.
  const [series, setSeries] = useState("both");
  const cfg = COMPARISON_MODES.find((c) => c.key === mode) || COMPARISON_MODES[0];
  const current = rows[rows.length - 1];
  const totals = useMemo(
    () => rows.reduce((a, r) => ({ lost: a.lost + r.lost, found: a.found + r.found }), { lost: 0, found: 0 }),
    [rows]
  );

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/70 w-full">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-black uppercase text-sm tracking-widest text-slate-700">
            Lost vs Surrendered Comparison
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            Last {rows.length} {cfg.unit}s · uses the Location, Category and Status filters (the period picker sets the dates)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            {COMPARISON_MODES.map((m) => (
              <button
                key={m.key}
                onClick={() => onModeChange(m.key)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  mode === m.key ? "bg-[#2D366D] text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowTable((v) => !v)}
            title={showTable ? "Show chart" : "Show table"}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            {showTable ? <FaChartBar size={13} /> : <FaTable size={13} />}
          </button>
        </div>
      </div>

      {/* this period vs last */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: LOST_COLOR }} />
            Lost this {cfg.unit}
          </p>
          <p className="mt-0.5 text-2xl font-black text-slate-800">{current?.lost ?? 0}</p>
          <ChangeLine change={current?.lostChange} now={current?.lost ?? 0} unit={cfg.unit} />
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: FOUND_COLOR }} />
            Surrendered this {cfg.unit}
          </p>
          <p className="mt-0.5 text-2xl font-black text-slate-800">{current?.found ?? 0}</p>
          <ChangeLine change={current?.foundChange} now={current?.found ?? 0} unit={cfg.unit} />
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            Total, last {rows.length} {cfg.unit}s
          </p>
          <p className="mt-0.5 text-2xl font-black text-slate-800">
            {totals.lost} <span className="text-sm font-bold text-slate-400">lost</span> · {totals.found}{" "}
            <span className="text-sm font-bold text-slate-400">surrendered</span>
          </p>
          <p className="mt-1 text-[11px] font-semibold text-slate-500">
            {totals.found >= totals.lost
              ? `${totals.found - totals.lost} more surrendered than lost`
              : `${totals.lost - totals.found} more lost than surrendered`}
          </p>
        </div>
      </div>

      {/* Lost to Lost, Found to Found — any two periods (reset when the mode changes) */}
      <PeriodVsPeriod key={mode} rows={rows} unit={cfg.unit} />

      {showTable ? (
        <div className="overflow-x-auto">
          {/* Plain table: how many were lost and found in each period. */}
          <table className="mx-auto w-full max-w-md text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-1.5 text-left">{cfg.unit[0].toUpperCase() + cfg.unit.slice(1)}</th>
                <th className="px-3 py-1.5 text-center">Lost</th>
                <th className="px-3 py-1.5 text-center">Surrendered</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].reverse().map((r) => (
                <tr key={r.key} className="border-t border-slate-100">
                  <td className="px-3 py-1.5 font-semibold text-slate-700">
                    {r.label}
                    {r.current && <span className="ml-1 text-xs font-medium text-slate-400">(so far)</span>}
                  </td>
                  <td className="px-3 py-1.5 text-center font-bold text-slate-800">{r.lost}</td>
                  <td className="px-3 py-1.5 text-center font-bold text-slate-800">{r.found}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          {/* Legend doubles as the series toggle: Both / Lost only / Found only */}
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs font-semibold">
            {[
              { key: "both", label: "Lost & Surrendered" },
              { key: "lost", label: "Lost only", color: LOST_COLOR },
              { key: "found", label: "Surrendered only", color: FOUND_COLOR },
            ].map((o) => (
              <button
                key={o.key}
                onClick={() => setSeries(o.key)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 transition ${
                  series === o.key
                    ? "border-[#2D366D] bg-[#2D366D]/5 text-slate-800"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
              >
                {o.color ? (
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: o.color }} />
                ) : (
                  <>
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: LOST_COLOR }} />
                    <span className="-ml-1 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: FOUND_COLOR }} />
                  </>
                )}
                {o.label}
              </button>
            ))}
          </div>
          <GroupedBars rows={rows} series={series} />
        </>
      )}
    </div>
  );
};

export default ComparativeReport;
