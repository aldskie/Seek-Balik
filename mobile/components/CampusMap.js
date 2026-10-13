import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { getItems } from '../api/api';
import { View, Text, Pressable, Modal, Animated } from 'react-native';
import { WebView } from 'react-native-webview';

import { useAppearance } from '../hooks/Appearance';

// ==========================================================
// CAMPUS MAP (Leaflet inside a WebView)
//
// The map is drawn by Leaflet (the same library the website uses) inside a
// WebView, with MapTiler satellite tiles. No Google Maps API key is needed,
// so the map works the same in Expo Go and in the built APK.
//
// React Native keeps all the data and logic (item counts, colors, the
// building modal). The WebView only draws: React Native sends it the
// current colors / selection / dark mode with injectJavaScript, and the
// WebView reports building taps back with postMessage.
// ==========================================================

const MAPTILER_KEY = (process.env.EXPO_PUBLIC_MAPTILER_KEY || '').trim();

if (!MAPTILER_KEY) {
  console.warn(
    'EXPO_PUBLIC_MAPTILER_KEY is missing: the campus map will show buildings without the satellite background.'
  );
}

const SLC_LOCATION = {
  latitude: 16.6370,
  longitude: 120.31316,
};

const BUILDINGS = [
  {
    id: 'parking-area',
    number: '1',
    name: 'Parking Area',
    coordinates: [
      { latitude: 16.6368921, longitude: 120.3127909 },
      { latitude: 16.6368775, longitude: 120.3127177 },
      { latitude: 16.6366997, longitude: 120.3127532 },
      { latitude: 16.6366368, longitude: 120.3124243 },
      { latitude: 16.6368032, longitude: 120.3123881 },
      { latitude: 16.636784, longitude: 120.3122774 },
      { latitude: 16.6356352, longitude: 120.3127609 },
      { latitude: 16.6357739, longitude: 120.3130326 },
      { latitude: 16.6368921, longitude: 120.3127909 },
    ],
  },

  {
    id: 'father-burgos-gym',
    number: '2',
    name: 'Father Burgos Gym',
    coordinates: [
      { latitude: 16.6362402, longitude: 120.3134927 },
      { latitude: 16.6361689, longitude: 120.3131683 },
      { latitude: 16.6358867, longitude: 120.3132285 },
      { latitude: 16.6359596, longitude: 120.3135501 },
      { latitude: 16.6362402, longitude: 120.3134927 },
    ],
  },

  {
    id: 'main-building',
    number: '3',
    name: 'Main Building',
    coordinates: [
      { latitude: 16.6366210, longitude: 120.3137517 },
      { latitude: 16.6364612, longitude: 120.3137874 },
      { latitude: 16.6363437, longitude: 120.3131083 },
      { latitude: 16.6364221, longitude: 120.3130975 },
      { latitude: 16.6364126, longitude: 120.3130189 },
      { latitude: 16.6365330, longitude: 120.3129886 },
      { latitude: 16.6365489, longitude: 120.3130405 },
      { latitude: 16.6366950, longitude: 120.3129942 },
      { latitude: 16.6366837, longitude: 120.3129370 },
      { latitude: 16.6368065, longitude: 120.3129047 },
      { latitude: 16.6368176, longitude: 120.3129605 },
      { latitude: 16.6368979, longitude: 120.3129448 },
      { latitude: 16.6370498, longitude: 120.3136750 },
      { latitude: 16.6368955, longitude: 120.3137020 },
      { latitude: 16.6368737, longitude: 120.3136063 },
      { latitude: 16.6369154, longitude: 120.3135974 },
      { latitude: 16.6368051, longitude: 120.3130783 },
      { latitude: 16.6364768, longitude: 120.3131651 },
      { latitude: 16.6365668, longitude: 120.3136812 },
      { latitude: 16.6366273, longitude: 120.3136576 },
      { latitude: 16.6366469, longitude: 120.3137507 },
      { latitude: 16.6366210, longitude: 120.3137517 },
    ],
  },

  {
    id: 'library',
    number: '4',
    name: 'Library',
    coordinates: [
      { latitude: 16.6365752, longitude: 120.3136398 },
      { latitude: 16.636543, longitude: 120.3135033 },
      { latitude: 16.6366416, longitude: 120.3134809 },
      { latitude: 16.6366331, longitude: 120.3134421 },
      { latitude: 16.6367443, longitude: 120.3134166 },
      { latitude: 16.6367574, longitude: 120.313448 },
      { latitude: 16.6368681, longitude: 120.3134195 },
      { latitude: 16.6369022, longitude: 120.3135619 },
      { latitude: 16.6368034, longitude: 120.3135796 },
      { latitude: 16.6368104, longitude: 120.3136242 },
      { latitude: 16.636709, longitude: 120.3136441 },
      { latitude: 16.6366978, longitude: 120.3136068 },
      { latitude: 16.6365752, longitude: 120.3136398 },
    ],
  },

  {
    // Shown as "ICT Center", the same name the location dropdowns use.
    id: 'ict-basement',
    number: '5',
    name: 'ICT Center',
    coordinates: [
      { latitude: 16.6363099, longitude: 120.3135899 },
      { latitude: 16.6362883, longitude: 120.3134812 },
      { latitude: 16.6359542, longitude: 120.3135674 },
      { latitude: 16.6359717, longitude: 120.3136624 },
      { latitude: 16.6363099, longitude: 120.3135899 },
    ],
  },

  {
    id: 'sao-lobby',
    number: '6',
    name: 'SAO Lobby',
    coordinates: [
      { latitude: 16.6362582, longitude: 120.3133404 },
      { latitude: 16.6362078, longitude: 120.3130857 },
      { latitude: 16.6361288, longitude: 120.3131056 },
      { latitude: 16.6361767, longitude: 120.3133555 },
      { latitude: 16.6362582, longitude: 120.3133404 },
    ],
  },

  {
    id: 'grandstand',
    number: '7',
    name: 'Grandstand',
    coordinates: [
      { latitude: 16.6368642, longitude: 120.3126994 },
      { latitude: 16.6367197, longitude: 120.3127292 },
      { latitude: 16.6366838, longitude: 120.3125479 },
      { latitude: 16.6368229, longitude: 120.3125134 },
      { latitude: 16.6368642, longitude: 120.3126994 },
    ],
  },

  {
    id: 'shs-building',
    number: '8',
    name: 'SHS Building',
    coordinates: [
      { latitude: 16.6376208, longitude: 120.3134109 },
      { latitude: 16.6376021, longitude: 120.3132668 },
      { latitude: 16.6373647, longitude: 120.3133051 },
      { latitude: 16.6373453, longitude: 120.3131414 },
      { latitude: 16.6372139, longitude: 120.3131623 },
      { latitude: 16.6372161, longitude: 120.3131884 },
      { latitude: 16.6371444, longitude: 120.3131991 },
      { latitude: 16.6372041, longitude: 120.313755 },
      { latitude: 16.6373227, longitude: 120.3137295 },
      { latitude: 16.6372962, longitude: 120.3134536 },
      { latitude: 16.6376208, longitude: 120.3134109 },
    ],
  },

  {
    id: 'junior-high-school',
    number: '9',
    name: 'Junior High School',
    coordinates: [
      { latitude: 16.6380216, longitude: 120.3138136 },
      { latitude: 16.6383384, longitude: 120.3137728 },
      { latitude: 16.6383284, longitude: 120.3136295 },
      { latitude: 16.6382715, longitude: 120.3136354 },
      { latitude: 16.6382439, longitude: 120.3133465 },
      { latitude: 16.6382923, longitude: 120.3133386 },
      { latitude: 16.6382794, longitude: 120.3131872 },
      { latitude: 16.6376185, longitude: 120.3132571 },
      { latitude: 16.6376317, longitude: 120.3134124 },
      { latitude: 16.6381066, longitude: 120.313358 },
      { latitude: 16.6381337, longitude: 120.31365 },
      { latitude: 16.6379938, longitude: 120.3136706 },
      { latitude: 16.6380216, longitude: 120.3138136 },
    ],
  },

  {
    id: 'cdc',
    number: '10',
    name: 'CDC',
    coordinates: [
      { latitude: 16.6382378, longitude: 120.3140364 },
      { latitude: 16.6382379, longitude: 120.3139948 },
      { latitude: 16.6383036, longitude: 120.3139786 },
      { latitude: 16.6382883, longitude: 120.3137839 },
      { latitude: 16.6379522, longitude: 120.3138155 },
      { latitude: 16.637969, longitude: 120.313995 },
      { latitude: 16.6381727, longitude: 120.3139772 },
      { latitude: 16.6381817, longitude: 120.3140445 },
      { latitude: 16.6382378, longitude: 120.3140364 },
    ],
  },

  {
    id: 'old-elementary',
    number: '11',
    name: 'Old Elementary',
    coordinates: [
      { latitude: 16.637968, longitude: 120.3139891 },
      { latitude: 16.6379307, longitude: 120.3137045 },
      { latitude: 16.6375773, longitude: 120.3137678 },
      { latitude: 16.6376192, longitude: 120.3140986 },
      { latitude: 16.6377404, longitude: 120.3140821 },
      { latitude: 16.6377105, longitude: 120.3138757 },
      { latitude: 16.63782, longitude: 120.3138524 },
      { latitude: 16.6378513, longitude: 120.3140126 },
      { latitude: 16.637968, longitude: 120.3139891 },
    ],
  },

  {
    id: 'slc-canteen',
    number: '12',
    name: 'SLC Canteen',
    coordinates: [
      { latitude: 16.6375612, longitude: 120.3141067 },
      { latitude: 16.6375526, longitude: 120.3140361 },
      { latitude: 16.637608, longitude: 120.3140265 },
      { latitude: 16.6375787, longitude: 120.3137662 },
      { latitude: 16.6373333, longitude: 120.3138138 },
      { latitude: 16.6373649, longitude: 120.314132 },
      { latitude: 16.6375612, longitude: 120.3141067 },
    ],
  },

  {
    id: 'slc-new-elementary',
    number: '13',
    name: 'SLC New Elem. Bldg.',
    coordinates: [
      { latitude: 16.6372609, longitude: 120.3141594 },
      { latitude: 16.6371998, longitude: 120.3138622 },
      { latitude: 16.6371523, longitude: 120.3138643 },
      { latitude: 16.6371442, longitude: 120.313838 },
      { latitude: 16.6371126, longitude: 120.3138414 },
      { latitude: 16.6370653, longitude: 120.3136235 },
      { latitude: 16.6368837, longitude: 120.3136654 },
      { latitude: 16.6368904, longitude: 120.313718 },
      { latitude: 16.6367414, longitude: 120.3137477 },
      { latitude: 16.6367954, longitude: 120.3140473 },
      { latitude: 16.6368335, longitude: 120.3140472 },
      { latitude: 16.6368592, longitude: 120.31419 },
      { latitude: 16.63694, longitude: 120.314177 },
      { latitude: 16.63703, longitude: 120.3142055 },
      { latitude: 16.6372609, longitude: 120.3141594 },
    ],
  },

  {
    id: 'cea-building',
    number: '14',
    name: 'CEA Building',
    coordinates: [
      { latitude: 16.6367858, longitude: 120.3141524 },
      { latitude: 16.6367555, longitude: 120.3139421 },
      { latitude: 16.6367142, longitude: 120.3139548 },
      { latitude: 16.6366793, longitude: 120.3138318 },
      { latitude: 16.6364589, longitude: 120.3138802 },
      { latitude: 16.6364677, longitude: 120.3140544 },
      { latitude: 16.636502, longitude: 120.3140595 },
      { latitude: 16.6365035, longitude: 120.3141101 },
      { latitude: 16.6367459, longitude: 120.314188 },
      { latitude: 16.6367858, longitude: 120.3141524 },
    ],
  },

  {
    id: 'slc-chapel',
    number: '15',
    name: 'SLC Chapel',
    coordinates: [
      { latitude: 16.6373386, longitude: 120.313111 },
      { latitude: 16.6372645, longitude: 120.312781 },
      { latitude: 16.6370931, longitude: 120.3128249 },
      { latitude: 16.6371557, longitude: 120.3131441 },
      { latitude: 16.6373386, longitude: 120.313111 },
    ],
  },

  {
    id: 'hm-lab',
    number: '16',
    name: 'HM Lab',
    coordinates: [
      { latitude: 16.6376791, longitude: 120.3132721 },
      { latitude: 16.6376627, longitude: 120.3131365 },
      { latitude: 16.6373495, longitude: 120.3131709 },
      { latitude: 16.6373586, longitude: 120.3133108 },
      { latitude: 16.6376791, longitude: 120.3132721 },
    ],
  },

  {
    id: 'highschool-library-ict',
    number: '17',
    name: 'HS Library & ICT',
    coordinates: [
      { latitude: 16.6382767, longitude: 120.3131861 },
      { latitude: 16.6382623, longitude: 120.3130682 },
      { latitude: 16.6376727, longitude: 120.3131297 },
      { latitude: 16.6376766, longitude: 120.3131802 },
      { latitude: 16.637693, longitude: 120.3131753 },
      { latitude: 16.6377054, longitude: 120.3132479 },
      { latitude: 16.6382767, longitude: 120.3131861 },
    ],
  },

  {
    id: 'fr-theophile-verbist',
    number: '18',
    name: 'Fr. Theophile Verbist',
    coordinates: [
      { latitude: 16.6371063, longitude: 120.3124499 },
      { latitude: 16.6370694, longitude: 120.3123556 },
      { latitude: 16.6371785, longitude: 120.3123009 },
      { latitude: 16.6371377, longitude: 120.3121901 },
      { latitude: 16.6369196, longitude: 120.312292 },
      { latitude: 16.6370015, longitude: 120.3124927 },
      { latitude: 16.6371063, longitude: 120.3124499 },
    ],
  },
];

