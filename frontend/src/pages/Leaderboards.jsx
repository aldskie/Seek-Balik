import React, { useEffect, useState, useRef } from "react";
import { getLeaderboard, getLeaderboardSettings } from "../api/api";
import { useApp } from "../context/AppContext";
import {
  FaInfoCircle,
  FaTimes,
  FaTrophy,
  FaBoxOpen,
  FaHandHolding,
  FaSearch,
} from "react-icons/fa";

// Same month ranges as Leaderboard Control (0 = January ... 11 = December).
// Only used as a fallback: the backend sends the exact semester it is
// counting points for (`period`), so both pages always agree.
const DEFAULT_SEMESTER_CONFIG = {
  firstSem: { startMonth: 7, endMonth: 11 }, // Aug - Dec
  secondSem: { startMonth: 0, endMonth: 4 }, // Jan - May
  shortTerm: { startMonth: 5, endMonth: 6 }, // Jun - Jul
};

const getSchoolYearAndSemFromDate = (dateString, semConfig) => {
  const referenceDate = dateString ? new Date(dateString) : new Date();
  const finalDate = isNaN(referenceDate.getTime()) ? new Date() : referenceDate;

  const year = finalDate.getFullYear();
  const month = finalDate.getMonth();
  const cfg = { ...DEFAULT_SEMESTER_CONFIG, ...(semConfig || {}) };
  const inRange = (m, term) => {
    const start = Number(term?.startMonth);
    const end = Number(term?.endMonth);
    if (Number.isNaN(start) || Number.isNaN(end)) return false;
    return start <= end ? m >= start && m <= end : m >= start || m <= end;
  };

  if (inRange(month, cfg.firstSem)) {
    const startYear = month >= Number(cfg.firstSem.startMonth) ? year : year - 1;
    return { schoolYear: `${startYear}-${startYear + 1}`, sem: "1st Semester" };
  }
  if (inRange(month, cfg.secondSem)) {
    const endYear = month <= Number(cfg.secondSem.endMonth) ? year : year + 1;
    return { schoolYear: `${endYear - 1}-${endYear}`, sem: "2nd Semester" };
  }
  if (inRange(month, cfg.shortTerm)) {
    return { schoolYear: `${year}`, sem: "Short Term" };
  }
  return { schoolYear: `${year}`, sem: "Custom Term" };
};

// "2026-08-01" -> "Aug 1, 2026"
const prettyDay = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// Podium accent styling per rank, kept inside the site's navy/blue palette
// so gold/silver/bronze read as accents rather than a clashing color scheme.
const PODIUM_STYLES = {
  1: {
    ring: "border-2 border-[#F5C451]",
    chip: "bg-[#F5C451] text-[#5B4300]",
    bg: "bg-gradient-to-b from-[#FFF9E9] to-white",
    minH: "min-h-[160px] sm:min-h-[240px]",
  },
  2: {
    ring: "border border-slate-300",
    chip: "bg-slate-300 text-slate-800",
    bg: "bg-slate-50",
    minH: "min-h-[125px] sm:min-h-[190px]",
  },
  3: {
    ring: "border border-[#E3B98C]",
    chip: "bg-[#E3B98C] text-[#5A3A17]",
    bg: "bg-[#FFF6EC]",
    minH: "min-h-[105px] sm:min-h-[160px]",
  },
};

