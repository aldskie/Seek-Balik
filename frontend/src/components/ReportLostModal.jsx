import React, { useState } from 'react';
import L from 'leaflet';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Marker,
  Tooltip as LeafletTooltip,
  ZoomControl,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { FaUniversity, FaTimes, FaInfoCircle } from 'react-icons/fa';
import PhotoUpload from './PhotoUpload';
import { createLostItem } from '../api/api';
import { useApp } from '../context/AppContext';
import { showToast } from "../utils/toast";

const AREAS = ['Grandstand',
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
  'Others'];
const CATS = ['Accessories', 'ID', 'Academic Materials', 'Bags & Wallets', 'Clothing', 'Electronic', 'Keys'];

// Maximum number of locations a reporter can select for a single report.
const MAX_LOCATIONS = 3;

// ─── Item Name presets ──────────────────────────────────────────────────────
// Predefined Item Name choices per Category, used to drive the Item Name
// dropdown once a Category is selected. Keys must match the CATS values
// above exactly. "Other (please specify)" is always appended in the UI so
// the reporter can still type something not on the list.
const ITEM_NAME_OPTIONS = {
  'Accessories': [
    'Watch', 'Bracelet', 'Necklace', 'Ring', 'Earrings', 'Hair Clip', 'Hair Tie',
    'Sunglasses', 'Eyeglasses', 'Cap/Hat', 'Keychain', 'ID Lace', 'Brooch/Pin', 'Belt'
  ],
  'ID': [
    'Student ID', "Driver's License", 'Passport', 'Government ID',
    'Company/Employee ID', 'PhilHealth ID', 'UMID', 'ATM/Debit Card', 'Library Card',
    'Other Identification Card'
  ],
  'Academic Materials': [
    'Notebook', 'Binder', 'Folder', 'Envelope', 'Textbook', 'Reference Book', 'Module',
    'Reviewer', 'Printed Document', 'Assignment', 'Examination Paper', 'Index Card',
    'Yellow Pad', 'Calculator', 'Ruler', 'Pencil', 'Ballpen', 'Marker/Highlighter',
    'Eraser', 'Pencil Case', 'Art Materials', 'USB/Flash Drive'
  ],
  'Bags & Wallets': [
    'Backpack', 'School Bag', 'Shoulder Bag', 'Tote Bag', 'Sling Bag', 'Laptop Bag',
    'Handbag', 'Purse', 'Wallet', 'Coin Purse', 'Pouch', 'Pencil Case', 'Drawstring Bag',
    'Travel Bag'
  ],
  'Clothing': [
    'T-Shirt', 'Polo Shirt', 'Uniform', 'Jacket', 'Hoodie', 'Sweater', 'Pants', 'Jeans',
    'Shorts', 'Skirt', 'Dress', 'Socks', 'Shoes', 'Slippers', 'Sneakers', 'Underwear',
    'Scarf', 'Gloves', 'Raincoat'
  ],
  'Electronic': [
    'Mobile Phone', 'Laptop', 'Tablet', 'iPad', 'Smartwatch', 'Digital Camera',
    'Calculator', 'Power Bank', 'Charger', 'Charging Cable', 'Earphones', 'Earbuds',
    'Headphones', 'Bluetooth Speaker', 'USB Flash Drive', 'External Hard Drive', 'Mouse',
    'Keyboard', 'Adapter', 'Power Supply', 'HDMI Cable'
  ],
  'Keys': [
    'House Key', 'Room Key', 'Classroom Key', 'Office Key', 'Cabinet Key', 'Locker Key',
    'Padlock Key', 'Motorcycle Key', 'Car Key', 'Key Set', 'Duplicate Key',
    'Keychain with Keys'
  ]
};

// Marker value used by the Item Name <select> to represent "the reporter
// wants to type a custom name that isn't on the predefined list for this
// Category".
const OTHER_ITEM_NAME = '__other__';

// ================= SAINT LOUIS COLLEGE CAMPUS MAP (Leaflet) =================
//
// Same real-world rooftop coordinates used on the admin Dashboard's
// campus hotspot map. Each entry's `areaValue` maps the building on the map
// back to the exact string used in AREAS / the location list, so clicking a
// building and picking from the list always stay in sync.

const CAMPUS_CENTER = { lat: 16.63673, lng: 120.31321 };