// ---------------------------------------------------------------------------
// LOCATION -> BUILDING
//
// The exact location values the app and the website save on an item (the
// stored values of ItemDetails.LOCATIONS in items/models.py, in lowercase),
// each pointing at the polygon that represents it on this map.
//
// This table is what makes the colors accurate. The map used to guess by
// comparing the saved text with each polygon's display name, which silently
// missed every building whose two names differ ("Gymnasium" vs "Father
// Burgos Gym", "Chapel" vs "SLC Chapel", "Verbist Building" vs "Fr. Theophile
// Verbist", and so on), so those polygons always stayed green.
//
// Notes:
//   - Every polygon on this map has exactly one dropdown choice in the app,
//     the website and ItemDetails.LOCATIONS (items/models.py).
//   - "Criminology Building" is the same building as "Verbist Building" and
//     is no longer a dropdown choice. It stays here only so reports saved
//     with it earlier are still counted on the Fr. Theophile Verbist
//     polygon.
//   - "sao lobby" and "ict basement" are older spellings, kept so reports
//     saved with them are still counted.
// ---------------------------------------------------------------------------
const LOCATION_TO_BUILDING = {
  grandstand: 'grandstand',
  'verbist building': 'fr-theophile-verbist',
  // Older reports only (same building as Verbist; no longer a choice).
  'criminology building': 'fr-theophile-verbist',
  'parking area': 'parking-area',
  'junior high school': 'junior-high-school',
  'high school library & ict': 'highschool-library-ict',
  'ict basement': 'ict-basement',
  chapel: 'slc-chapel',
  'administrative building (main building)': 'main-building',
  library: 'library',
  gymnasium: 'father-burgos-gym',
  'ict center': 'ict-basement',
  'new building (cea building)': 'cea-building',
  'new elementary building': 'slc-new-elementary',
  'slc canteen': 'slc-canteen',
  'old elementary building': 'old-elementary',
  'conrado dela cruz sports center (cdc)': 'cdc',
  'senior high school department building': 'shs-building',
  'hm laboratory building': 'hm-lab',
  'student affairs office lobby': 'sao-lobby',
  'sao lobby': 'sao-lobby',
};