function ScoringInfoPopover() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function handleOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="How leaderboard scoring works"
        className={`flex h-7 w-7 items-center justify-center rounded-full border transition ${
          open
            ? "border-[#0B6FA4] bg-[#EAF6FC] text-[#0B6FA4]"
            : "border-slate-300 text-slate-400 hover:border-[#0B6FA4] hover:text-[#0B6FA4]"
        }`}
      >
        <FaInfoCircle size={14} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[88vw] max-w-sm rounded-2xl border border-[#D8E2EE] bg-white p-5 text-left shadow-xl sm:right-0 sm:w-96">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h4 className="flex items-center gap-1.5 text-sm font-black text-[#163B65]">
                <FaInfoCircle className="text-[#0B6FA4]" size={14} />
                Leaderboard Scoring
              </h4>
              <p className="mt-0.5 text-xs italic text-slate-400">
                How are points earned?
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-slate-300 hover:text-slate-500"
              aria-label="Close"
            >
              <FaTimes size={12} />
            </button>
          </div>

          <ul className="space-y-2 text-xs text-slate-600">
            <li className="flex items-start gap-2">
              <span className="mt-0.5">📦</span>
              <span>
                <span className="font-bold text-slate-800">Surrender (turn in) a found item</span> — earn 8 points per item, credited to you as the finder
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5">🤝</span>
              <span>
                <span className="font-bold text-slate-800">Your surrendered item gets claimed</span> — +2 bonus points, credited to you as the finder
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5">🏆</span>
              <span>Only points earned during the current semester count, so the ranking starts fresh each semester.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5">📊</span>
              <span>The leaderboard is ranked from highest to lowest total points.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5">🔄</span>
              <span>Points and rankings may update periodically as new claims and surrenders are recorded.</span>
            </li>
          </ul>

          <div className="mt-4 rounded-xl bg-[#EAF6FC] px-3 py-2.5 text-[11px] leading-relaxed text-[#0B6FA4]">
            <span className="font-black">Example:</span> You surrender an item (+8), and it's
            later claimed by its owner (+2 bonus):
            8 + 2 ={" "}
            <span className="font-black">10 points</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Leaderboard() {
  const { currentUser } = useApp() || {};
  const [leaders, setLeaders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [leaderboardActive, setLeaderboardActive] = useState(true);

  const [config, setConfig] = useState({ auto_mode: false, open_date: "", semConfig: null });
  // The semester the backend is counting points for:
  // { semester, school_year, start, end }.
  const [period, setPeriod] = useState(null);
  // Search by name or ID number.
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchInitialData();

    const interval = setInterval(fetchLeaderboard, 3000);
    return () => clearInterval(interval);
  }, []);

  const fetchInitialData = async () => {
    try {
      // Kunin muna ang settings para alam kung anong date ang susundin
      const settingsData = await getLeaderboardSettings();
      if (settingsData) {
        setConfig({
          auto_mode: Boolean(settingsData.auto_mode),
          open_date: settingsData.open_date || "",
          semConfig: settingsData.semConfig || null,
        });
        if (settingsData.period) setPeriod(settingsData.period);
      }
    } catch (e) {
      console.error("Failed to load configs:", e);
    }
    await fetchLeaderboard();
    setLoading(false);
  };

  const fetchLeaderboard = async () => {
    try {
      const data = await getLeaderboard();
      if (Array.isArray(data)) {
        setLeaderboardActive(true);
        setLeaders(data);
      } else {
        setLeaderboardActive(Boolean(data.active));
        setLeaders(Array.isArray(data.leaders) ? data.leaders : []);
        if (data.period) setPeriod(data.period);
      }
    } catch (error) {
      console.error("Failed to fetch leaderboard:", error);
      setLeaders([]);
      setLeaderboardActive(false);
    }
  };

  const safeLeaders = Array.isArray(leaders) ? leaders : [];
  const topLeaders = safeLeaders.slice(0, 3);
  const otherLeaders = safeLeaders.slice(3);

  // Title follows the semester months set in Leaderboard Control.
  const fallback = getSchoolYearAndSemFromDate(
    config.auto_mode ? config.open_date : null,
    config.semConfig
  );
  const schoolYear = period?.school_year || fallback.schoolYear;
  const sem = period?.semester || fallback.sem;
  const periodRange =
    period?.start && period?.end ? `${prettyDay(period.start)} – ${prettyDay(period.end)}` : "";

  // Digits-only comparison so "12345678", "12345678@slc-sflu.edu.ph", and
  // any other formatting of the same student ID all match each other.
  const normalizeId = (value) => (value || "").toString().replace(/\D/g, "");

  // The Student ID is the unique identifier for matching the logged-in
  // account to its leaderboard row — unlike full_name, two students can
  // share a name, but never a student ID. The display itself still shows
  // full_name as before; only the "is this me?" comparison changes.
  const myStudentId = normalizeId(
    currentUser?.id_number || currentUser?.student_id || currentUser?.username
  );
  const myFullName = currentUser
    ? `${currentUser.first_name || ""} ${currentUser.last_name || ""}`
        .trim()
        .toLowerCase()
    : "";

  const isMe = (leader) => {
    const leaderId = normalizeId(leader.student_id);
    if (myStudentId && leaderId) {
      return myStudentId === leaderId;
    }
    // Fallback for rows/accounts missing a student ID on either side.
    return (
      !!myFullName &&
      !!leader.full_name &&
      leader.full_name.trim().toLowerCase() === myFullName
    );
  };

  // One row in "Other Rankings" (also used for search results).
  const renderRankRow = (leader, rank) => {
    const mine = isMe(leader);
    return (
        <div
          key={leader.id}
          className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 transition sm:gap-4 ${
            mine
              ? "border-[#0B6FA4] bg-[#EAF6FC] ring-1 ring-[#0B6FA4]/30"
              : "border-slate-200 bg-[#F8FAFC] hover:border-[#0B6FA4]/40 hover:bg-white"
          }`}
        >
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${
              mine
                ? "bg-[#0B6FA4] text-white"
                : "bg-slate-200 text-slate-600"
            }`}
          >
            {rank}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-bold text-slate-800">
                {leader.full_name}
              </p>
              {mine && (
                <span className="shrink-0 rounded-full bg-[#0B6FA4] px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
                  You
                </span>
              )}
            </div>
            <p className="truncate text-[11px] text-slate-400">
              ID: {normalizeId(leader.id_number || leader.student_id) || "—"}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 text-sm font-black text-[#0B6FA4]">
            <FaHandHolding className="hidden text-slate-300 sm:block" size={11} />
            {leader.points}
            <span className="text-[10px] font-bold uppercase text-slate-400">
              pts
            </span>
          </div>
        </div>
    );
  };

  // Search results keep each person's real rank.
  const searchTerm = search.trim().toLowerCase();
  const searchDigits = searchTerm.replace(/\D/g, "");
  const searchResults = searchTerm
    ? safeLeaders
        .map((leader, index) => ({ leader, rank: index + 1 }))
        .filter(({ leader }) =>
          String(leader.full_name || "").toLowerCase().includes(searchTerm) ||
          (searchDigits.length > 0 &&
            normalizeId(leader.id_number || leader.student_id).includes(searchDigits))
        )
    : [];

  // Podium is rendered in visual order 2nd, 1st, 3rd (1st in the middle,
  // tallest bar), but each cell still needs to know its real rank.
  const podiumOrder = [
    { leader: topLeaders[1], rank: 2 },
    { leader: topLeaders[0], rank: 1 },
    { leader: topLeaders[2], rank: 3 },
  ];

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-6">
      <div className="mb-6 flex flex-col items-center gap-2 text-center sm:flex-row sm:items-start sm:justify-center sm:gap-3">
        <div>
          <h2 className="text-2xl font-black text-[#163B65] sm:text-3xl">
            Honest Finders Leaderboard for SY {schoolYear} ({sem})
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Ranked by surrender and claim points earned this semester
            {periodRange && <span className="font-semibold text-slate-600"> ({periodRange})</span>}
          </p>
        </div>
        <div className="mt-1 sm:mt-1.5">
          <ScoringInfoPopover />
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-400">
          Loading leaderboard...
        </div>
      ) : safeLeaders.length === 0 ? (
        <div className="px-4 py-20 text-center">
          <h3 className="text-lg font-bold text-slate-600">
            Leaderboard is currently closed.
          </h3>
          <p className="mt-2 text-slate-400">
            The leaderboard for SY {schoolYear} ({sem}) is inactive. Please wait for the administrator to open the scoring window.
          </p>
        </div>
      ) : (
        <>
        <div className="mx-auto mb-6 max-w-xl">
          <div className="relative">
            <FaSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or ID number..."
              aria-label="Search the leaderboard"
              className="w-full rounded-full border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-800 shadow-sm outline-none placeholder:text-slate-400 focus:border-[#0B6FA4] focus:ring-2 focus:ring-[#0B6FA4]/15"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:text-slate-700"
              >
                <FaTimes size={12} />
              </button>
            )}
          </div>
        </div>

        {searchTerm ? (
          <section className="mx-auto max-w-3xl">
            <div className="mb-4 flex items-center justify-center gap-2">
              <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-[#163B65]">
                <FaSearch className="text-[#0B6FA4]" size={12} />
                Search Results
              </h3>
              <span className="w-fit rounded-full bg-[#EAF6FC] px-3 py-1 text-xs font-bold text-[#0B6FA4]">
                {searchResults.length} found
              </span>
            </div>
            {searchResults.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-400">
                No one on the leaderboard matches "{search.trim()}".
              </div>
            ) : (
              <div className="space-y-2">
                {searchResults.map(({ leader, rank }) => renderRankRow(leader, rank))}
              </div>
            )}
          </section>
        ) : (
        <div className="grid gap-8 lg:grid-cols-5 lg:items-start">
          {/* LEFT — TOP 3 PODIUM (1st in the middle, tallest bar) */}
          <section className="lg:col-span-2">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-[#163B65]">
                <FaTrophy className="text-[#F5C451]" size={14} />
                Top {Math.min(safeLeaders.length, 3)}
              </h3>
              <span className="w-fit rounded-full bg-[#EAF6FC] px-3 py-1 text-xs font-bold text-[#0B6FA4]">
                {safeLeaders.length} ranked
              </span>
            </div>

            <div className="grid grid-cols-3 items-end gap-2 sm:gap-3">
              {podiumOrder.map(({ leader, rank }) => {
                const style = PODIUM_STYLES[rank];

                if (!leader) return <div key={rank} />;

                const mine = isMe(leader);

                return (
                  <div
                    key={leader.id}
                    className={`flex flex-col justify-between rounded-t-2xl p-2 text-center transition sm:rounded-t-3xl sm:p-4 ${style.minH} ${style.bg} ${
                      mine
                        ? "border-2 border-[#0B6FA4] ring-2 ring-[#0B6FA4]/25"
                        : style.ring
                    } ${rank === 1 ? "shadow-md" : ""}`}
                  >
                    <div className="min-w-0">
                      <div
                        className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-black sm:h-12 sm:w-12 sm:text-lg ${style.chip}`}
                      >
                        {rank}
                      </div>
                      <p className="mt-2 line-clamp-2 break-words text-[10px] font-black leading-tight text-slate-900 sm:mt-3 sm:text-sm">
                        {leader.full_name}
                      </p>
                      <p className="mt-0.5 truncate text-[9px] font-semibold text-slate-400 sm:text-[11px]">
                        ID: {normalizeId(leader.id_number || leader.student_id) || "—"}
                      </p>
                      {mine && (
                        <span className="mt-1 inline-block rounded-full bg-[#0B6FA4] px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-white sm:text-[9px]">
                          You
                        </span>
                      )}
                    </div>

                    <div className="mt-2 rounded-lg bg-white/90 py-1 text-[10px] font-black text-[#0B6FA4] sm:rounded-xl sm:py-2 sm:text-sm">
                      {leader.points}
                      <span className="ml-1 text-[8px] font-bold uppercase text-slate-400 sm:text-[10px]">
                        pts
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* RIGHT — OTHER RANKINGS, laid out as-is (no wrapping card) */}
          <section className="lg:col-span-3">
            <div className="mb-4 flex items-center justify-center gap-2">
              <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-[#163B65]">
                <FaBoxOpen className="text-[#0B6FA4]" size={13} />
                Other Rankings
              </h3>
              {otherLeaders.length > 0 && (
                <span className="w-fit rounded-full bg-[#EAF6FC] px-3 py-1 text-xs font-bold text-[#0B6FA4]">
                  Rank 4+
                </span>
              )}
            </div>

            {otherLeaders.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-400">
                No other rankings yet
              </div>
            ) : (
              <div className="space-y-2">
                {otherLeaders.map((leader, index) => renderRankRow(leader, index + 4))}
              </div>
            )}
          </section>
        </div>
        )}
        </>
      )}
    </div>
  );
}

export default Leaderboard;
