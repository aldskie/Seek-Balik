import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Marker,
  Popup,
  Tooltip as LeafletTooltip,
  ZoomControl,
  AttributionControl,
  useMap,
  useMapEvents
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  FaExclamationCircle,
  FaCheckCircle,
  FaBox,
  FaBoxOpen,
  FaTag,
  FaUsers,
  FaShieldAlt,
  FaStar,
  FaHeartbeat,
  FaMapMarkerAlt,
  FaAward,
  FaChevronLeft,
  FaChevronRight,
  FaUserClock,
  FaTimes,
  FaCalendarAlt,
  FaClock,
  FaMap,
  FaCrosshairs,
  FaUniversity,
  FaWalking,
  FaLayerGroup,
  FaDoorOpen,
  FaInfoCircle,
  FaCompass,
  FaHistory,
  FaPlusCircle,
  FaTimesCircle,
  FaTrashAlt,
  FaPen,
  FaHandshake,
  FaCalendarCheck,
  FaSignInAlt,
  FaArrowRight
} from 'react-icons/fa';
import { getItems, getUsers, getClaims } from '../api/api';
import { getActivityLogsLocal, ACTIVITY_LOG_UPDATE_EVENT } from '../utils/Activitylog';

// How often the dashboard re-fetches (ms). Matches the 3s polling used by
// LostItems.jsx / FoundItems.jsx / Reports.jsx so all pages update together.
const POLL_INTERVAL_MS = 3000;

// Every building circle on the map uses this same radius.
const MARKER_RADIUS = 14;

// ================= HELPERS & UTILS =================

const statusColor = (s) =>
  s === 'Claimed'  ? 'bg-purple-50 text-purple-600 border border-purple-100' :
  s === 'Pending'  ? 'bg-orange-50 text-orange-600 border border-orange-100' :
  s === 'Approved' ? 'bg-green-50 text-green-600 border border-green-100'  :
  'bg-slate-100 text-slate-500 border border-slate-200';

const claimantLabel = (claim) => claim.claimant_name || 'Unnamed claimant';

const parseTimeRangeStart = (timeRange) => {
  if (!timeRange) return null;

  const startStr = timeRange.split('-')[0].trim();
  const match = startStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;

  let [, hh, mm, meridiem] = match;
  hh = parseInt(hh, 10);
  mm = parseInt(mm, 10);

  if (/PM/i.test(meridiem) && hh !== 12) hh += 12;
  if (/AM/i.test(meridiem) && hh === 12) hh = 0;

  return { hours: hh, minutes: mm };
};

const getScheduleDate = (claim) => {
  if (claim.meeting_date) {
    const base = new Date(`${claim.meeting_date}T00:00:00`);
    if (!isNaN(base.getTime())) {
      const time = parseTimeRangeStart(claim.meeting_time);
      if (time) base.setHours(time.hours, time.minutes, 0, 0);
      return base;
    }
  }

  const raw =
    claim.scheduled_date ||
    claim.scheduledDate ||
    claim.meetingDate ||
    claim.schedule_date ||
    claim.scheduleDate ||
    claim.appointment_date ||
    claim.appointmentDate;

  if (!raw) return null;

  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
};

// ==========================================================
// STAFF-CONFIRMED SCHEDULE CHECK
//
// A claim can end up with a meeting_date/meeting_time two different
// ways:
//   1. The claimant self-picks a slot during submission (ClaimModal.jsx),
//      which only happens when their ownership-verification answers
//      matched the recorded answer — no staff involvement at all.
//   2. A moderator/admin explicitly reviews the claim in
//      ClaimRequests.jsx and walks it through "Continue to Schedule" →
//      "Confirm Schedule" (see that file's `send()` function).
//
// This dashboard calendar should only highlight case #2 — meetings a
// human staff member actually reviewed and locked in — not every claim
// that happens to have a date/time on it. `send()` in ClaimRequests.jsx
// tags the claim with `staff_scheduled: true` when it calls
// scheduleMeeting(), so that flag is what this checks for.
//
// ASSUMPTION: the backend's scheduleMeeting endpoint/serializer accepts
// and persists `staff_scheduled`, and returns it on claim objects from
// getClaims(). If your backend already exposes an equivalent field
// under a different name, update the checks below to match it instead.
// ==========================================================

const isStaffConfirmedSchedule = (claim) =>
  !!claim && (claim.staff_scheduled === true || claim.staffScheduled === true);

const ACTIVITY_META = {
  created: { label: 'Created', icon: FaPlusCircle, className: 'bg-blue-50 text-blue-600 border border-blue-100' },
  approved: { label: 'Approved', icon: FaCheckCircle, className: 'bg-green-50 text-green-600 border border-green-100' },
  declined: { label: 'Declined', icon: FaTimesCircle, className: 'bg-orange-50 text-orange-600 border border-orange-100' },
  claimed: { label: 'Claimed', icon: FaHandshake, className: 'bg-purple-50 text-purple-600 border border-purple-100' },
  updated: { label: 'Updated', icon: FaPen, className: 'bg-slate-100 text-slate-600 border border-slate-200' },
  deleted: { label: 'Deleted', icon: FaTrashAlt, className: 'bg-red-50 text-red-600 border border-red-100' },
  scheduled: { label: 'Scheduled', icon: FaCalendarCheck, className: 'bg-cyan-50 text-cyan-600 border border-cyan-100' },
  login: { label: 'Login', icon: FaSignInAlt, className: 'bg-indigo-50 text-indigo-600 border border-indigo-100' },
};

const activityMeta = (action) =>
  ACTIVITY_META[(action || '').toLowerCase()] || {
    label: action || 'Activity',
    icon: FaHistory,
    className: 'bg-slate-100 text-slate-600 border border-slate-200',
  };

function formatRelativeTime(dateInput) {
  if (!dateInput) return '-';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '-';

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHr = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHr / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin} min${diffMin === 1 ? '' : 's'} ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? '' : 's'} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ================= STAT CARD =================

const StatCard = ({ label, count, icon: Icon, color, bgColor, description }) => (
  <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 group relative flex flex-col justify-between overflow-hidden">
    <div className={`absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.07] transition-all duration-500 transform group-hover:scale-125 group-hover:-rotate-12 text-slate-900`}>
      <Icon size={120} />
    </div>

    <div className="flex justify-between items-start relative z-10">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-1.5">{label}</p>
        <h3 className="text-3xl font-black text-slate-800 tracking-tight font-sans">{count}</h3>
      </div>
      <div className={`${bgColor} ${color} p-3 rounded-2xl shadow-sm border border-white/50 group-hover:scale-110 transition-transform duration-300`}>
        <Icon size={20} className="stroke-[2.5]" />
      </div>
    </div>

    <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between relative z-10">
      <span className="text-[11px] font-medium text-slate-400 tracking-wide w-full">{description}</span>
    </div>
  </div>
);