// Which reports count toward each number, by status (compared in lowercase).
// Same rule as the Dashboard cards:
//   - Lost (this decides the polygon color): Claimed, Declined and Archived
//     lost reports are not counted.
//   - Found: Claimed and Archived surrendered items are not counted.
//   - Claimed: every item at the building whose status is Claimed.
const LOST_EXCLUDED_STATUSES = ['claimed', 'declined', 'archived'];
const SURRENDERED_EXCLUDED_STATUSES = ['claimed', 'archived'];

const normalize = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase();

// Handles both a plain array and DRF pagination's {results: [...]}.
const toList = (data) =>
  Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];

const getPolygonCenter = (coordinates) => {
  const latitude =
    coordinates.reduce((sum, point) => sum + point.latitude, 0) /
    coordinates.length;

  const longitude =
    coordinates.reduce((sum, point) => sum + point.longitude, 0) /
    coordinates.length;

  return { latitude, longitude };
};

const BUILDINGS_WITH_CENTERS = BUILDINGS.map((building) => ({
  ...building,
  center: getPolygonCenter(building.coordinates),
}));

const getHotspotColor = (lostCount) => {
  if (lostCount >= 5) return '#ef4444'; // High
  if (lostCount >= 3) return '#f97316'; // Mild
  if (lostCount >= 1) return '#eab308'; // Low
  return '#15803d'; // None
};