const SLC_CSC_BUILDINGS = [
  { id: 1, name: "Grandstand", shortName: "Grandstand", num: "1", areaValue: "Grandstand", lat: 16.636728, lng: 120.312682 },
  { id: 2, name: "(V) Verbist Building", shortName: "Verbist Bldg", num: "2", areaValue: "Verbist Building", lat: 16.637054, lng: 120.312432 },
  { id: 3, name: "Transfiguration of the Lord Chapel", shortName: "SLC Chapel", num: "3", areaValue: "Chapel", lat: 16.637191, lng: 120.312961 },
  { id: 4, name: "Fr. Alfred Spincemaille, CICM (Admin Bldg)", shortName: "Admin Bldg", num: "4", areaValue: "Administrative Building (Main Building)", lat: 16.636619, lng: 120.313037 },
  { id: 5, name: "Gerard De Boeck Mission Library", shortName: "Mission Library", num: "5", areaValue: "Library", lat: 16.636802, lng: 120.313443 },
  { id: 6, name: "Fr. Burgos Gymnasium", shortName: "Burgos Gym", num: "6", areaValue: "Gymnasium", lat: 16.636110, lng: 120.313369 },
  { id: 7, name: "(B) ICT Center", shortName: "ICT Center", num: "7", areaValue: "ICT Center", lat: 16.636164, lng: 120.313630 },
  { id: 8, name: "(C) New Building", shortName: "New Building (C)", num: "8", areaValue: "New Building (CEA Building)", lat: 16.636562, lng: 120.313948 },
  { id: 9, name: "New Elementary Building", shortName: "New Elem Bldg", num: "9", areaValue: "New Elementary Building", lat: 16.637145, lng: 120.313920 },
  { id: 10, name: "SLC Canteen", shortName: "SLC Canteen", num: "10", areaValue: "SLC Canteen", lat: 16.637480, lng: 120.313833 },
  { id: 11, name: "(E) Bishop Wenceslao Padilla, CICM (Old Elem)", shortName: "Old Elem (E)", num: "11", areaValue: "Old Elementary Building", lat: 16.637739, lng: 120.313819 },
  { id: 12, name: "Conrado Dela Cruz Sports Center", shortName: "Sports Center", num: "12", areaValue: "Conrado Dela Cruz Sports Center (CDC)", lat: 16.638038, lng: 120.313798 },
  { id: 13, name: "Fr. Roger Bruno Eduard Tjolle, CICM (SHS Bldg)", shortName: "SHS Dept Bldg", num: "13", areaValue: "Senior High School Department Building", lat: 16.637693, lng: 120.313277 },
  { id: 14, name: "Rev. Fr. Clement Daelman, CICM (HM Lab)", shortName: "HM Lab Bldg", num: "14", areaValue: "HM Laboratory Building", lat: 16.637518, lng: 120.313215 },
  { id: 16, name: "Student Affairs Office Lobby", shortName: "SAO Lobby", num: "16", areaValue: "Student Affairs Office Lobby", lat: 16.636311, lng: 120.313174 },
];