// ================= CAMPUS BUILDINGS (Leaflet) =================
//
// These used to be SVG polygons on a hand-drawn schematic. They're now
// plotted on a real Leaflet map. Real GPS coordinates aren't wired up yet,
// so each building falls back to an auto-generated point near
// CAMPUS_CENTER, laid out using the same relative positions the old
// schematic used (labelX/labelY), so the map's overall layout still looks
// roughly right until real coordinates are added.
//
// To use real coordinates: add an entry to REAL_COORDINATES keyed by the
// building's `id`, e.g. `1: { lat: 16.6152, lng: 120.3212 }`. Any building
// without an entry keeps using its auto-placed placeholder position.

// Saint Louis College of San Fernando, La Union — Carlatan, San Fernando, La Union, Philippines
// (16°38'12"N 120°18'48"E, per the school's own published coordinates —
// cross-checked against Google Places, which puts the campus pin at
// 16.6374683, 120.3128374, ~15m away. Both agree, so this is treated as
// the verified campus anchor.)
const CAMPUS_CENTER = { lat: 16.63673, lng: 120.31321 };
const COORD_SCALE = 0.00006; // degrees per old SVG unit — raise/lower to spread markers further apart/closer together

// Verified campus landmark — shown as a distinct labeled pin on the map
// so it's immediately clear which school this hotspot map belongs to.
const SLC_LANDMARK = {
  name: 'Saint Louis College',
  subtitle: 'San Fernando, La Union',
  lat: CAMPUS_CENTER.lat,
  lng: CAMPUS_CENTER.lng,
  mapsUrl: 'https://maps.google.com/?cid=9972838631775129005',
};

// Custom divIcon for the SLC landmark pin so it reads differently from
// the numbered building CircleMarkers (a labeled pill instead of a dot).
const slcIcon = L.divIcon({
  className: 'slc-landmark-icon',
  html: `
    <div style="
      display:flex; align-items:center; gap:6px;
      background:#0B6FA4; color:#fff; font-weight:900;
      font-size:11px; padding:5px 10px; border-radius:999px;
      box-shadow:0 2px 8px rgba(0,0,0,0.35); white-space:nowrap;
      border:2px solid #fff; transform: translate(-50%, -130%);
    ">
      📍 Saint Louis College
    </div>
  `,
  iconSize: [0, 0], // sizing handled by the inline styles above
});

// Derived from the user-supplied numbered satellite reference photo.
// Method: two points were independently verified via Google Places —
// the official "Saint Louis College La Union" pin (CAMPUS_CENTER) and
// "SLC Gymnasium" (#6, 16.636109, 120.3133693). Their pixel positions in
// the reference photo were used to solve a 2D similarity transform
// (uniform scale + rotation) from photo-pixel space to lat/lng, which was
// then applied to every other numbered pin's pixel position in the same
// photo. This is photo-calibrated, not individually GPS-surveyed per
// building — accurate enough to place each roof correctly relative to
// the two verified anchors, but not survey-grade. Replace any entry here
// with a real "copy coordinates" pin from Google Maps satellite for
// exact precision.
const REAL_COORDINATES = {
  1:  { lat: 16.636728, lng: 120.312682 }, // Grandstand
  2:  { lat: 16.637054, lng: 120.312432 }, // Verbist Building
  3:  { lat: 16.637191, lng: 120.312961 }, // Transfiguration of the Lord Chapel
  4:  { lat: 16.636619, lng: 120.313037 }, // Admin Bldg
  5:  { lat: 16.636802, lng: 120.313443 }, // Mission Library
  6:  { lat: 16.636110, lng: 120.313369 }, // Fr. Burgos Gymnasium — verified anchor
  7:  { lat: 16.636164, lng: 120.313630 }, // ICT Center
  8:  { lat: 16.636562, lng: 120.313948 }, // New Building (C)
  9:  { lat: 16.637145, lng: 120.313920 }, // New Elem Bldg
  10: { lat: 16.637480, lng: 120.313833 }, // SLC Canteen
  11: { lat: 16.637739, lng: 120.313819 }, // Old Elem (E)
  12: { lat: 16.638038, lng: 120.313798 }, // Sports Center
  13: { lat: 16.637693, lng: 120.313277 }, // SHS Dept Bldg
  14: { lat: 16.637518, lng: 120.313215 }, // HM Lab Bldg
  15: { lat: 16.636268, lng: 120.312908 }, // Main Parking Area
  16: { lat: 16.636311, lng: 120.313174 }, // SAO Lobby
};

const SLC_CSC_BUILDINGS = [
  // Named "Grandstand" — the same name staff and students pick in the
  // Area dropdowns (it used to show as "Guardhouse", which confused people).
  { id: 1, name: "Grandstand", shortName: "Grandstand", num: "1", labelX: 332, labelY: 377},
  { id: 2, name: "(V) Verbist Building", shortName: "Verbist Bldg", num: "2", labelX: 195, labelY: 430},
  { id: 3, name: "Transfiguration of the Lord Chapel", shortName: "SLC Chapel", num: "3", labelX: 202, labelY: 290},
  { id: 4, name: "Fr. Alfred Spincemaille, CICM (Admin Bldg)", shortName: "Admin Bldg", num: "4", labelX: 452, labelY: 262},
  { id: 5, name: "Gerard De Boeck Mission Library", shortName: "Mission Library", num: "5", labelX: 452, labelY: 180},
  { id: 6, name: "Fr. Burgos Gymnasium", shortName: "Burgos Gym", num: "6", labelX: 667, labelY: 255 },
  { id: 7, name: "(B) ICT Center", shortName: "ICT Center", num: "7", labelX: 670, labelY: 192},
  { id: 8, name: "(C) New Building", shortName: "New Building (C)", num: "8", labelX: 540, labelY: 65},
  { id: 9, name: "New Elementary Building", shortName: "New Elem Bldg", num: "9", labelX: 340, labelY: 55},
  { id: 10, name: "SLC Canteen", shortName: "SLC Canteen", num: "10", labelX: 235, labelY: 67},
  { id: 11, name: "(E) Bishop Wenceslao Padilla, CICM (Old Elem)", shortName: "Old Elem (E)", num: "11", labelX: 170, labelY: 65},
  { id: 12, name: "Conrado Dela Cruz Sports Center", shortName: "Sports Center", num: "12", labelX: 80, labelY: 40},
  { id: 13, name: "Fr. Roger Bruno Eduard Tjolle, CICM (SHS Bldg)", shortName: "SHS Dept Bldg", num: "13", labelX: 125, labelY: 205},
  { id: 14, name: "Rev. Fr. Clement Daelman, CICM (HM Lab)", shortName: "HM Lab Bldg", num: "14", labelX: 122, labelY: 255},
  { id: 15, name: "Main Parking Area", shortName: "Parking Area", num: "15", labelX: 475, labelY: 352 },
  { id: 16, name: "SAO Lobby", shortName: "SAO Lobby", num: "16", labelX: 592, labelY: 250 }
];