// Fallback for text that is not one of the saved dropdown values — mainly
// what someone typed under "Others" (e.g. "near the parking area"). It looks
// for a polygon's own name or id inside the text.
const findBuildingIdsByName = (location) => {
  const matched = [];

  BUILDINGS.forEach((building) => {
    const bName = building.name.toLowerCase();
    const bId = building.id.replace(/-/g, ' ');
    const bNum = building.number;

    if (
      location === building.id ||
      location.includes(bName) ||
      location.includes(bId) ||
      location.includes(`building ${bNum}`) ||
      location.includes(`#${bNum}`)
    ) {
      matched.push(building.id);
    }
  });

  return matched;
};

// The polygons an item belongs to. An item can list several locations
// ("Library, Gymnasium"); each one is looked up in LOCATION_TO_BUILDING
// first, and only falls back to name matching when it isn't a known value.
const getBuildingIdsForItem = (item) => {
  const rawLocations =
    item.buildingId || item.building_id || item.location_id || item.location;

  if (!rawLocations) return [];

  const locationList = Array.isArray(rawLocations)
    ? rawLocations.map(normalize)
    : String(rawLocations).split(',').map(normalize);

  const matchedIds = new Set();

  locationList.filter(Boolean).forEach((location) => {
    const exact = LOCATION_TO_BUILDING[location];

    if (exact) {
      matchedIds.add(exact);
      return;
    }

    findBuildingIdsByName(location).forEach((id) => matchedIds.add(id));
  });

  return Array.from(matchedIds);
};