// ─── Illustrated campus map, adapted as a location picker ─────────────────
// Clicking a building toggles it in the form's location array (calls
// onSelect with the building's areaValue). Clicking an already-selected
// building deselects it, so multiple buildings can be picked or unpicked
// freely, up to MAX_LOCATIONS. The currently-selected buildings (driven by
// the "Location Lost" list) are highlighted with a gold ring so the map and
// list always agree.
const CampusHotspotMap = ({ selected, onSelect, onDone }) => {
  const [hoveredBuilding, setHoveredBuilding] = useState(null);

  // `selected` is the form's array of chosen location strings. A building
  // counts as selected if its areaValue is anywhere in that array.
  const selectedIds = new Set(
    SLC_CSC_BUILDINGS.filter((b) => (selected || []).includes(b.areaValue)).map((b) => b.id)
  );
  const isActive = (id) => selectedIds.has(id);
  const selectedCount = selectedIds.size;
  const limitReached = selectedCount >= MAX_LOCATIONS;

  const infoBuilding =
    hoveredBuilding || SLC_CSC_BUILDINGS.find((b) => isActive(b.id)) || null;

  return (
    <div className="bg-white w-full rounded-3xl border border-slate-200/80 p-4 shadow-sm relative">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0B6FA4] flex items-center gap-1.5">
            <FaUniversity size={12} /> Campus Map
          </h3>
          <p className="text-xs font-bold text-slate-800 mt-0.5">
            Saint Louis College — tap buildings to set/unset location(s)
          </p>
        </div>

        {selectedCount > 0 && (
          <span className={`shrink-0 text-[10px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full ${
            limitReached ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-700"
          }`}>
            {selectedCount}/{MAX_LOCATIONS} selected
          </span>
        )}
      </div>

      {/* Small inline styles for Leaflet marker labels, matching the
          Dashboard's hotspot map styling. */}
      <style>{`
        .picker-marker-label {
          background: transparent;
          border: none;
          box-shadow: none;
          color: #ffffff;
          font-weight: 900;
          font-size: 11px;
          text-shadow: 0 1px 2px rgba(0,0,0,0.6);
        }
        .picker-marker-label::before { display: none; }
        .picker-roof-label {
          background: transparent;
          border: none;
          box-shadow: none;
          pointer-events: none;
        }
        .picker-roof-label::before { display: none; }
        .picker-roof-label-text {
          color: #ffffff;
          font-weight: 800;
          font-size: 11px;
          line-height: 1.2;
          text-align: center;
          text-shadow:
            -1px -1px 0 rgba(0,0,0,0.85),
             1px -1px 0 rgba(0,0,0,0.85),
            -1px  1px 0 rgba(0,0,0,0.85),
             1px  1px 0 rgba(0,0,0,0.85),
             0 1px 3px rgba(0,0,0,0.6);
          white-space: nowrap;
        }
        .leaflet-container { font-family: inherit; }
      `}</style>

      {/* Leaflet Map Frame */}
      <div className="mt-3 relative w-full h-[420px] bg-[#f8fafc] rounded-2xl overflow-hidden border border-slate-300/80 shadow-inner">
        <MapContainer
          center={[CAMPUS_CENTER.lat, CAMPUS_CENTER.lng]}
          zoom={17}
          zoomControl={false}
          scrollWheelZoom
          style={{ width: '100%', height: '100%' }}
        >
          {/* Satellite base layer (Esri World Imagery), same as the
              Dashboard's hotspot map. */}
          <TileLayer
            attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
          />
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            maxZoom={19}
            opacity={0.9}
          />
          <ZoomControl position="topright" />

          {SLC_CSC_BUILDINGS.map((b) => {
            const active = isActive(b.id);
            const disabled = !active && limitReached;

            return (
              <React.Fragment key={`bldg-${b.id}`}>
                {/* Clickable numbered dot: toggles the location on click */}
                <CircleMarker
                  center={[b.lat, b.lng]}
                  radius={active ? 16 : 13}
                  pathOptions={{
                    fillColor: active ? '#f59e0b' : (disabled ? '#94a3b8' : '#0B6FA4'),
                    fillOpacity: disabled ? 0.5 : 0.9,
                    color: active ? '#000000' : '#ffffff',
                    weight: active ? 3 : 1.5,
                  }}
                  eventHandlers={{
                    click: () => onSelect(b.areaValue),
                    mouseover: () => setHoveredBuilding(b),
                    mouseout: () => setHoveredBuilding(null),
                  }}
                >
                  <LeafletTooltip
                    permanent
                    direction="center"
                    className="picker-marker-label"
                  >
                    {b.num}
                  </LeafletTooltip>
                </CircleMarker>

                {/* Always-on rooftop label, like the Dashboard map */}
                <Marker
                  position={[b.lat, b.lng]}
                  icon={L.divIcon({
                    className: 'picker-roof-label',
                    html: `<div class="picker-roof-label-text">${b.shortName}</div>`,
                    iconSize: [0, 0],
                    iconAnchor: [-14, 26],
                  })}
                  interactive={false}
                />
              </React.Fragment>
            );
          })}
        </MapContainer>

        {/* Map Footer Bar */}
        <div className="absolute bottom-2 left-3 right-3 flex justify-between items-center text-[9px] text-slate-700 font-bold bg-white/90 backdrop-blur px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-sm pointer-events-none z-[1000]">
          <span className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#0B6FA4] inline-block" /> Building
            <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] inline-block ml-1" /> Selected
          </span>
          <span>{limitReached ? `Limit of ${MAX_LOCATIONS} reached` : "Tap a pin to select, tap again to remove"}</span>
        </div>
      </div>

      {/* Info / Selected Building Panel */}
      {infoBuilding ? (
        <div className="mt-3 p-3 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 bg-[#0B6FA4] text-white font-black text-xs rounded-xl flex items-center justify-center shrink-0 shadow-sm">
              {infoBuilding.num}
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-black text-slate-800 truncate">{infoBuilding.name}</h4>
              <p className="text-[10px] text-slate-400 font-semibold">
                {isActive(infoBuilding.id)
                  ? 'Currently selected as a location — click to remove'
                  : (limitReached
                      ? `Limit of ${MAX_LOCATIONS} locations reached`
                      : 'Click to add as a location')}
              </p>
            </div>
          </div>

          {isActive(infoBuilding.id) && (
            <button
              type="button"
              onClick={() => onSelect(infoBuilding.areaValue)}
              title="Click to deselect"
              className="w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 text-xs font-black hover:bg-amber-200 transition-colors"
            >
              ✓
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3 p-3 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between text-[11px] text-slate-500 font-medium">
          <span className="flex items-center gap-2">
            <FaInfoCircle className="text-[#0B6FA4]" /> Hover or tap any building pin to select it. Tap multiple to add more than one (up to {MAX_LOCATIONS}).
          </span>
        </div>
      )}

      {/* Done Button */}
      {onDone && (
        <button
          type="button"
          onClick={onDone}
          className="mt-3 w-full bg-gradient-to-r from-[#0B648D] to-[#155F87] text-white py-2.5 rounded-xl font-bold text-[12px] uppercase tracking-wide shadow-md hover:opacity-90 transition-all"
        >
          Done{selectedCount > 0 ? ` (${selectedCount} selected)` : ""}
        </button>
      )}
    </div>
  );
};