// Turns a building's old schematic (labelX, labelY) into a lat/lng near
// CAMPUS_CENTER, unless a real coordinate has been provided above.
function getBuildingCoords(building) {
  if (REAL_COORDINATES[building.id]) return REAL_COORDINATES[building.id];

  const dx = building.labelX - 390; // 390 ≈ half of the old 780-wide viewBox
  const dy = building.labelY - 250; // 250 ≈ half of the old 500-tall viewBox

  return {
    lat: CAMPUS_CENTER.lat - dy * COORD_SCALE, // SVG y grows downward; latitude grows northward, so subtract
    lng: CAMPUS_CENTER.lng + dx * COORD_SCALE,
  };
}

const getHotspotColor = (count) => {
  if (count >= 5) return '#ef4444'; // Red (High Hotspot)
  if (count >= 3) return '#f97316'; // Orange (Medium Hotspot)
  if (count >= 1) return '#eab308'; // Yellow (Low Hotspot)
  return '#22c55e';                 // Green (0 Reports / Safe)
};

// ─── Location → map building ────────────────────────────────────────────────
// The Area dropdowns in LostItems.jsx / FoundItems.jsx submit these exact
// labels, and each one belongs to a building pin on the map. Keys are the
// lowercase form labels; values are the SLC_CSC_BUILDINGS ids.
//
// "Others" has no pin on the map, so items there
// are NOT counted on any building (they are reported separately under the
// map as "not shown on the map").
const FORM_LABEL_TO_BUILDING = {
  'grandstand': 1,
  'verbist building': 2,
  'chapel': 3,
  'administrative building (main building)': 4,
  'library': 5,
  'gymnasium': 6,
  'ict center': 7,
  'new building (cea building)': 8,
  'new elementary building': 9,
  'slc canteen': 10,
  'old elementary building': 11,
  'conrado dela cruz sports center (cdc)': 12,
  'senior high school department building': 13,
  'hm laboratory building': 14,
  'student affairs office lobby': 16,
  'sao lobby': 16, // older public reports saved this short name
  'canteen': 10 // older moderator reports saved "Canteen"
};

// Also accept a building's own full/short name (e.g. "Main Parking Area").
const BUILDING_LOOKUP = (() => {
  const lookup = {};
  SLC_CSC_BUILDINGS.forEach((b) => {
    lookup[b.name.toLowerCase()] = b.id;
    lookup[b.shortName.toLowerCase()] = b.id;
  });
  return { ...lookup, ...FORM_LABEL_TO_BUILDING };
})();