// ---------------------------------------------------------------------------
// THE PAGE INSIDE THE WEBVIEW
//
// Built once. Building shapes and the tile key are written into the page;
// colors, selection and dark mode arrive later through window.applyState().
// Building names are set with textContent (never as HTML).
// ---------------------------------------------------------------------------
const buildMapHtml = () => {
  const buildingsForWeb = BUILDINGS_WITH_CENTERS.map((building) => ({
    id: building.id,
    name: building.name,
    coords: building.coordinates.map((p) => [p.latitude, p.longitude]),
    center: [building.center.latitude, building.center.longitude],
  }));

  const tileUrl = MAPTILER_KEY
    ? `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}?key=${encodeURIComponent(MAPTILER_KEY)}`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #e5e7eb; }
  body.dark, body.dark #map { background: #1e293b; }
  .leaflet-container { font-family: -apple-system, Roboto, sans-serif; }
  .lbl-icon { background: transparent; border: none; }
  .lbl {
    position: absolute;
    transform: translate(-50%, -50%);
    width: max-content;
    max-width: 120px;
    padding: 3px 8px;
    border: 1px solid #15803d;
    border-radius: 999px;
    background: #ffffff;
    color: #16233F;
    font-size: 9px;
    font-weight: 800;
    line-height: 1.2;
    text-align: center;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
    white-space: normal;
  }
  body.dark .lbl { background: #0f172a; color: #f1f5f9; }
  .leaflet-control-attribution { font-size: 8px; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  (function () {
    var BUILDINGS = ${JSON.stringify(buildingsForWeb)};
    var TILE_URL = ${JSON.stringify(tileUrl)};
    var CENTER = ${JSON.stringify([SLC_LOCATION.latitude, SLC_LOCATION.longitude])};

    function send(message) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
      }
    }

    if (typeof L === 'undefined') {
      send({ type: 'error', message: 'Leaflet could not load (no internet?)' });
      return;
    }

    var map = L.map('map', {
      center: CENTER,
      zoom: 18,
      maxZoom: 20,
      zoomControl: true,
      attributionControl: true,
    });

    if (TILE_URL) {
      L.tileLayer(TILE_URL, {
        maxZoom: 20,
        tileSize: 256,
        attribution: '&copy; MapTiler &copy; OpenStreetMap contributors',
      }).addTo(map);
    }

    var layers = {};
    var state = { colors: {}, selectedId: null, isDark: false };

    function press(id) {
      send({ type: 'press', id: id });
    }

    BUILDINGS.forEach(function (b) {
      var polygon = L.polygon(b.coords, {
        color: '#15803d',
        weight: 2,
        fillColor: '#15803d',
        fillOpacity: 0.45,
      }).addTo(map);

      var label = document.createElement('div');
      label.className = 'lbl';
      label.textContent = b.name;

      var marker = L.marker(b.center, {
        icon: L.divIcon({ className: 'lbl-icon', html: label, iconSize: [0, 0] }),
        keyboard: false,
      }).addTo(map);

      polygon.on('click', function () { press(b.id); });
      marker.on('click', function () { press(b.id); });

      layers[b.id] = { polygon: polygon, label: label };
    });

    var allPoints = [];
    BUILDINGS.forEach(function (b) { allPoints = allPoints.concat(b.coords); });
    var campusBounds = L.latLngBounds(allPoints);

    function fitCampus() {
      map.invalidateSize();
      map.fitBounds(campusBounds, {
        paddingTopLeft: [30, 90],
        paddingBottomRight: [30, 30],
        animate: false,
      });
    }

    function redraw() {
      document.body.classList.toggle('dark', !!state.isDark);
      var selectedStroke = state.isDark ? '#E2E8F0' : '#16233F';

      BUILDINGS.forEach(function (b) {
        var layer = layers[b.id];
        var color = state.colors[b.id] || '#15803d';
        var isSelected = state.selectedId === b.id;

        layer.polygon.setStyle({
          color: isSelected ? selectedStroke : color,
          weight: isSelected ? 3 : 2,
          fillColor: color,
          fillOpacity: isSelected ? 0.7 : 0.45,
        });
        layer.label.style.borderColor = color;
      });
    }

    // Called from React Native with { colors, selectedId, isDark }.
    window.applyState = function (next) {
      state = Object.assign({}, state, next || {});
      redraw();
    };

    window.addEventListener('resize', fitCampus);
    fitCampus();
    redraw();
    send({ type: 'ready' });
  })();
</script>
</body>
</html>`;
};

// `items` is optional. When the screen that shows the map already has the
// item list (the Dashboard passes its own), the map uses that list, so its
// numbers always agree with the cards on the same screen and the list is
// not fetched twice. Without the prop, the map loads the items itself.
export default function CampusMap({ items: itemsFromParent }) {
  const { isDark } = useAppearance();

  const usesParentItems = Array.isArray(itemsFromParent);

  const [fetchedItems, setFetchedItems] = useState([]);
  const [selectedArea, setSelectedArea] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [mapError, setMapError] = useState('');

  const modalAnimation = useRef(new Animated.Value(0)).current;

  // The WebView page. Built once; later changes are sent with applyState.
  const webViewRef = useRef(null);
  const [webReady, setWebReady] = useState(false);
  const mapHtml = useMemo(() => buildMapHtml(), []);

  useEffect(() => {
    // The parent supplies (and refreshes) the list, so nothing to load here.
    if (usesParentItems) return undefined;

    let isMounted = true;

    const loadItems = async () => {
      try {
        const data = await getItems();

        if (isMounted) {
          setFetchedItems(toList(data));
        }
      } catch (error) {
        console.error('Failed to load map item reports:', error);
      }
    };

    loadItems();

    // Refresh map counts while this screen remains open.
    const refreshInterval = setInterval(loadItems, 5000);

    return () => {
      isMounted = false;
      clearInterval(refreshInterval);
    };
  }, [usesParentItems]);

  const items = usesParentItems ? itemsFromParent : fetchedItems;

  const buildingStats = useMemo(() => {
    const stats = Object.fromEntries(
      BUILDINGS.map((building) => [
        building.id,
        {
          total: 0,
          lost: 0,
          surrendered: 0,
          claimed: 0,
          items: [],
        },
      ])
    );

    items.forEach((item) => {
      const buildingIds = getBuildingIdsForItem(item);
      if (buildingIds.length === 0) return;

      const status = normalize(item.status);
      const isLost = item.type === 'Lost';
      const isSurrendered = item.type === 'Surrendered' || item.type === 'Found';

      // Decided once per item, then applied to each building it lists.
      const countsAsLost = isLost && !LOST_EXCLUDED_STATUSES.includes(status);
      const countsAsSurrendered =
        isSurrendered && !SURRENDERED_EXCLUDED_STATUSES.includes(status);
      const countsAsClaimed = status === 'claimed';

      buildingIds.forEach((buildingId) => {
        if (!stats[buildingId]) return;

        const stat = stats[buildingId];
        stat.total += 1;
        stat.items.push(item);

        if (countsAsLost) stat.lost += 1;
        if (countsAsSurrendered) stat.surrendered += 1;
        if (countsAsClaimed) stat.claimed += 1;
      });
    });

    return stats;
  }, [items]);

  // Changes only when some building's color changes, so the map is updated
  // exactly then (not on every 5-second refresh).
  const colorSignature = useMemo(
    () =>
      BUILDINGS.map((building) => getHotspotColor(buildingStats[building.id]?.lost || 0)).join('|'),
    [buildingStats]
  );

  const colorsById = useMemo(() => {
    const colors = colorSignature.split('|');
    return Object.fromEntries(BUILDINGS.map((building, i) => [building.id, colors[i]]));
  }, [colorSignature]);

  const selectedId = selectedArea?.id || null;

  // Sends the current colors / selection / dark mode to the map page.
  useEffect(() => {
    if (!webReady) return;

    const state = JSON.stringify({ colors: colorsById, selectedId, isDark: !!isDark });
    webViewRef.current?.injectJavaScript(
      `window.applyState && window.applyState(${state}); true;`
    );
  }, [webReady, colorsById, selectedId, isDark]);

  const selectedStats = selectedArea
    ? buildingStats[selectedArea.id]
    : null;

  const openBuildingModal = useCallback(
    (building) => {
      setSelectedArea(building);
      setModalVisible(true);
      modalAnimation.stopAnimation();
      modalAnimation.setValue(0);

      Animated.timing(modalAnimation, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    },
    [modalAnimation]
  );

  const closeBuildingModal = useCallback(() => {
    Animated.timing(modalAnimation, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setModalVisible(false);
        setSelectedArea(null);
      }
    });
  }, [modalAnimation]);

  // Messages from the map page: 'ready' once Leaflet is set up, 'press'
  // when a building or its label is tapped.
  const handleMapMessage = useCallback(
    (event) => {
      let message;
      try {
        message = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }

      if (message?.type === 'ready') {
        setMapError('');
        setWebReady(true);
        return;
      }

      if (message?.type === 'error') {
        setMapError('The map could not load. Check your internet connection.');
        return;
      }

      if (message?.type === 'press') {
        const building = BUILDINGS_WITH_CENTERS.find((b) => b.id === message.id);
        if (building) openBuildingModal(building);
      }
    },
    [openBuildingModal]
  );

  return (
    <View>
      <View className="mb-[30px] rounded-[18px] border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <View className="h-[420px] w-full overflow-hidden rounded-[14px] bg-gray-200 dark:bg-slate-800">
          <WebView
            ref={webViewRef}
            originWhitelist={['*']}
            source={{ html: mapHtml }}
            onMessage={handleMapMessage}
            // A reload (e.g. Android freeing memory) waits for 'ready' again.
            onLoadStart={() => setWebReady(false)}
            onError={() =>
              setMapError('The map could not load. Check your internet connection.')
            }
            javaScriptEnabled
            domStorageEnabled
            nestedScrollEnabled
            setSupportMultipleWindows={false}
            scrollEnabled={false}
            overScrollMode="never"
            style={{ flex: 1, backgroundColor: 'transparent' }}
          />

          {mapError ? (
            <View className="absolute inset-0 items-center justify-center px-6">
              <Text className="text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
                {mapError}
              </Text>
            </View>
          ) : null}

          <View
            pointerEvents="none"
            className="absolute left-3 right-3 top-3 rounded-xl bg-white/95 px-3 py-2.5 shadow-md dark:bg-slate-900/95"
          >
            <Text className="text-sm font-black text-[#16233F] dark:text-slate-100">
              Saint Louis College
            </Text>
            <Text className="mt-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              Carlatan, San Fernando, La Union
            </Text>
          </View>
        </View>

        <View className="px-2 pb-2 pt-3">
          <Text className="mb-2 text-[11px] font-extrabold text-[#16233F] dark:text-slate-100">
            Lost Item Hotspot Legend
          </Text>

          <View className="flex-row flex-wrap items-center gap-[14px]">
            <View className="flex-row items-center">
              <View className="mr-1.5 h-[9px] w-[9px] rounded-full bg-green-700" />
              <Text className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                None (0)
              </Text>
            </View>

            <View className="flex-row items-center">
              <View className="mr-1.5 h-[9px] w-[9px] rounded-full bg-yellow-500" />
              <Text className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                Low (1–2)
              </Text>
            </View>

            <View className="flex-row items-center">
              <View className="mr-1.5 h-[9px] w-[9px] rounded-full bg-orange-500" />
              <Text className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                Mild (3–4)
              </Text>
            </View>

            <View className="flex-row items-center">
              <View className="mr-1.5 h-[9px] w-[9px] rounded-full bg-red-500" />
              <Text className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                High (5+)
              </Text>
            </View>
          </View>
        </View>
      </View>

      <Modal
        visible={modalVisible}
        transparent
        animationType="none"
        onRequestClose={closeBuildingModal}
      >
        <View className="flex-1 justify-end">
          <Pressable
            className="absolute inset-0 bg-black/40 dark:bg-black/60"
            onPress={closeBuildingModal}
          />

          <Animated.View
            style={{
              opacity: modalAnimation,
              transform: [
                {
                  translateY: modalAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [300, 0],
                  }),
                },
              ],
            }}
            className="rounded-t-[28px] bg-white dark:bg-slate-900 px-5 pb-8 pt-3"
          >
            <View className="mb-5 items-center">
              <View className="h-1.5 w-12 rounded-full bg-slate-300 dark:bg-slate-700" />
            </View>

            <View className="flex-row items-center">
              <View
                className="mr-4 h-14 w-14 items-center justify-center rounded-full"
                style={{
                  backgroundColor: getHotspotColor(
                    selectedStats?.lost || 0
                  ),
                }}
              >
                <Text className="text-lg font-black text-white">
                  {selectedArea?.number}
                </Text>
              </View>

              <View className="flex-1">
                <Text className="text-[18px] font-black text-[#16233F] dark:text-slate-100">
                  {selectedArea?.name}
                </Text>
                <Text className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  Saint Louis College
                </Text>
              </View>

              <Pressable
                onPress={closeBuildingModal}
                className="h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"
              >
                <Text className="text-xl font-medium text-slate-500 dark:text-slate-300">
                  ×
                </Text>
              </Pressable>
            </View>

            <View className="mt-5 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800">
              <Text className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Building Statistics
              </Text>

              <Text className="mt-1.5 text-[14px] font-bold text-[#16233F] dark:text-slate-100">
                {selectedArea?.name}
              </Text>

              <View className="mt-4 flex-row gap-2">
                <View className="flex-1 rounded-xl bg-rose-50 p-2.5 dark:bg-rose-950">
                  <Text className="text-center text-lg font-black text-rose-600 dark:text-rose-300">
                    {selectedStats?.lost || 0}
                  </Text>
                  <Text className="text-center text-[9px] font-bold uppercase text-rose-500 dark:text-rose-400">
                    Lost
                  </Text>
                </View>

                <View className="flex-1 rounded-xl bg-amber-50 p-2.5 dark:bg-amber-950">
                  <Text className="text-center text-lg font-black text-amber-600 dark:text-amber-300">
                    {selectedStats?.surrendered || 0}
                  </Text>
                  <Text className="text-center text-[9px] font-bold uppercase text-amber-500 dark:text-amber-400">
                    Found
                  </Text>
                </View>

                <View className="flex-1 rounded-xl bg-emerald-50 p-2.5 dark:bg-emerald-950">
                  <Text className="text-center text-lg font-black text-emerald-600 dark:text-emerald-300">
                    {selectedStats?.claimed || 0}
                  </Text>
                  <Text className="text-center text-[9px] font-bold uppercase text-emerald-500 dark:text-emerald-400">
                    Claimed
                  </Text>
                </View>
              </View>
            </View>

            <Pressable
              onPress={closeBuildingModal}
              className="mt-4 h-12 items-center justify-center rounded-xl bg-[#16233F] dark:bg-indigo-600"
            >
              <Text className="text-sm font-black text-white">
                Close
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}