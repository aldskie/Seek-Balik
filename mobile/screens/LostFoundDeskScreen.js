import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import {
  ChevronLeft,
  Clock,
  Crosshair,
  ExternalLink,
  Footprints,
  LocateOff,
  Maximize2,
  Navigation,
  PartyPopper,
} from 'lucide-react-native';

import { useAppearance } from '../hooks/Appearance';

const NAVY = '#1b2061';
const GOLD = '#f0c94a';
const MAPTILER_KEY = (process.env.EXPO_PUBLIC_MAPTILER_KEY || '').trim();

// ---- The desk ----
// The exact spot of the Lost and Found Desk at the Student Affairs Office,
// shown as a single point (no building outline). The pin, the walking
// route's end point and "You've arrived" all use it.
// GeoJSON gives [longitude, latitude] = [120.3130997, 16.6362184].
const DESK = {
  latitude: 16.6362184,
  longitude: 120.3130997,
};

// Same starting view as the Campus Map.
const CAMPUS_CENTER = {
  latitude: 16.637,
  longitude: 120.31316,
};

// ---- Guidance tuning ----
const ARRIVED_METERS = 20; // closer than this counts as "arrived"
const REROUTE_MOVED_METERS = 30; // re-plan after walking this far...
const REROUTE_MIN_MS = 10000; // ...but never more often than this
const OFF_ROUTE_METERS = 40; // or sooner when this far from the route
const WALK_METERS_PER_MIN = 80; // average walking pace
const ROUTE_TIMEOUT_MS = 10000;

const OFFICE_HOURS = 'Mon–Fri 8:00 AM–5:00 PM · Sat 8:00 AM–12:00 PM';

// ---- Geometry helpers ----