// A lost report can hold several areas in one comma-separated string
// (e.g. "Library, Chapel"). Returns the de-duplicated building ids it maps
// to — empty when none of the areas has a pin on the map.
function resolveBuildingIds(rawLocation) {
  const ids = new Set();
  String(rawLocation || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .forEach((part) => {
      const id = BUILDING_LOOKUP[part];
      if (id) ids.add(id);
    });
  return [...ids];
}

// Item type / status helpers (case-insensitive, like the other pages).
const itemKind = (item) => {
  const t = (item?.type || '').trim().toUpperCase();
  if (t === 'LOST') return 'lost';
  if (t === 'SURRENDERED' || t === 'FOUND') return 'surrendered';
  return null;
};

const isClaimedItem = (item) =>
  (item?.status || '').trim().toUpperCase() === 'CLAIMED';

// Builds the live per-building tallies from the current items list.
// Everything on the map (colors, counts, hotspot, modal) comes from this, so
// each poll of getItems() updates the whole map.
//   lost        = Lost reports at the building
//   surrendered = Found (Surrendered) items at the building
//   claimed     = items there whose status is Claimed
//   total       = lost + surrendered (drives the marker color)
function computeBuildingStats(items = []) {
  const byId = {};

  SLC_CSC_BUILDINGS.forEach((b) => {
    byId[b.id] = {
      ...b,
      ...getBuildingCoords(b),
      total: 0,
      lost: 0,
      surrendered: 0,
      claimed: 0,
      items: []
    };
  });

  const unmapped = { total: 0, lost: 0, surrendered: 0, claimed: 0 };

  items.forEach((item) => {
    const kind = itemKind(item);
    if (!kind) return;

    const claimed = isClaimedItem(item);
    const ids = resolveBuildingIds(item.location);

    if (ids.length === 0) {
      unmapped.total += 1;
      unmapped[kind] += 1;
      if (claimed) unmapped.claimed += 1;
      return;
    }

    ids.forEach((id) => {
      const stat = byId[id];
      if (!stat) return;
      stat.total += 1;
      stat[kind] += 1;
      if (claimed) stat.claimed += 1;
      stat.items.push(item);
    });
  });

  const list = Object.values(byId);
  const ranked = [...list].sort((a, b) => b.lost - a.lost || b.total - a.total);
  const topLost = ranked.find((b) => b.lost > 0) || null;

  return { byId, list, unmapped, topLost };
}

// Fits the map's viewport to whatever markers currently exist, once on
// mount (and whenever the marker set changes size).
const FitToMarkers = ({ points }) => {
  const map = useMap();

  useEffect(() => {
    if (!points || points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 17);
      return;
    }
    const bounds = points.map((p) => [p.lat, p.lng]);
    map.fitBounds(bounds, { padding: [40, 40] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length]);

  return null;
};

// Building names overlap when the whole campus is in view, so they are only
// all shown once zoomed in this far; otherwise just the hovered / selected
// building's name shows.
const LABEL_MIN_ZOOM = 19;

const ZoomWatcher = ({ onZoom }) => {
  const map = useMapEvents({
    zoomend: () => onZoom(map.getZoom()),
  });
  useEffect(() => {
    onZoom(map.getZoom());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};

const HotspotMap = ({ items = [] }) => {
  const [selectedBuilding, setSelectedBuilding] = useState(null);
  const [zoom, setZoom] = useState(17);
  const [hoveredId, setHoveredId] = useState(null);
  const showAllLabels = zoom >= LABEL_MIN_ZOOM;

  const stats = useMemo(() => computeBuildingStats(items), [items]);
  const buildingStats = stats.byId;

  // Rooftop label icons (building name only) — built once, since the names
  // never change.
  const roofIcons = useMemo(() => {
    const icons = {};
    SLC_CSC_BUILDINGS.forEach((b) => {
      icons[b.id] = L.divIcon({
        className: 'building-roof-label',
        html: `<div class="building-roof-label-text">${b.shortName}</div>`,
        iconSize: [0, 0],
        iconAnchor: [-14, 26],
      });
    });
    return icons;
  }, []);

  const markerPoints = useMemo(
    () => stats.list.map((b) => ({ lat: b.lat, lng: b.lng })),
    [stats]
  );

  const topHotspot = stats.topLost;
  const topHotspotLabel = topHotspot ? `#${topHotspot.num} ${topHotspot.shortName}` : 'None';

  const selectedStat = selectedBuilding ? buildingStats[selectedBuilding.id] : null;

  return (
    <div className="bg-white w-full rounded-3xl border border-slate-200/80 p-5 shadow-sm relative flex flex-col justify-between">
      {/* Small inline styles for Leaflet marker labels & popups, since this
          is a single-file component with no separate stylesheet. */}
      <style>{`
        .building-marker-label {
          background: transparent;
          border: none;
          box-shadow: none;
          color: #ffffff;
          font-weight: 900;
          font-size: 11px;
          text-shadow: 0 1px 2px rgba(0,0,0,0.6);
        }
        .building-marker-label::before { display: none; }
        .building-roof-label {
          background: transparent;
          border: none;
          box-shadow: none;
          pointer-events: none;
        }
        .building-roof-label::before { display: none; }
        .leaflet-control-attribution {
          font-size: 8px !important;
          line-height: 1.3;
          background: rgba(255,255,255,0.6) !important;
          color: #64748b;
        }
        .building-roof-label-text {
          color: #ffffff;
          font-weight: 800;
          font-size: 11px;
          line-height: 1.2;
          text-align: left;
          text-shadow:
            -1px -1px 0 rgba(0,0,0,0.85),
             1px -1px 0 rgba(0,0,0,0.85),
            -1px  1px 0 rgba(0,0,0,0.85),
             1px  1px 0 rgba(0,0,0,0.85),
             0 1px 3px rgba(0,0,0,0.6);
          white-space: nowrap;
        }
        .slc-landmark-icon { background: transparent; border: none; }
        .leaflet-container { font-family: inherit; }
      `}</style>

      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0B6FA4] flex items-center gap-1.5">
              <FaUniversity size={12} /> Campus Hotspot Map
            </h3>
            <p className="text-xs font-bold text-slate-800 mt-0.5">
              Saint Louis College
            </p>
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <div className="rounded-full bg-rose-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-rose-600 flex items-center gap-1.5 border border-rose-100">
              <FaCrosshairs size={10} className="animate-pulse" />
              Hotspot: {topHotspotLabel}
            </div>

            <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Live
            </div>
          </div>
        </div>

        {/* Leaflet Map Container */}
        <div className="mt-3 relative z-0 w-full h-[380px] bg-[#f8fafc] rounded-2xl overflow-hidden border border-slate-300/80 shadow-inner">
          <MapContainer
            center={[CAMPUS_CENTER.lat, CAMPUS_CENTER.lng]}
            zoom={17}
            zoomControl={false}
            attributionControl={false}
            scrollWheelZoom
            style={{ width: '100%', height: '100%' }}
          >
            {/* Satellite base layer (Esri World Imagery — free, no API key)
                so buildings show as real rooftops, like Google's satellite
                view, instead of an OSM street map. */}
            <TileLayer
              attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
            {/* Credits at the top so the color legend no longer covers them. */}
            <AttributionControl position="topleft" prefix={false} />
            <ZoomWatcher onZoom={setZoom} />
            {/* Thin label/road overlay on top of the imagery, so street
                names still read the way they do in Google's hybrid view. */}
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
              opacity={0.9}
            />
            <ZoomControl position="topright" />
            <FitToMarkers points={markerPoints} />

            {/* Clearly labeled campus landmark pin — verified against
                Google Places and the school's published coordinates. */}
            <Marker position={[SLC_LANDMARK.lat, SLC_LANDMARK.lng]} icon={slcIcon}>
              <LeafletTooltip direction="top" offset={[0, -20]}>
                {SLC_LANDMARK.name}
              </LeafletTooltip>
              <Popup>
                <div style={{ fontSize: 12, fontWeight: 700 }}>
                  {SLC_LANDMARK.name}
                  <br />
                  <span style={{ fontWeight: 400, color: '#64748b' }}>
                    {SLC_LANDMARK.subtitle}
                  </span>
                  <br />
                  <a
                    href={SLC_LANDMARK.mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#0B6FA4', fontWeight: 700 }}
                  >
                    Open in Google Maps →
                  </a>
                </div>
              </Popup>
            </Marker>

            {stats.list.map((b) => {
              // Color follows lost + found at this building. Every circle
              // is the same size; only the color changes.
              const buildingFillColor = getHotspotColor(b.total);
              const isSelected = selectedBuilding?.id === b.id;

              return (
                <React.Fragment key={`bldg-${b.id}`}>
                  {/* Numbered dot — click for the full stats modal */}
                  <CircleMarker
                    center={[b.lat, b.lng]}
                    radius={MARKER_RADIUS}
                    pathOptions={{
                      fillColor: buildingFillColor,
                      fillOpacity: 0.9,
                      color: isSelected ? '#000000' : '#ffffff',
                      weight: isSelected ? 3 : 1.5,
                    }}
                    eventHandlers={{
                      click: () => setSelectedBuilding(b),
                      mouseover: () => setHoveredId(b.id),
                      mouseout: () => setHoveredId((id) => (id === b.id ? null : id)),
                    }}
                  >
                    <LeafletTooltip
                      permanent
                      direction="center"
                      className="building-marker-label"
                    >
                      {b.num}
                    </LeafletTooltip>
                  </CircleMarker>

                  {/* Rooftop name label: all of them when zoomed in, otherwise
                      only the building under the mouse or the selected one. */}
                  {(showAllLabels || hoveredId === b.id || isSelected) && (
                    <Marker
                      position={[b.lat, b.lng]}
                      icon={roofIcons[b.id]}
                      interactive={false}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </MapContainer>

          {/* Footer Legend */}
          <div className="absolute bottom-2 left-3 right-3 flex justify-between items-center text-[9px] text-slate-700 font-bold bg-white/95 backdrop-blur px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-sm pointer-events-none z-[1000]">
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#22c55e]" /> None (0)</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#eab308]" /> Low (1-2)</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#f97316]" /> Mild (3-4)</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]" /> High (5+)</span>
            </span>
            <span className="flex items-center gap-2">
              <span className="text-slate-500 font-semibold">
                {showAllLabels ? "Click a pin for details" : "Point at a pin for its name · zoom in to see all"}
              </span>
            </span>
          </div>
        </div>

        {/* Items whose area has no pin on the map (e.g. "Others") — shown here instead of being counted
            under the wrong building. */}
        {stats.unmapped.total > 0 && (
          <p className="mt-3 text-[11px] font-semibold text-slate-400">
            {stats.unmapped.total} {stats.unmapped.total === 1 ? 'item is' : 'items are'} at locations not shown on the map
            ({stats.unmapped.lost} lost · {stats.unmapped.surrendered} surrendered · {stats.unmapped.claimed} claimed).
          </p>
        )}
      </div>

      {/* Details Modal — this is where clicking a building shows how many
          items were reported Lost, how many were Surrendered, and
          how many have been Claimed at that location, plus the underlying
          list of items. It reads from the live stats, so numbers change
          while it's open. */}
      {selectedBuilding && selectedStat && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
        >
          <div
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-150 relative"
          >
            <button
              onClick={() => setSelectedBuilding(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors"
            >
              <FaTimes size={14} />
            </button>

            <div className="flex items-center gap-3.5 mb-5">
              <span
                className="w-12 h-12 rounded-2xl text-white font-black text-xl flex items-center justify-center shadow-md shrink-0"
                style={{ backgroundColor: getHotspotColor(selectedStat.total) }}
              >
                {selectedBuilding.num}
              </span>
              <div>
                <h4 className="font-bold text-slate-900 text-base leading-tight">
                  {selectedBuilding.name}
                </h4>
                <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600">
                  {selectedStat.total} {selectedStat.total === 1 ? 'report' : 'reports'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5 my-4">
              <div className="bg-rose-50 border border-rose-100 rounded-2xl p-3 text-center">
                <span className="block text-2xl font-black text-rose-600">
                  {selectedStat.lost}
                </span>
                <span className="text-[10px] uppercase font-extrabold text-rose-500 tracking-wider">
                  Lost
                </span>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 text-center">
                <span className="block text-2xl font-black text-amber-600">
                  {selectedStat.surrendered}
                </span>
                <span className="text-[10px] uppercase font-extrabold text-amber-500 tracking-wider">
                  Surrendered
                </span>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 text-center">
                <span className="block text-2xl font-black text-emerald-600">
                  {selectedStat.claimed}
                </span>
                <span className="text-[10px] uppercase font-extrabold text-emerald-500 tracking-wider">
                  Claimed
                </span>
              </div>
            </div>

            <div className="mt-5">
              <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                <FaBoxOpen size={13} className="text-slate-400" />
                Reported Items ({selectedStat.items.length})
              </h5>

              <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                {selectedStat.items.length > 0 ? (
                  selectedStat.items.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <FaTag className="text-slate-400 shrink-0" size={10} />
                        <span className="font-semibold text-slate-800 truncate">{item.title || item.name || "Item"}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {isClaimedItem(item) && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-700">
                            Claimed
                          </span>
                        )}
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          itemKind(item) === 'lost' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {itemKind(item) === 'lost' ? 'Lost' : 'Surrendered'}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400 italic text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    No items reported at this location.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ================= CLAIM SCHEDULE CALENDAR =================

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const dateKeyFor = (year, month, day) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

// ==========================================================
// MEETING OUTCOME (calendar)
// Where each staff-scheduled meeting stands now, from the claim's
// status (Claim Requests / backend) and its item's status (Found Items).
// `open` = still waiting for the meeting to happen.
// ==========================================================
const MEETING_OUTCOMES = {
  upcoming: { label: 'Upcoming', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', open: true },
  today: { label: 'Today', className: 'bg-indigo-50 text-indigo-700 border-indigo-200', open: true },
  released: { label: 'Released to Claimant', className: 'bg-purple-50 text-purple-700 border-purple-200', open: false },
  notOwner: { label: 'Not the Owner', className: 'bg-rose-50 text-rose-700 border-rose-200', open: false },
  declined: { label: 'Declined', className: 'bg-rose-50 text-rose-700 border-rose-200', open: false },
  closed: { label: 'Closed (released to another claimant)', className: 'bg-slate-100 text-slate-600 border-slate-200', open: false },
  missed: { label: 'Missed (No-show)', className: 'bg-amber-50 text-amber-700 border-amber-200', open: false },
};

const getMeetingOutcome = (claim) => {
  const status = String(claim?.status || '').trim().toLowerCase();
  const itemStatus = String(claim?.item_details?.status || claim?.item?.status || '').trim().toLowerCase();
  if (['rejected', 'declined', 'denied'].includes(status)) {
    return claim?.not_owner ? 'notOwner' : 'declined';
  }
  if (status === 'closed') return 'closed';
  if (status === 'released') return 'released';
  if (itemStatus === 'claimed') return 'released';
  if (status === 'timed out') return 'missed';
  const day = String(claim?.meeting_date || '').slice(0, 10);
  const todayStr = new Date().toLocaleDateString('en-CA');
  if (day && day < todayStr) return 'missed';
  if (day === todayStr) return 'today';
  return 'upcoming';
};

const ClaimScheduleCalendar = ({ claims, onOpenClaim, onOpenItem }) => {
  const [current, setCurrent] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const year = current.getFullYear();
  const month = current.getMonth();

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const monthLabel = current.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const today = new Date();
  const todayKey = dateKeyFor(today.getFullYear(), today.getMonth(), today.getDate());

  const cells = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ];

  // Only claims a moderator/admin explicitly scheduled via
  // ClaimRequests.jsx's "Continue to Schedule" → "Confirm Schedule" flow
  // count toward this calendar — see isStaffConfirmedSchedule above.
  // Claimant self-picked slots (matched-answer submissions from
  // ClaimModal.jsx) are excluded even though they also carry a
  // meeting_date/meeting_time.
  const staffConfirmedClaims = useMemo(
    () => claims.filter(isStaffConfirmedSchedule),
    [claims]
  );

  const scheduleByDate = useMemo(() => {
    const map = {};

    staffConfirmedClaims.forEach((claim) => {
      const scheduled = getScheduleDate(claim);
      if (!scheduled) return;

      const key = dateKeyFor(scheduled.getFullYear(), scheduled.getMonth(), scheduled.getDate());
      if (!map[key]) map[key] = [];
      map[key].push(claim);
    });

    return map;
  }, [staffConfirmedClaims]);

  // The header pill counts only meetings still waiting to happen; the
  // finished ones stay on the calendar with their outcome.
  const totalScheduled = staffConfirmedClaims.filter(
    (cl) => getScheduleDate(cl) && MEETING_OUTCOMES[getMeetingOutcome(cl)].open
  ).length;

  const goPrev = () => {
    setCurrent(new Date(year, month - 1, 1));
    setSelectedDate(null);
  };

  const goNext = () => {
    setCurrent(new Date(year, month + 1, 1));
    setSelectedDate(null);
  };

  const handleDateClick = (key) => {
    setSelectedDate(key);
    setIsModalOpen(true);
  };

  const scheduledForSelected = selectedDate
    ? [...(scheduleByDate[selectedDate] || [])].sort((a, b) => {
        const timeA = getScheduleDate(a)?.getTime() || 0;
        const timeB = getScheduleDate(b)?.getTime() || 0;
        return timeA - timeB;
      })
    : [];

  return (
    <div className="bg-white w-full rounded-3xl border border-slate-200/80 p-5 shadow-sm relative flex flex-col justify-between">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-800">
              Claim Schedule
            </h3>
            <p className="text-[11px] text-slate-400 mt-1">
              Claimants booked for verification meetings
            </p>
          </div>
          <div className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 flex items-center gap-1.5 shrink-0">
            <FaUserClock size={10} />
            {totalScheduled} Upcoming
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button
            onClick={goPrev}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <FaChevronLeft size={12} />
          </button>

          <span className="text-xs font-black uppercase tracking-wide text-slate-700">
            {monthLabel}
          </span>

          <button
            onClick={goNext}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <FaChevronRight size={12} />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1 text-center">
          {WEEKDAY_LABELS.map((d, i) => (
            <span key={i} className="text-[9px] font-black text-slate-300 uppercase py-1">
              {d}
            </span>
          ))}

          {cells.map((day, idx) => {
            if (!day) return <div key={idx} />;

            const key = dateKeyFor(year, month, day);
            const isToday = key === todayKey;
            const isSelected = key === selectedDate;
            const dayClaims = scheduleByDate[key] || [];
            const count = dayClaims.length;
            // Green while any meeting that day is still open; grey once
            // every meeting has an outcome.
            const anyOpen = dayClaims.some((cl) => MEETING_OUTCOMES[getMeetingOutcome(cl)].open);

            return (
              <button
                key={idx}
                onClick={() => handleDateClick(key)}
                className={`
                  relative h-9 rounded-lg text-[11px] font-bold flex flex-col items-center justify-center gap-0.5
                  transition-all
                  ${isSelected ? 'bg-[#2D366D] text-white shadow-md' : isToday ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-50'}
                `}
              >
                <span>{day}</span>
                {count > 0 && (
                  <span
                    className={`
                      text-[9px] leading-none font-black px-1.5 py-0.5 rounded-full
                      ${isSelected ? 'bg-white/20 text-white' : anyOpen ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}
                    `}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* MODAL PREVIEW FOR SCHEDULES ON SELECTED DATE */}
      {isModalOpen && selectedDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-5 bg-[#0B6B8A] flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-white/10 rounded-2xl">
                  <FaCalendarAlt size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-sm tracking-wide">
                    {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </h3>
                  <p className="text-xs text-white/80 mt-0.5">
                    {scheduledForSelected.length} {scheduledForSelected.length === 1 ? 'Meeting Scheduled' : 'Meetings Scheduled'}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              >
                <FaTimes size={14} />
              </button>
            </div>

            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3 bg-slate-50/50">
              {scheduledForSelected.length > 0 ? (
                scheduledForSelected.map((claim, idx) => (
                  <div
                    key={claim.id || idx}
                    role="button"
                    tabIndex={0}
                    title="Open this claim in Claim Requests"
                    onClick={() => onOpenClaim && onOpenClaim(claim)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && onOpenClaim) {
                        e.preventDefault();
                        onOpenClaim(claim);
                      }
                    }}
                    className="cursor-pointer bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm hover:shadow-md hover:border-[#0B6B8A]/50 transition-all flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                      <div className="min-w-0">
                        <h4 className="text-sm font-black text-slate-800 truncate">
                          {claimantLabel(claim)}
                        </h4>
                        <p className="text-xs text-slate-500 truncate mt-0.5">
                          {claim.claimant_email || 'No email provided'}
                        </p>
                      </div>

                      <span className="shrink-0 inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-xs font-bold px-3 py-1 rounded-full">
                        <FaClock size={11} />
                        {claim.meeting_time || 'Time set'}
                      </span>
                    </div>

                    {(() => {
                      const outcome = MEETING_OUTCOMES[getMeetingOutcome(claim)];
                      return (
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-slate-600 truncate">
                            {claim.item_details?.title || 'Item'}
                          </span>
                          <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${outcome.className}`}>
                            {outcome.label}
                          </span>
                        </div>
                      );
                    })()}

                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Contact</span>
                        <span className="font-semibold text-slate-700">{claim.claimant_contact || 'N/A'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Claim ID</span>
                        <span className="font-semibold text-slate-700">#{claim.id || 'N/A'}</span>
                      </div>
                    </div>

                    <div className="flex gap-2 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenClaim && onOpenClaim(claim);
                        }}
                        className="flex-1 rounded-xl bg-[#0B6B8A] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#095A74]"
                      >
                        Open Claim Request
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenItem && onOpenItem(claim);
                        }}
                        className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                      >
                        Open Item ({String(claim.item_details?.type || '').toLowerCase() === 'lost' ? 'Lost' : 'Surrendered'})
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 px-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                    <FaUserClock size={20} />
                  </div>
                  <h4 className="text-sm font-bold text-slate-700">No Meetings Scheduled</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    There are no claimant verification meetings set for this day.
                  </p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-white border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ================= MAIN DASHBOARD =================

// ==========================================================
// LOST & FOUND REPORT (right column)
//
// Monthly Lost vs Found reports as a grouped bar chart, plus a
// per-category breakdown. Lost = rose, Found = SLC blue (validated
// for colour-blind separation). Hover a month for exact counts.
// ==========================================================
const REPORT_COLORS = { lost: '#E11D48', found: '#0B6FA4' };
const REPORT_CATEGORIES = [
  'Accessories', 'ID', 'Academic Materials', 'Bags & Wallets', 'Clothing', 'Electronic', 'Keys', 'Other',
];
// Old category names still found in some records -> current names. Anything
// else that isn't a current category is counted under "Other", so the chart
// always adds up to the same totals as the database.
const LEGACY_CATEGORY = { electronics: 'Electronic', id: 'ID', 'bags and wallets': 'Bags & Wallets' };
const reportCategory = (raw) => {
  const value = String(raw || '').trim();
  const lower = value.toLowerCase();
  if (LEGACY_CATEGORY[lower]) return LEGACY_CATEGORY[lower];
  const match = REPORT_CATEGORIES.find((c) => c.toLowerCase() === lower);
  return match || 'Other';
};
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Report periods: how many buckets each view shows.
const REPORT_PERIODS = {
  weekly: { label: 'Weekly', count: 8, caption: 'Reports per week, last 8 weeks' },
  monthly: { label: 'Monthly', count: 12, caption: 'Reports per month, last 12 months' },
  yearly: { label: 'Yearly', count: 5, caption: 'Reports per year, last 5 years' },
};

const shortDate = (d) => `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;

/** Consecutive time buckets ending with the current week / month / year. */
function buildBuckets(period) {
  const now = new Date();
  const { count } = REPORT_PERIODS[period];
  const list = [];

  for (let i = count - 1; i >= 0; i -= 1) {
    let start;
    let end;
    let label;
    let fullLabel;

    if (period === 'weekly') {
      // Weeks start on Sunday.
      const thisWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      start = new Date(thisWeek.getFullYear(), thisWeek.getMonth(), thisWeek.getDate() - i * 7);
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
      const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
      label = shortDate(start);
      fullLabel = `${shortDate(start)} – ${shortDate(last)}, ${last.getFullYear()}`;
    } else if (period === 'yearly') {
      const year = now.getFullYear() - i;
      start = new Date(year, 0, 1);
      end = new Date(year + 1, 0, 1);
      label = String(year);
      fullLabel = String(year);
    } else {
      start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      label = MONTH_NAMES[start.getMonth()];
      fullLabel = `${MONTH_NAMES[start.getMonth()]} ${start.getFullYear()}`;
    }

    list.push({ key: `${period}-${start.getTime()}`, start, end, label, fullLabel, lost: 0, found: 0 });
  }
  return list;
}

const itemDate = (item) => {
  const raw = item.created_date || item.start_date || item.time_stamp;
  if (!raw) return null;
  const d = new Date(String(raw).length <= 10 ? `${raw}T00:00:00` : raw);
  return isNaN(d.getTime()) ? null : d;
};

const isLostItem = (item) => (item.type || '').toLowerCase() === 'lost';
const isFoundItem = (item) => {
  const t = (item.type || '').toLowerCase();
  return t === 'surrendered' || t === 'found';
};

// Bar with only its top corners rounded (4px), anchored to the baseline.
const topRoundedBar = (x, y, w, h, r = 4) => {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h} L${x},${y + rr} Q${x},${y} ${x + rr},${y} L${x + w - rr},${y} Q${x + w},${y} ${x + w},${y + rr} L${x + w},${y + h} Z`;
};

const ReportsChart = ({ items = [], onOpenReports }) => {
  const [period, setPeriod] = useState('monthly');
  const [hover, setHover] = useState(null);

  const months = useMemo(() => buildBuckets(period), [period]);

  const { series, totals, categories } = useMemo(() => {
    const buckets = months.map((m) => ({ ...m }));
    const cats = Object.fromEntries(REPORT_CATEGORIES.map((c) => [c, { lost: 0, found: 0 }]));
    const t = { lost: 0, found: 0, claimed: 0 };

    items.forEach((item) => {
      // Every record counts (archived ones too), so the totals match the
      // database exactly.
      const d = itemDate(item);
      if (!d) return;
      const bucket = buckets.find((b) => d >= b.start && d < b.end);
      if (!bucket) return; // outside the selected range
      const kind = isLostItem(item) ? 'lost' : isFoundItem(item) ? 'found' : null;
      if (!kind) return;
      bucket[kind] += 1;
      t[kind] += 1;
      // "Claimed" = found (surrendered) items released to their owners,
      // so the claim rate (claimed / found) can never go above 100%.
      const st = (item.status || '').toLowerCase();
      if (kind === 'found' && st === 'claimed') t.claimed += 1;
      cats[reportCategory(item.category)][kind] += 1;
    });

    return {
      series: buckets,
      totals: t,
      categories: REPORT_CATEGORIES.map((c) => ({ name: c, ...cats[c] })),
    };
  }, [items, months]);

  // ---- chart geometry
  const W = 560;
  const H = 230;
  const pad = { top: 16, right: 12, bottom: 28, left: 32 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const maxVal = Math.max(1, ...series.map((m) => Math.max(m.lost, m.found)));
  const step = Math.max(1, Math.ceil(maxVal / 4));
  const yMax = step * 4;
  const y = (v) => pad.top + plotH - (v / yMax) * plotH;
  const groupW = plotW / series.length;
  const barW = Math.min(18, (groupW - 10) / 2);
  const ticks = [0, step, step * 2, step * 3, yMax];

  const claimRate = totals.found > 0 ? Math.round((totals.claimed / totals.found) * 100) : 0;
  const catMax = Math.max(1, ...categories.map((c) => Math.max(c.lost, c.found)));

  return (
    <div className="bg-white w-full h-full rounded-3xl border border-slate-200/80 p-6 shadow-sm flex flex-col">
      {/* Header + range filter */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-800">
            Lost &amp; Surrendered Report
          </h3>
          <p className="text-[11px] text-slate-400 mt-1">
            {REPORT_PERIODS[period].caption}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full bg-[#F1F4F9] p-1">
            {Object.entries(REPORT_PERIODS).map(([key, cfg]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setPeriod(key);
                  setHover(null);
                }}
                className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide transition ${
                  period === key ? 'bg-white text-[#0B6B8A] shadow-sm' : 'text-[#7B8AA6] hover:text-[#475569]'
                }`}
              >
                {cfg.label}
              </button>
            ))}
          </div>
          {onOpenReports && (
            <button
              type="button"
              onClick={onOpenReports}
              className="rounded-full border border-[#CBD8E8] px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-[#0B6B8A] transition hover:bg-[#EAF4FF]"
            >
              Full Report
            </button>
          )}
        </div>
      </div>

      {/* Summary tiles */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { label: 'Lost', value: totals.lost, dot: REPORT_COLORS.lost },
          { label: 'Surrendered', value: totals.found, dot: REPORT_COLORS.found },
          { label: 'Claimed', value: totals.claimed },
          { label: 'Claim rate', value: `${claimRate}%` },
        ].map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {tile.dot && <span className="h-2 w-2 rounded-full" style={{ background: tile.dot }} />}
              {tile.label}
            </p>
            <p className="mt-0.5 text-lg font-black text-slate-800">{tile.value}</p>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-4 text-[11px] font-semibold text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: REPORT_COLORS.lost }} /> Lost reports
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: REPORT_COLORS.found }} /> Surrendered
        </span>
      </div>

      {/* Monthly grouped bars */}
      <div className="relative mt-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Lost and surrendered reports, ${REPORT_PERIODS[period].label.toLowerCase()}`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke="#EEF2F6" strokeWidth="1" />
              <text x={pad.left - 8} y={y(t) + 3} textAnchor="end" fontSize="10" fill="#94A3B8">{t}</text>
            </g>
          ))}
          {series.map((m, i) => {
            const gx = pad.left + i * groupW;
            const cx = gx + groupW / 2;
            const active = hover === i;
            return (
              <g key={m.key}>
                {active && <rect x={gx + 2} y={pad.top} width={groupW - 4} height={plotH} rx="6" fill="#F1F5F9" />}
                <path d={topRoundedBar(cx - barW - 1, y(m.lost), barW, pad.top + plotH - y(m.lost))} fill={REPORT_COLORS.lost} />
                <path d={topRoundedBar(cx + 1, y(m.found), barW, pad.top + plotH - y(m.found))} fill={REPORT_COLORS.found} />
                <text x={cx} y={H - 10} textAnchor="middle" fontSize="10" fill={active ? '#334155' : '#94A3B8'} fontWeight={active ? 700 : 500}>
                  {m.label}
                </text>
                {/* Hit area larger than the bars */}
                <rect
                  x={gx}
                  y={pad.top}
                  width={groupW}
                  height={plotH + pad.bottom}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                />
              </g>
            );
          })}
          <line x1={pad.left} x2={W - pad.right} y1={y(0)} y2={y(0)} stroke="#CBD5E1" strokeWidth="1" />
        </svg>

        {hover !== null && series[hover] && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] shadow-lg"
            style={{ left: `${((pad.left + hover * groupW + groupW / 2) / W) * 100}%` }}
          >
            <p className="font-black text-slate-700">{series[hover].fullLabel}</p>
            <p className="mt-1 flex items-center gap-1.5 text-slate-600">
              <span className="h-2 w-2 rounded-full" style={{ background: REPORT_COLORS.lost }} />
              Lost: <span className="font-bold text-slate-800">{series[hover].lost}</span>
            </p>
            <p className="flex items-center gap-1.5 text-slate-600">
              <span className="h-2 w-2 rounded-full" style={{ background: REPORT_COLORS.found }} />
              Surrendered: <span className="font-bold text-slate-800">{series[hover].found}</span>
            </p>
          </div>
        )}
      </div>

      {/* Category breakdown — grows to fill the card so there's no empty
          white space below it when the left column is taller. */}
      <div className="mt-5 flex flex-1 flex-col border-t border-slate-100 pt-4">
        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-800">By Category</h4>
        <div className="mt-3 flex flex-1 flex-col justify-between gap-2.5">
          {categories.map((c) => (
            <div key={c.name} className="grid grid-cols-[110px_1fr_auto] items-center gap-3">
              <span className="truncate text-[11px] font-semibold text-slate-600">{c.name}</span>
              <div className="space-y-[3px] rounded-r-full bg-slate-50 py-0.5">
                <div className="h-2.5 rounded-r-full" style={{ width: `${(c.lost / catMax) * 100}%`, minWidth: c.lost ? 4 : 0, background: REPORT_COLORS.lost }} />
                <div className="h-2.5 rounded-r-full" style={{ width: `${(c.found / catMax) * 100}%`, minWidth: c.found ? 4 : 0, background: REPORT_COLORS.found }} />
              </div>
              <span className="w-14 text-right text-[11px] font-semibold text-slate-500">
                {c.lost} / {c.found}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-right text-[10px] text-slate-400">Lost / Surrendered</p>
      </div>
    </div>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [claims, setClaims] = useState([]);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    fetchItems();
    fetchUsers();
    fetchClaims();
    fetchLogs();

    const refreshAll = () => {
      fetchItems();
      fetchUsers();
      fetchClaims();
      fetchLogs();
    };

    // Live updates: every POLL_INTERVAL_MS while the tab is visible, and
    // immediately when the staff member comes back to the tab/window, so
    // the numbers always match the database. Paused while hidden.
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refreshAll();
    }, POLL_INTERVAL_MS);

    const handleVisible = () => {
      if (document.visibilityState === 'visible') refreshAll();
    };
    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', handleVisible);

    const handleUpdate = () => fetchLogs();
    window.addEventListener(ACTIVITY_LOG_UPDATE_EVENT, handleUpdate);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('focus', handleVisible);
      window.removeEventListener(ACTIVITY_LOG_UPDATE_EVENT, handleUpdate);
    };
  }, []);

  async function fetchItems() {
    try {
      const raw = await getItems();
      const data = Array.isArray(raw) ? raw : raw?.results || [];
      // Only replace the list when something actually changed, so the map
      // doesn't re-render on every poll when nothing is new.
      setItems((prev) => (JSON.stringify(prev) === JSON.stringify(data) ? prev : data));
    } catch (error) {
      console.error('Fetching of items error: ', error);
    }
  }

  async function fetchUsers() {
    try {
      const data = await getUsers();
      setUsers(data || []);
    } catch (error) {
      console.error('Fetching of users error: ', error);
    }
  }

  async function fetchClaims() {
    try {
      const data = await getClaims();
      setClaims(data || []);
    } catch (error) {
      console.error('Fetching of claims error: ', error);
    }
  }

  async function fetchLogs() {
    try {
      const data = await getActivityLogsLocal();
      setLogs(data || []);
    } catch (error) {
      console.error('Fetching of activity logs error: ', error);
    }
  }

  // Card counts.
  // Lost Reports and Surrendered Items only count items that are still
  // open: status Pending or Approved. Claimed, Declined and Archived items
  // are left out of those two cards. The line under each number splits it
  // into pending and approved.
  const statusOf = (i) => (i.status || '').toLowerCase();
  const typeOf = (i) => (i.type || '').toLowerCase();
  const countBy = (list, statuses) => list.filter((i) => statuses.includes(statusOf(i))).length;
  const OPEN_STATUSES = ['pending', 'approved'];

  const lostList = items.filter((i) => typeOf(i) === 'lost');
  const foundList = items.filter((i) => ['surrendered', 'found'].includes(typeOf(i)));
  const totalLost = countBy(lostList, OPEN_STATUSES);
  const totalSurrendered = countBy(foundList, OPEN_STATUSES);
  // Resolved Matches still counts every claimed item.
  const lostRecovered = countBy(lostList, ['claimed']);
  const foundReleased = countBy(foundList, ['claimed']);
  const totalClaimed = lostRecovered + foundReleased;
  const totalUsers = users.length;
  const staffCount = users.filter((u) => ['admin', 'moderator'].includes(String(u.role || '').toLowerCase())).length;

  const lostDescription = [
    `${countBy(lostList, ['pending'])} pending`,
    `${countBy(lostList, ['approved'])} approved`,
  ].join(' · ');
  const foundDescription = [
    `${countBy(foundList, ['pending'])} pending`,
    `${countBy(foundList, ['approved'])} approved`,
  ].join(' · ');

  // Top hotspot comes from the same live building tallies as the map, so
  // the banner and the map always agree.
  const topLost = useMemo(() => computeBuildingStats(items).topLost, [items]);
  const hotspot = topLost ? topLost.shortName : "None";

  return (
    <div className="space-y-6 animate-in fade-in duration-500 font-sans pb-10">
      {/* Banner */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#0B6FA4] to-[#0A5A8C] rounded-2xl p-5 text-white shadow-lg border border-blue-400/20">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex-1">
            <h2 className="text-lg md:text-xl font-bold text-white mb-1">
              Dashboard
            </h2>
          </div>

          <div className="flex gap-3 w-full md:w-auto">
            <div className="bg-white/10 backdrop-blur rounded-lg p-3 flex-1 md:flex-none text-center min-w-fit">
              <p className="text-blue-200 text-[10px] font-semibold mb-0.5">Top SLC Hotspot</p>
              <p className="text-base font-bold text-white">{hotspot}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard label="Lost Reports" count={totalLost} icon={FaExclamationCircle} color="text-rose-500" bgColor="bg-rose-50" description={lostDescription} />
        <StatCard label="Surrendered Items" count={totalSurrendered} icon={FaCheckCircle} color="text-emerald-500" bgColor="bg-emerald-50" description={foundDescription} />
        <StatCard label="Resolved Matches" count={totalClaimed} icon={FaBox} color="text-purple-500" bgColor="bg-purple-50" description={`${lostRecovered} lost reports recovered · ${foundReleased} surrendered items released`} />
        <StatCard label="User Accounts" count={totalUsers} icon={FaUsers} color="text-indigo-500" bgColor="bg-indigo-50" description={`${staffCount} staff · ${totalUsers - staffCount} users (students/employees)`} />
      </div>

      {/* Main Content: map (top-left) + calendar (bottom-left), report graph on the right */}
      <div className="grid w-full grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <HotspotMap items={items} />
          <ClaimScheduleCalendar
            claims={claims}
            // A meeting card opens its claim in Claim Requests; "Open Item"
            // opens the item in Found Items (or Lost Items).
            onOpenClaim={(claim) =>
              navigate('/dashboard/claim-requests', { state: { openClaimId: claim.id } })
            }
            onOpenItem={(claim) => {
              const itemId = claim.item_details?.id ?? claim.item?.id ?? claim.item;
              const isLost = String(claim.item_details?.type || '').toLowerCase() === 'lost';
              navigate(isLost ? '/dashboard/lost-items' : '/dashboard/surrendered-items', {
                state: { reviewItemId: itemId },
              });
            }}
          />
        </div>
        <div className="min-w-0">
          <ReportsChart items={items} onOpenReports={() => navigate('/dashboard/reports')} />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;