const ReportLostModal = ({ onClose, onSuccess }) => {
  // FIX: PublicBoard reads the logged-in user as `user` from useApp(),
  // but this file only read `currentUser`. If the context doesn't expose
  // `currentUser`, every report was saved with a blank email and could
  // never be matched to the reporter's account. Accept either name.
  const { currentUser, user } = useApp();
  const me = currentUser || user || null;

  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [ticketCode, setTicketCode] = useState("");
  const [errors, setErrors] = useState({});
  const [showMap, setShowMap] = useState(false);

  const [form, setForm] = useState({
    title: "",
    category: "",
    location: [],
    other_location: "",
    created_date: "",
    created_date_to: "",
    created_time: "",
    created_time_to: "",
    description: "",
    image: [],
  });

  // Whether the Item Name field is currently in "custom text" mode (the
  // reporter picked "Other (please specify)"). Item Name choices depend on
  // the selected Category, so there's nothing to pick until a Category is
  // chosen.
  const [itemNameOther, setItemNameOther] = useState(false);

  const maxDate = new Date().toLocaleDateString('en-CA');

  const handleChange = (e) => {
    const { name, value } = e.target;

    setForm(prev => ({
      ...prev,
      [name]: value,
    }));

    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: "" }));
    }
  };

  // Changing Category swaps the predefined Item Name list, so the
  // previously selected/typed name almost never still applies. Reset the
  // Item Name back to "choose one" mode whenever Category changes, unless
  // the current title happens to also exist in the new category's list.
  const handleCategoryChange = (e) => {
    const newCategory = e.target.value;
    setForm(prev => {
      const stillValid = (ITEM_NAME_OPTIONS[newCategory] || []).includes(prev.title);
      return {
        ...prev,
        category: newCategory,
        title: stillValid ? prev.title : '',
      };
    });
    setItemNameOther(false);
    if (errors.category) setErrors(prev => ({ ...prev, category: "" }));
    if (errors.title) setErrors(prev => ({ ...prev, title: "" }));
  };

  const handleItemNameChange = (e) => {
    const val = e.target.value;
    if (val === OTHER_ITEM_NAME) {
      setItemNameOther(true);
      setForm(prev => ({ ...prev, title: "" }));
    } else {
      setItemNameOther(false);
      setForm(prev => ({ ...prev, title: val }));
    }
    if (errors.title) setErrors(prev => ({ ...prev, title: "" }));
  };

  // Toggles a location on/off. Adding a new location (not already selected)
  // is blocked once MAX_LOCATIONS is reached, and surfaces a form error so
  // the reporter knows why the tap/click didn't do anything.
  const handleLocationToggle = (areaValue) => {
    setForm(prev => {
      const exists = prev.location.includes(areaValue);

      if (!exists && prev.location.length >= MAX_LOCATIONS) {
        return prev;
      }

      const updatedLocation = exists
        ? prev.location.filter(item => item !== areaValue)
        : [...prev.location, areaValue];

      return {
        ...prev,
        location: updatedLocation,
        ...(updatedLocation.includes("Others") ? {} : { other_location: "" }),
      };
    });

    setForm(current => {
      const wasBlocked = !current.location.includes(areaValue) && current.location.length >= MAX_LOCATIONS;
      if (wasBlocked) {
        setErrors(prevErrors => ({ ...prevErrors, location: `You can select up to ${MAX_LOCATIONS} locations only.` }));
      } else if (errors.location) {
        setErrors(prevErrors => ({ ...prevErrors, location: "" }));
      }
      return current;
    });
  };

  const handleMapSelect = (areaValue) => {
    handleLocationToggle(areaValue);
  };

  const validateForm = () => {
    const newErrors = {};

    if (!form.title.trim()) newErrors.title = "Item Name is required.";
    if (!form.category) newErrors.category = "Please select a category.";

    if (!form.location || form.location.length === 0) {
      newErrors.location = "Please select at least one location.";
    } else if (form.location.length > MAX_LOCATIONS) {
      newErrors.location = `You can select up to ${MAX_LOCATIONS} locations only.`;
    }

    if (!form.created_date) newErrors.created_date = "Start date is required.";

    if (
      form.created_date &&
      form.created_date_to &&
      form.created_date_to < form.created_date
    ) {
      newErrors.created_date_to = "End date can't be before the start date.";
    }

    if (
      form.created_time &&
      form.created_time_to &&
      form.created_date &&
      form.created_date_to &&
      form.created_date === form.created_date_to &&
      form.created_time_to < form.created_time
    ) {
      newErrors.created_time_to = "End time can't be before the start time.";
    }

    // Description is optional, so it isn't validated as required.

    if (form.location.includes("Others") && !form.other_location.trim()) {
      newErrors.other_location = "Please specify the location.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setShowConfirm(true);
  };

  const confirmSubmit = async () => {
    if (isSubmitting) return;

    // FIX: never save a report that can't be linked back to its reporter.
    // Without the logged-in user's email the report would never show up
    // in that user's "Items you've personally reported" list.
    const fullEmail = (me?.email ?? "").trim();
    if (!fullEmail) {
      setShowConfirm(false);
      showToast("We couldn't read your account email. Please log out and log in again, then resubmit.");
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();

      const finalLocation = form.location
        .map(loc => (loc === "Others" ? form.other_location.trim() : loc))
        .filter(Boolean)
        .join(", ");

      const posterName = `${me?.first_name ?? ""} ${me?.last_name ?? ""}`.trim();

      const excludeKeys = ["location", "other_location", "image"];

      Object.keys(form).forEach(key => {
        if (excludeKeys.includes(key)) return;

        if (form[key] !== null) {
          formData.append(key, form[key]);
        }
      });

      // Every item needs a `type` so it can be told apart from a
      // Surrendered/Found item.
      formData.append("type", "Lost");

      formData.append("poster_name", posterName);
      formData.append("email", fullEmail);

      // STUDENT ID — the 8 digits before the "@" of a student account
      // email (12345678@slc-sflu.edu.ph -> "12345678"). This is what the
      // "my items" endpoint matches the report against.
      //
      // Only sent when that part really is 8 digits. A staff or other
      // non-student email (e.g. "admin@...") has no Student ID, and
      // sending it would fail the backend's "exactly 8 digits" check and
      // reject the whole report. The report is still linked to the
      // account through `email` above either way.
      const studentId = fullEmail.split("@")[0].trim();
      if (/^\d{8}$/.test(studentId)) {
        formData.append("student_id", studentId);
      }

      formData.append("location", finalLocation);

      (form.image || []).forEach((file) => {
        formData.append("image", file);
      });

      const response = await createLostItem(formData);

      setTicketCode(response.ticket_code);
      setSubmitted(true);
      setShowConfirm(false);

      // Let PublicBoard refresh its item list right away instead of
      // waiting for its next poll.
      onSuccess?.();
    } catch (err) {
      console.error(err.response?.status, err.response?.data || err);
      showToast("Failed to submit report.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const formattedEmail = me?.email || "your-id@slc-sflu.edu.ph";
  const itemNamePresets = ITEM_NAME_OPTIONS[form.category] || [];
  const locationLimitReached = form.location.length >= MAX_LOCATIONS;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-3 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>

      <div className={`bg-white w-full ${submitted ? "max-w-md sm:max-w-lg" : "max-w-2xl sm:max-w-3xl"} max-h-[92vh] rounded-xl sm:rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,.18)] overflow-hidden flex flex-col`}>

        {submitted ? (
          <div className="w-full px-8 sm:px-10 py-10 text-center flex flex-col items-center justify-center font-sans">
            <div className="text-5xl mb-6">✅</div>

            <h3 className="font-bold text-[#184C73] text-[17px] uppercase tracking-wide">
              Report Filed
            </h3>

            <p className="text-slate-500 text-[13px] font-semibold mt-5 leading-relaxed max-w-md">
              Your report is now in our registry. Updates will be sent to{" "}
              <b className="text-slate-700">{formattedEmail}</b>.
            </p>

            <p className="text-slate-500 text-[13px] font-semibold mt-3 leading-relaxed max-w-md">
              Your ticket number is: <b className="text-slate-700">{ticketCode}</b>
            </p>

            <button
              onClick={onClose}
              className="mt-8 w-full sm:w-64 bg-gradient-to-r from-[#0B648D] to-[#155F87] text-white py-3 rounded-xl font-bold uppercase tracking-wide text-[13px] hover:opacity-90 transition-all"
            >
              Return to Board
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-gradient-to-r from-[#0B648D] to-[#155F87] text-white px-4 sm:px-6 py-3 sm:py-4 border-b-4 flex justify-between items-start gap-4">
              <div>
                <h2 className="text-[15px] font-bold">
                  Report Lost Item
                </h2>

                <p className="text-blue-100 text-[13px] mt-1">
                  Submit details of your lost item
                </p>
              </div>

              <button
                onClick={onClose}
                className="w-8 h-8 flex-shrink-0 rounded-full bg-white/15 hover:bg-white/25 transition flex items-center justify-center text-white font-bold text-[15px]"
              >
                ×
              </button>
            </div>

            {/* Form Container */}
            <form onSubmit={handleSubmit} noValidate className="overflow-y-auto p-4 sm:p-6 space-y-5 font-sans">

              {/* Category & Item Name — Category first, since the Item
                  Name choices to its right depend on it. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="block text-[13px] font-semibold text-slate-500 mb-1.5">Category *</label>
                  <select
                    className={`w-full px-3.5 py-2.5 rounded-lg border ${
                      errors.category ? "border-red-500 bg-red-50" : "border-slate-300 bg-white"
                    } text-[13px] font-semibold outline-none transition-all duration-200 focus:border-[#155F87] focus:ring-2 focus:ring-[#0B648D]/20 ${
                      form.category ? "text-slate-800" : "text-slate-400 font-normal"
                    }`}
                    name="category"
                    value={form.category}
                    onChange={handleCategoryChange}
                  >
                    <option value="" disabled hidden>Select a category</option>
                    {CATS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {errors.category && <p className="text-red-500 text-[11px] font-semibold">{errors.category}</p>}
                </div>

                {/* Item Name */}
                <div className="space-y-1.5">
                  <label className="block text-[13px] font-semibold text-slate-500 mb-1.5">Item Name *</label>
                  <select
                    className={`w-full px-3.5 py-2.5 rounded-lg border ${
                      errors.title ? "border-red-500 bg-red-50" : "border-slate-300 bg-white"
                    } text-[13px] font-semibold outline-none transition-all duration-200 focus:border-[#155F87] focus:ring-2 focus:ring-[#0B648D]/20 ${
                      (itemNameOther || form.title) ? "text-slate-800" : "text-slate-400 font-normal"
                    }`}
                    value={itemNameOther ? OTHER_ITEM_NAME : (form.title || "")}
                    onChange={handleItemNameChange}
                    disabled={!form.category}
                  >
                    <option value="" disabled hidden>
                      {form.category ? "Select item name" : "Select a category first"}
                    </option>
                    {itemNamePresets.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                    {form.category && (
                      <option value={OTHER_ITEM_NAME}>Other (please specify)</option>
                    )}
                  </select>

                  {itemNameOther && (
                    <input
                      className={`w-full mt-2 px-3.5 py-2.5 rounded-lg border ${
                        errors.title ? "border-red-500 bg-red-50" : "border-slate-300 bg-white"
                      } text-[13px] font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal outline-none transition-all duration-200 focus:border-[#155F87] focus:ring-2 focus:ring-[#0B648D]/20`}
                      name="title"
                      value={form.title} maxLength={30}
                      onChange={handleChange}
                      placeholder="Please specify the item name"
                      autoFocus
                    />
                  )}
                  {errors.title && <p className="text-red-500 text-[11px] font-semibold">{errors.title}</p>}
                </div>
              </div>

              {/* Reporter identity */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Reporting as</p>
                  <p className="text-sm font-bold text-slate-700 truncate">
                    {me ? `${me.first_name ?? ""} ${me.last_name ?? ""}`.trim() || "—" : "—"}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{me?.email || ""}</p>
                </div>
              </div>

              {/* Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 items-start">
                {/* Single-Line Vertical Location List */}
                <div className="space-y-1.5 sm:col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[13px] font-semibold text-slate-500">
                      Location Lost * <span className="text-slate-400 font-normal">(up to {MAX_LOCATIONS})</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowMap((prev) => !prev)}
                      className="text-[11px] font-bold uppercase tracking-wide text-[#155F87] hover:underline"
                    >
                      {showMap
                        ? 'Hide Map'
                        : `🗺️ View Campus Map${form.location.length ? ` (${form.location.length}/${MAX_LOCATIONS})` : ''}`}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium mb-1.5">
                    Pick the place(s) you remember being at when you had the item — where you think you lost it.
                  </p>

                  {/* 1 Line Per Location Box */}
                  <div className={`w-full rounded-xl border max-h-48 overflow-y-auto divide-y divide-slate-100 bg-slate-50/50 p-1 ${
                    errors.location ? "border-red-500 bg-red-50/30" : "border-slate-200"
                  }`}>
                    {AREAS.map((area) => {
                      const isSelected = form.location.includes(area);
                      const isDisabled = !isSelected && locationLimitReached;
                      return (
                        <button
                          key={area}
                          type="button"
                          onClick={() => handleLocationToggle(area)}
                          disabled={isDisabled}
                          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[13px] transition-all ${
                            isSelected
                              ? "bg-[#155F87] text-white font-semibold shadow-sm"
                              : isDisabled
                                ? "text-slate-300 font-medium cursor-not-allowed"
                                : "text-slate-700 font-medium hover:bg-slate-200/60"
                          }`}
                        >
                          <span className="truncate pr-2">{area === "Others" ? "Others (please specify)" : area}</span>
                          <span className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center text-[10px] font-bold border transition-colors ${
                            isSelected
                              ? "bg-white text-[#155F87] border-white"
                              : "border-slate-300 bg-white text-transparent"
                          }`}>
                            ✓
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {errors.location && <p className="text-red-500 text-[11px] font-semibold">{errors.location}</p>}
                  {!errors.location && locationLimitReached && (
                    <p className="text-slate-400 text-[11px] font-semibold">
                      Limit of {MAX_LOCATIONS} locations reached. Remove one to pick another.
                    </p>
                  )}

                  {/* Custom Location Field (When "Others" is selected) */}
                  {form.location.includes("Others") && (
                    <>
                    <p className="mt-2.5 mb-1 text-[11px] font-bold uppercase text-slate-500">If others, please specify *</p>
                    <input
                      className={`w-full mt-2.5 px-3.5 py-2.5 rounded-lg border ${
                        errors.other_location ? "border-red-500 bg-red-50" : "border-slate-300 bg-white"
                      } text-[13px] font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal outline-none transition-all duration-200 focus:border-[#155F87] focus:ring-2 focus:ring-[#0B648D]/20`}
                      name="other_location"
                      value={form.other_location}
                      onChange={handleChange}
                      placeholder="Please specify the area lost"
                      autoFocus
                    />
                    </>
                  )}
                  {errors.other_location && <p className="text-red-500 text-[11px] font-semibold">{errors.other_location}</p>}
                </div>
              </div>

              {/* Date Lost & Time — settable as a range (From / To) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Date Lost range */}
                <div className="space-y-1.5">
                  <label className="block text-[13px] font-semibold text-slate-500 mb-1.5">Date Lost *</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Start Date</span>
                      <input
                        className={`w-full px-3 py-2.5 rounded-lg border ${
                          errors.created_date ? "border-red-500 bg-red-50" : "border-slate-300 bg-white"
                        } text-[13px] font-semibold text-slate-800 outline-none transition-all duration-200 focus:border-[#155F87] focus:ring-2 focus:ring-[#0B648D]/20`}
                        type="date"
                        name="created_date"
                        value={form.created_date}
                        onChange={handleChange}
                        max={form.created_date_to || maxDate}
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">End Date</span>
                      <input
                        className={`w-full px-3 py-2.5 rounded-lg border ${
                          errors.created_date_to ? "border-red-500 bg-red-50" : "border-slate-300 bg-white"
                        } text-[13px] font-semibold text-slate-800 outline-none transition-all duration-200 focus:border-[#155F87] focus:ring-2 focus:ring-[#0B648D]/20`}
                        type="date"
                        name="created_date_to"
                        value={form.created_date_to}
                        onChange={handleChange}
                        min={form.created_date}
                        max={maxDate}
                      />
                    </div>
                  </div>
                  {errors.created_date && <p className="text-red-500 text-[11px] font-semibold">{errors.created_date}</p>}
                  {errors.created_date_to && <p className="text-red-500 text-[11px] font-semibold">{errors.created_date_to}</p>}
                </div>

                {/* Approx. Time range */}
                <div className="space-y-1.5">
                  <label className="block text-[13px] font-semibold text-slate-500 mb-1.5">Approx. Time</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Start Time</span>
                      <input
                        className="w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-[13px] font-semibold text-slate-800 outline-none transition-all duration-200 focus:border-[#155F87] focus:ring-2 focus:ring-[#0B648D]/20"
                        type="time"
                        name="created_time"
                        value={form.created_time}
                        onChange={handleChange}
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">End Time</span>
                      <input
                        className={`w-full px-3 py-2.5 rounded-lg border ${
                          errors.created_time_to ? "border-red-500 bg-red-50" : "border-slate-300 bg-white"
                        } text-[13px] font-semibold text-slate-800 outline-none transition-all duration-200 focus:border-[#155F87] focus:ring-2 focus:ring-[#0B648D]/20`}
                        type="time"
                        name="created_time_to"
                        value={form.created_time_to}
                        onChange={handleChange}
                      />
                    </div>
                  </div>
                  {errors.created_time_to && <p className="text-red-500 text-[11px] font-semibold">{errors.created_time_to}</p>}
                </div>
              </div>

              {/* Description (optional) */}
              <div className="space-y-1.5">
                <label className="block text-[13px] font-semibold text-slate-500 mb-1.5">
                  Description <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  className={`w-full px-3.5 py-2.5 rounded-lg border ${
                    errors.description ? "border-red-500 bg-red-50" : "border-slate-300 bg-white"
                  } text-[13px] font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal outline-none transition-all duration-200 focus:border-[#155F87] focus:ring-2 focus:ring-[#0B648D]/20`}
                  rows={3}
                  name="description"
                  value={form.description} maxLength={100}
                  onChange={handleChange}
                  placeholder="Mention unique marks, brand, stickers..."
                />
                <p className="mt-1 text-right text-[11px] font-semibold text-slate-400">{(form.description || "").length}/100</p>
                {errors.description && <p className="text-red-500 text-[11px] font-semibold">{errors.description}</p>}
              </div>

              <PhotoUpload name="image" value={form.image} onChange={handleChange} />

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-lg bg-slate-100 text-slate-500 text-[13px] font-bold uppercase tracking-wide transition duration-200 hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-[#0B648D] to-[#155F87] text-white text-[13px] font-bold uppercase tracking-wide shadow-md transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
                >
                  Submit
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      {/* CAMPUS MAP POPUP */}
      {showMap && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setShowMap(false)}
        >
          <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setShowMap(false)}
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white border border-slate-200 shadow-md hover:bg-slate-100 flex items-center justify-center text-slate-700 transition-colors z-10"
              aria-label="Close map"
            >
              <FaTimes size={13} />
            </button>
            <CampusHotspotMap
              selected={form.location}
              onSelect={handleMapSelect}
              onDone={() => setShowMap(false)}
            />
          </div>
        </div>
      )}

      {/* CONFIRMATION MODAL */}
      {showConfirm && (
        <div className="fixed inset-0 z-[70] bg-[#0B648D]/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white p-7 rounded-2xl w-full max-w-xs text-center shadow-[0_20px_60px_rgba(0,0,0,.18)] border border-slate-100 font-sans">
            <div className="w-14 h-14 bg-blue-50 text-[#155F87] rounded-full flex items-center justify-center mx-auto mb-4 text-xl">📁</div>
            <h3 className="font-bold text-[#184C73] uppercase tracking-wide text-[15px]">Confirm Report?</h3>
            <p className="text-[12px] mt-3 text-slate-500 leading-relaxed font-medium">
              Please double check the details. Once submitted, this record will be verified by the SAO.
            </p>
            <div className="flex flex-col gap-2 mt-6">
              <button
                onClick={confirmSubmit}
                disabled={isSubmitting}
                className="w-full bg-gradient-to-r from-[#0B648D] to-[#155F87] disabled:from-slate-400 disabled:to-slate-400 disabled:cursor-not-allowed text-white py-3 rounded-lg font-bold uppercase tracking-wide text-[11px] hover:opacity-90 transition-all"
              >
                {isSubmitting ? "Submitting..." : "Yes, Submit Now"}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                disabled={isSubmitting}
                className="w-full bg-slate-100 text-slate-400 py-3 rounded-lg font-bold uppercase tracking-wide text-[11px] hover:bg-slate-200 transition-all disabled:cursor-not-allowed disabled:opacity-60"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportLostModal;