// Distance in meters between two { latitude, longitude } points.
const distanceMeters = (a, b) => {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// Compass bearing from a to b, in degrees (0 = north).
const bearingDegrees = (a, b) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const y = Math.sin(toRad(b.longitude - a.longitude)) * Math.cos(toRad(b.latitude));
  const x =
    Math.cos(toRad(a.latitude)) * Math.sin(toRad(b.latitude)) -
    Math.sin(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.cos(toRad(b.longitude - a.longitude));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
};

const COMPASS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
const compassWord = (degrees) => COMPASS[Math.round((Number(degrees) || 0) / 45) % 8];

const formatDistance = (meters) => {
  if (!Number.isFinite(meters)) return '—';
  if (meters < 1000) return `${Math.max(1, Math.round(meters))} m`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
};

const formatWalk = (meters) => {
  if (!Number.isFinite(meters)) return '—';
  const minutes = Math.max(1, Math.round(meters / WALK_METERS_PER_MIN));
  if (minutes < 60) return `${minutes} min walk`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min walk` : `${hours} hr walk`;
};

// Index of the route point closest to the user, and how far away it is.
const nearestOnRoute = (route, here) => {
  let index = 0;
  let best = Infinity;
  route.forEach((point, i) => {
    const d = distanceMeters(point, here);
    if (d < best) {
      best = d;
      index = i;
    }
  });
  return { index, distance: best };
};

// Walking distance left: from the user to the nearest route point, along
// the rest of the route, then the last stretch to the desk.
const remainingAlongRoute = (route, here) => {
  if (!route || route.length < 2) return distanceMeters(here, DESK);
  const { index, distance } = nearestOnRoute(route, here);
  let total = distance;
  for (let i = index; i < route.length - 1; i += 1) {
    total += distanceMeters(route[i], route[i + 1]);
  }
  return total + distanceMeters(route[route.length - 1], DESK);
};

// Turns an OSRM step into a short instruction, e.g. "Turn left onto Rizal St".
const buildInstruction = (step) => {
  const maneuver = step?.maneuver || {};
  const type = maneuver.type || '';
  const modifier = maneuver.modifier || '';
  const onto = step?.name ? ` onto ${step.name}` : '';

  if (type === 'depart') {
    return `Head ${compassWord(maneuver.bearing_after)}${step?.name ? ` on ${step.name}` : ''}`;
  }
  if (type === 'arrive') return 'Continue to the Student Affairs Office';
  if (type === 'roundabout' || type === 'rotary') {
    return maneuver.exit ? `At the roundabout, take exit ${maneuver.exit}` : 'Go through the roundabout';
  }
  if (!modifier || modifier === 'straight') return `Continue straight${onto}`;
  if (modifier === 'uturn') return 'Make a U-turn';
  return `Turn ${modifier.replace('slight', 'slightly')}${onto}`;
};

// Walking route from the user to the desk, or null when it can't be loaded.
async function fetchWalkingRoute(from) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS);
  try {
    const url =
      'https://routing.openstreetmap.de/routed-foot/route/v1/foot/' +
      `${from.longitude},${from.latitude};${DESK.longitude},${DESK.latitude}` +
      '?overview=full&geometries=geojson&steps=true';
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const data = await response.json();
    const route = data?.routes?.[0];
    if (!route?.geometry?.coordinates?.length) return null;

    return {
      points: route.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
      steps: (route.legs?.[0]?.steps || []).map((step) => ({
        text: buildInstruction(step),
        location: step.maneuver?.location
          ? { latitude: step.maneuver.location[1], longitude: step.maneuver.location[0] }
          : null,
        type: step.maneuver?.type,
      })),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// { latitude, longitude } -> [lat, lng] for Leaflet.
const toLatLng = (point) => (point ? [point.latitude, point.longitude] : null);

// ---------------------------------------------------------------------------
// THE PAGE INSIDE THE WEBVIEW (built once)
// ---------------------------------------------------------------------------
const buildMapHtml = () => {
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
  .leaflet-container { font-family: -apple-system, Roboto, sans-serif; }
  .plain-icon { background: transparent; border: none; }

  /* Lost & Found Desk pin: label, pointer, gold dot (anchored on the dot) */
  .desk { width: 140px; display: flex; flex-direction: column; align-items: center; }
  .desk-label {
    background: ${NAVY};
    border: 1px solid ${GOLD};
    border-radius: 8px;
    padding: 4px 8px;
    color: #ffffff;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
  }
  .desk-pointer {
    width: 0; height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 7px solid ${NAVY};
  }
  .desk-dot {
    margin-top: 2px;
    width: 10px; height: 10px;
    border-radius: 50%;
    background: ${GOLD};
    border: 2px solid #ffffff;
  }

  /* The user's location: blue dot with a soft halo */
  .me {
    width: 16px; height: 16px;
    border-radius: 50%;
    background: #2563eb;
    border: 3px solid #ffffff;
    box-shadow: 0 0 0 8px rgba(37, 99, 235, 0.25);
    box-sizing: border-box;
  }
  .leaflet-control-attribution { font-size: 8px; }
</style>
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  (function () {
    var TILE_URL = ${JSON.stringify(tileUrl)};
    var DESK = ${JSON.stringify(toLatLng(DESK))};
    var CENTER = ${JSON.stringify(toLatLng(CAMPUS_CENTER))};

    function send(message) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
      }
    }

    if (typeof L === 'undefined') {
      send({ type: 'error' });
      return;
    }

    var map = L.map('map', {
      center: CENTER,
      zoom: 18,
      maxZoom: 20,
      zoomControl: false,
      attributionControl: true,
    });

    if (TILE_URL) {
      L.tileLayer(TILE_URL, {
        maxZoom: 20,
        tileSize: 256,
        attribution: '&copy; MapTiler &copy; OpenStreetMap contributors',
      }).addTo(map);
    }

    // Walking route: white casing under an indigo line.
    var routeCasing = L.polyline([], { color: '#FFFFFF', weight: 8, opacity: 1 }).addTo(map);
    var routeLine = L.polyline([], { color: '#4F46E5', weight: 5, opacity: 1 }).addTo(map);

    // Last stretch (or the whole way when there is no route).
    var dashed = L.polyline([], { color: '${GOLD}', weight: 4, opacity: 1, dashArray: '8 8' }).addTo(map);

    // Desk pin.
    var desk = document.createElement('div');
    desk.className = 'desk';
    var deskLabel = document.createElement('div');
    deskLabel.className = 'desk-label';
    deskLabel.textContent = 'Lost & Found Desk';
    var deskPointer = document.createElement('div');
    deskPointer.className = 'desk-pointer';
    var deskDot = document.createElement('div');
    deskDot.className = 'desk-dot';
    desk.appendChild(deskLabel);
    desk.appendChild(deskPointer);
    desk.appendChild(deskDot);

    L.marker(DESK, {
      icon: L.divIcon({
        className: 'plain-icon',
        html: desk,
        iconSize: [140, 46],
        iconAnchor: [70, 39], // centre of the gold dot
      }),
      keyboard: false,
      interactive: false,
      zIndexOffset: 1000,
    }).addTo(map);

    // User location dot (added once the location is known).
    var me = document.createElement('div');
    me.className = 'me';
    var meMarker = L.marker(DESK, {
      icon: L.divIcon({ className: 'plain-icon', html: me, iconSize: [16, 16], iconAnchor: [8, 8] }),
      keyboard: false,
      interactive: false,
      zIndexOffset: 2000,
    });

    // Called from React Native with { here, route, dashed } ([lat, lng] values).
    window.applyState = function (s) {
      s = s || {};

      if (s.here) {
        meMarker.setLatLng(s.here);
        if (!map.hasLayer(meMarker)) meMarker.addTo(map);
      } else if (map.hasLayer(meMarker)) {
        map.removeLayer(meMarker);
      }

      var route = s.route || [];
      routeCasing.setLatLngs(route);
      routeLine.setLatLngs(route);
      dashed.setLatLngs(s.dashed || []);
    };

    // Called from React Native to move the view.
    //   { type: 'overview', from }  -> fit the user and the desk (or zoom to the desk)
    //   { type: 'center', point, zoom }
    window.camera = function (c) {
      c = c || {};
      map.invalidateSize();

      if (c.type === 'overview') {
        if (!c.from) {
          map.setView(DESK, 18, { animate: true });
          return;
        }
        map.fitBounds(L.latLngBounds([c.from, DESK]), {
          paddingTopLeft: [50, 80],
          paddingBottomRight: [50, 260],
          maxZoom: 19,
          animate: true,
        });
        return;
      }

      if (c.type === 'center' && c.point) {
        map.setView(c.point, c.zoom || map.getZoom(), { animate: true });
      }
    };

    // Only the user's own drags (not camera moves) stop "follow me".
    map.on('dragstart', function () { send({ type: 'drag' }); });

    send({ type: 'ready' });
  })();
</script>
</body>
</html>`;
};

export default function LostFoundDeskScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isDark } = useAppearance();
  const navyIcon = isDark ? '#C7D2FE' : NAVY;
  const mutedIcon = isDark ? '#94A3B8' : '#5B647A';

  const webViewRef = useRef(null);
  const webReadyRef = useRef(false);
  const [webReady, setWebReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const mapHtml = useMemo(() => buildMapHtml(), []);

  const watchRef = useRef(null);
  const lastRouteFromRef = useRef(null);
  const lastRouteAtRef = useRef(0);
  const routingRef = useRef(false);
  const fittedRef = useRef(false);
  const followingRef = useRef(false);
  // Latest route and position, readable inside callbacks.
  const routeRef = useRef(null);
  const hereRef = useRef(null);

  // 'checking' | 'granted' | 'denied' | 'unavailable'
  const [permission, setPermission] = useState('checking');
  const [here, setHere] = useState(null);
  const [route, setRoute] = useState(null); // { points, steps } or null
  const [routeFailed, setRouteFailed] = useState(false);
  const [routing, setRouting] = useState(false);
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    followingRef.current = following;
  }, [following]);

  // Runs a camera command on the map page (ignored until the page is ready;
  // the page shows the right view itself once it reports 'ready').
  const moveCamera = useCallback((command) => {
    if (!webReadyRef.current) return;
    webViewRef.current?.injectJavaScript(
      `window.camera && window.camera(${JSON.stringify(command)}); true;`
    );
  }, []);

  // Fits the user and the desk on screen together, or zooms to the desk
  // when the user's location isn't known yet.
  const showOverview = useCallback(
    (from) => {
      moveCamera({ type: 'overview', from: toLatLng(from) });
    },
    [moveCamera],
  );

  // Plans (or re-plans) the walking route from the given position.
  const planRoute = useCallback(async (from) => {
    if (routingRef.current) return;
    routingRef.current = true;
    setRouting(true);
    lastRouteFromRef.current = from;
    lastRouteAtRef.current = Date.now();

    const result = await fetchWalkingRoute(from);
    routingRef.current = false;
    setRouting(false);

    if (result) {
      routeRef.current = result;
      setRoute(result);
      setRouteFailed(false);
    } else {
      // Keep the previous route if there was one; otherwise a straight line is shown.
      setRouteFailed(true);
    }
  }, []);

  // Called for every location update.
  const handlePosition = useCallback(
    (position) => {
      const next = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      hereRef.current = next;
      setHere(next);

      if (!fittedRef.current) {
        if (webReadyRef.current) {
          fittedRef.current = true;
          showOverview(next);
        }
      } else if (followingRef.current) {
        moveCamera({ type: 'center', point: toLatLng(next) });
      }

      if (distanceMeters(next, DESK) <= ARRIVED_METERS) return;

      const lastFrom = lastRouteFromRef.current;
      const movedEnough = !lastFrom || distanceMeters(lastFrom, next) >= REROUTE_MOVED_METERS;
      const waitedEnough = Date.now() - lastRouteAtRef.current >= REROUTE_MIN_MS;
      const current = routeRef.current;
      const offRoute =
        current?.points?.length > 1 &&
        nearestOnRoute(current.points, next).distance >= OFF_ROUTE_METERS;
      if (!lastFrom || ((movedEnough || offRoute) && waitedEnough)) {
        planRoute(next);
      }
    },
    [moveCamera, planRoute, showOverview],
  );

  // Starts watching the location while the screen is open, and stops when
  // the user leaves it (saves battery).
  const startTracking = useCallback(async () => {
    try {
      const servicesOn = await Location.hasServicesEnabledAsync();
      if (!servicesOn) {
        setPermission('unavailable');
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermission('denied');
        return;
      }
      setPermission('granted');

      // A quick first fix so the map doesn't wait for the watcher.
      const last = await Location.getLastKnownPositionAsync();
      if (last) handlePosition(last);

      watchRef.current?.remove();
      watchRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 5,
          timeInterval: 3000,
        },
        handlePosition,
      );
    } catch (err) {
      console.warn('Location tracking failed:', err?.message || err);
      setPermission('unavailable');
    }
  }, [handlePosition]);

  useFocusEffect(
    useCallback(() => {
      startTracking();
      return () => {
        watchRef.current?.remove();
        watchRef.current = null;
      };
    }, [startTracking]),
  );

  // ---- What the card shows ----
  const straightDistance = here ? distanceMeters(here, DESK) : null;
  const arrived = straightDistance !== null && straightDistance <= ARRIVED_METERS;
  const routePoints = route?.points || null;
  const remaining = here ? remainingAlongRoute(routePoints, here) : null;

  // The next turn: the first step after "depart" that is still ahead.
  const nextStep = (() => {
    if (!here) return null;
    if (!route?.steps?.length) {
      return {
        text: `Head ${compassWord(bearingDegrees(here, DESK))} toward the Student Affairs Office`,
        distance: straightDistance,
      };
    }
    const ahead = route.steps.find(
      (step, i) => i > 0 && step.location && distanceMeters(here, step.location) > 10,
    );
    if (!ahead) {
      return { text: 'Continue to the Student Affairs Office', distance: straightDistance };
    }
    return { text: ahead.text, distance: distanceMeters(here, ahead.location) };
  })();

  // The dashed last stretch: from where the route ends (or from the user
  // when there is no route) to the desk.
  const dashedFrom = routePoints?.length ? routePoints[routePoints.length - 1] : here;
  const showDashed = dashedFrom && distanceMeters(dashedFrom, DESK) > 3;

  // Sends the user dot, route and dashed line to the map page.
  useEffect(() => {
    if (!webReady) return;

    const state = {
      here: permission === 'granted' ? toLatLng(here) : null,
      route: routePoints?.length > 1 && !arrived ? routePoints.map(toLatLng) : [],
      dashed: showDashed && !arrived ? [toLatLng(dashedFrom), toLatLng(DESK)] : [],
    };

    webViewRef.current?.injectJavaScript(
      `window.applyState && window.applyState(${JSON.stringify(state)}); true;`
    );
  }, [webReady, permission, here, routePoints, arrived, showDashed, dashedFrom]);

  // Messages from the map page.
  const handleMapMessage = useCallback(
    (event) => {
      let message;
      try {
        message = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }

      if (message?.type === 'ready') {
        webReadyRef.current = true;
        setWebReady(true);
        setMapError(false);
        // First view: the user and the desk together (or just the desk).
        fittedRef.current = !!hereRef.current;
        showOverview(hereRef.current);
        return;
      }

      if (message?.type === 'error') {
        setMapError(true);
        return;
      }

      if (message?.type === 'drag') {
        if (followingRef.current) setFollowing(false);
      }
    },
    [showOverview],
  );

  const openInMapsApp = () => {
    const destination = `${DESK.latitude},${DESK.longitude}`;
    const url =
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?daddr=${destination}&dirflg=w`
        : `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=walking`;
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View className="flex-1 bg-slate-100 dark:bg-slate-950">
      <StatusBar style="light" backgroundColor={NAVY} translucent={false} />

      <SafeAreaView edges={['top']} className="bg-[#1b2061]">
        <View className="flex-row items-center px-4 pb-5 pt-2">
          <TouchableOpacity
            onPress={() => navigation.canGoBack() && navigation.goBack()}
            className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-white/10"
            accessibilityLabel="Back to profile"
          >
            <ChevronLeft size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-[12px] font-bold tracking-widest text-white/60">
              CAMPUS LOST &amp; FOUND DESK
            </Text>
            <Text className="text-2xl font-bold text-white">Student Affairs Office</Text>
          </View>
        </View>
      </SafeAreaView>

      <View className="flex-1 bg-gray-200 dark:bg-slate-800">
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: mapHtml }}
          onMessage={handleMapMessage}
          // A reload (e.g. Android freeing memory) waits for 'ready' again.
          onLoadStart={() => {
            webReadyRef.current = false;
            setWebReady(false);
          }}
          onError={() => setMapError(true)}
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          scrollEnabled={false}
          overScrollMode="never"
          style={{ flex: 1, backgroundColor: 'transparent' }}
        />

        {mapError && (
          <View className="absolute left-0 right-0 top-6 items-center px-6">
            <Text className="rounded-xl bg-white/95 px-3 py-2 text-center text-xs font-semibold text-slate-600 dark:bg-slate-900/95 dark:text-slate-300">
              The map could not load. Check your internet connection.
            </Text>
          </View>
        )}

        {/* Map buttons */}
        {permission === 'granted' && here && (
          <View className="absolute right-4 top-4">
            <TouchableOpacity
              onPress={() => {
                setFollowing(true);
                moveCamera({ type: 'center', point: toLatLng(here), zoom: 19 });
              }}
              accessibilityLabel="Center on my location"
              className={`mb-2 h-11 w-11 items-center justify-center rounded-full shadow ${
                following ? 'bg-[#1b2061] dark:bg-indigo-600' : 'bg-white dark:bg-slate-900'
              }`}
            >
              <Crosshair size={20} color={following ? '#FFFFFF' : navyIcon} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setFollowing(false);
                showOverview(here);
              }}
              accessibilityLabel="Show me and the desk"
              className="h-11 w-11 items-center justify-center rounded-full bg-white shadow dark:bg-slate-900"
            >
              <Maximize2 size={18} color={navyIcon} />
            </TouchableOpacity>
          </View>
        )}

        {/* Guidance card */}
        <View
          className="absolute left-4 right-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-800 dark:bg-slate-900"
          style={{ bottom: insets.bottom + 16 }}
        >
          {permission === 'checking' || (permission === 'granted' && !here) ? (
            <View className="flex-row items-center">
              <ActivityIndicator size="small" color={navyIcon} />
              <Text className="ml-3 text-sm font-semibold text-slate-600 dark:text-slate-300">
                Finding your location…
              </Text>
            </View>
          ) : permission !== 'granted' ? (
            <View>
              <View className="flex-row items-center">
                <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-950">
                  <LocateOff size={20} color={isDark ? '#FB7185' : '#E11D48'} />
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-bold text-[#16233F] dark:text-slate-100">
                    {permission === 'denied' ? 'Location permission is off' : 'Location is turned off'}
                  </Text>
                  <Text className="mt-0.5 text-xs leading-4 text-slate-500 dark:text-slate-400">
                    {permission === 'denied'
                      ? 'Allow location access so we can guide you to the desk.'
                      : "Turn on your phone's location (GPS) so we can guide you to the desk."}
                  </Text>
                </View>
              </View>
              <View className="mt-3 flex-row gap-2">
                {/* Permission off: open the phone's settings for this app. */}
                {permission === 'denied' && (
                  <TouchableOpacity
                    onPress={() => Linking.openSettings()}
                    className="h-10 flex-1 items-center justify-center rounded-xl bg-[#1b2061] dark:bg-indigo-600"
                  >
                    <Text className="text-xs font-bold text-white">Open Settings</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={startTracking}
                  className={`h-10 flex-1 items-center justify-center rounded-xl ${
                    permission === 'denied'
                      ? 'border border-slate-300 dark:border-slate-700'
                      : 'bg-[#1b2061] dark:bg-indigo-600'
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      permission === 'denied' ? 'text-[#1b2061] dark:text-indigo-200' : 'text-white'
                    }`}
                  >
                    Try again
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : arrived ? (
            <View className="flex-row items-center">
              <View className="mr-3 h-11 w-11 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-950">
                <PartyPopper size={22} color={isDark ? '#6EE7B7' : '#047857'} />
              </View>
              <View className="flex-1">
                <Text className="text-base font-bold text-[#16233F] dark:text-slate-100">You've arrived</Text>
                <Text className="mt-0.5 text-xs leading-4 text-slate-500 dark:text-slate-400">
                  The Lost and Found Desk is at the Student Affairs Office lobby. Bring your School ID.
                </Text>
              </View>
            </View>
          ) : (
            <View>
              {/* Next instruction */}
              <View className="flex-row items-center">
                <View className="mr-3 h-11 w-11 items-center justify-center rounded-full bg-[#1b2061] dark:bg-indigo-600">
                  <Navigation size={20} color="#FFFFFF" />
                </View>
                <View className="flex-1">
                  <Text className="text-[15px] font-bold text-[#16233F] dark:text-slate-100" numberOfLines={2}>
                    {nextStep?.text}
                  </Text>
                  <Text className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    in {formatDistance(nextStep?.distance)}
                  </Text>
                </View>
                {routing && <ActivityIndicator size="small" color={navyIcon} />}
              </View>

              {/* Totals */}
              <View className="mt-3 flex-row items-center border-t border-slate-100 pt-3 dark:border-slate-800">
                <View className="flex-1 flex-row items-center">
                  <Footprints size={14} color={mutedIcon} />
                  <Text className="ml-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {formatDistance(remaining)} · {formatWalk(remaining)}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={openInMapsApp}
                  className="flex-row items-center rounded-full bg-[#EEF1F7] px-3 py-1.5 dark:bg-slate-800"
                  accessibilityLabel="Open directions in the maps app"
                >
                  <ExternalLink size={12} color={navyIcon} />
                  <Text className="ml-1 text-[11px] font-bold text-[#1b2061] dark:text-indigo-200">Maps app</Text>
                </TouchableOpacity>
              </View>

              {routeFailed && !routePoints && (
                <Text className="mt-2 text-[11px] leading-4 text-amber-700 dark:text-amber-300">
                  Walking route unavailable right now, so a straight line to the office is shown.
                </Text>
              )}

              <View className="mt-2 flex-row items-center">
                <Clock size={12} color={mutedIcon} />
                <Text className="ml-1.5 text-[11px] text-slate-400">{OFFICE_HOURS}</Text>
              </View>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}