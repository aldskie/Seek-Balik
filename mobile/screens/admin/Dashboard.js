import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Package,
  Users,
  Map,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  CalendarClock,
  CalendarDays,
} from 'lucide-react-native';
import CampusMap from '../../components/CampusMap';
import ReportTrendChart from '../../components/ReportTrendChart';
import ConfirmationModal from '../../components/ConfirmationModal';
import { useTabBarVisibility } from '../../hooks/TabBarVisibility';
import { useAppearance } from '../../hooks/Appearance';
import { refreshUnreadCount, useUnreadCount } from '../../hooks/UnreadNotifications';

// API services
import { getItems, getUsers, getClaims } from '../../api/api';

const HEADER_BG = '#1b2061';
const NAVY = '#1b2061';

// Class strings reused below, each with its light and dark colors.
const SECTION_BAR = 'mr-2 h-4 w-1 rounded-full bg-[#1b2061] dark:bg-indigo-500';
const SECTION_TITLE = 'text-sm font-bold text-[#16233F] dark:text-slate-100';
const GREEN_PILL = 'bg-[#E7F5EC] dark:bg-emerald-950';
const GREEN_TEXT = 'text-[#1E6E3C] dark:text-emerald-300';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const dateKeyFor = (year, month, day) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

// Handles both a plain array and DRF pagination's {results: [...]}; returns null when the payload is neither, so callers can tell "no data" apart from "bad response".
const toList = (data) =>
  Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : null;

const normalize = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase();

// Statuses left out of the KPI card counts (compared in lowercase).
// Lost Reports card: Claimed, Declined and Archived lost items are not counted.
// Surrendered Items card: Claimed and Archived surrendered items are not counted.
const LOST_EXCLUDED_STATUSES = ['claimed', 'declined', 'archived'];
const SURRENDERED_EXCLUDED_STATUSES = ['claimed', 'archived'];

// KPI cards (same rules as the website's Dashboard):
//   Lost Reports / Surrendered Items  only items still open: status Pending
//                                     or Approved, split into the two.
//   Resolved Matches                  claimed lost reports (resolved) plus
//                                     claimed surrendered items (released).
//   Active Users                      accounts not deactivated, split into
//                                     staff (Admin / Moderator) and users
//                                     (students and employees).
const typeOf = (item) => normalize(item?.type);
const isLostItem = (item) => typeOf(item) === 'lost';
const isSurrenderedItem = (item) => ['surrendered', 'found'].includes(typeOf(item));
const countWithStatus = (list, status) =>
  list.filter((item) => normalize(item.status) === status).length;

const STAFF_ROLES = ['admin', 'administrator', 'moderator', 'superadmin', 'super admin'];

// True for an Admin or Moderator account, whichever field the role is in.
const isStaffAccount = (user) => {
  if (!user) return false;
  if (user.is_superuser === true || user.is_staff === true) return true;
  return [user.role, user.user_role, user.account_type, user.user_type]
    .filter((value) => typeof value === 'string')
    .some((value) => STAFF_ROLES.includes(normalize(value)));
};

// Deactivated accounts (is_active === false) are not counted as active.
const isActiveAccount = (user) => user?.is_active !== false;

// True when the item is of the given type and its status is not in the excluded list.
const countsTowardCard = (item, type, excludedStatuses) =>
  item.type === type && !excludedStatuses.includes(normalize(item.status));

// A claim shows on the calendar purely by its status: only claims whose status is "Scheduled" count. Review flags (staff_scheduled, needs_manual_review, answer mismatches) and the item's own status are deliberately ignored.
const isScheduledClaim = (claim) =>
  !!claim &&
  (normalize(claim.status) === 'scheduled' || normalize(claim.claim_status) === 'scheduled');

// Parses the "HH:MM AM/PM - HH:MM AM/PM" (or single "HH:MM AM/PM") meeting_time string down to just its start hour/minute, used to stack a claim's clock time onto its meeting_date.
const parseTimeRangeStart = (timeRange) => {
  if (!timeRange) return null;

  const startStr = String(timeRange).split('-')[0].trim();
  const match = startStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;

  let [, hh, mm, meridiem] = match;
  hh = parseInt(hh, 10);
  mm = parseInt(mm, 10);

  if (/PM/i.test(meridiem) && hh !== 12) hh += 12;
  if (/AM/i.test(meridiem) && hh === 12) hh = 0;

  return { hours: hh, minutes: mm };
};

const MONTH_PREFIXES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const monthIndexFor = (name) => MONTH_PREFIXES.indexOf(String(name).slice(0, 3).toLowerCase());

// Reads a calendar day out of whatever shape the API stored it in, without relying on the JS engine's own string parsing (Hermes rejects most non-ISO strings, which silently dropped those meetings from the calendar).
// Handles "2026-10-05", "2026-10-05T09:00:00Z", "10/05/2026", "October 5, 2026", "Mon, Oct 5, 2026", "5 October 2026" and "Oct 5" (current year assumed).
const parseDateOnly = (value) => {
  if (!value) return null;

  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  const str = String(value).trim();
  let match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

  match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) return new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]));

  // Month name first: "October 5, 2026", "Mon, Oct 5, 2026", "Oct 5"
  match = str.match(/([A-Za-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/);
  if (match && monthIndexFor(match[1]) >= 0) {
    const yearValue = match[3] ? Number(match[3]) : new Date().getFullYear();
    return new Date(yearValue, monthIndexFor(match[1]), Number(match[2]));
  }

  // Day first: "5 October 2026"
  match = str.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,})\.?(?:,?\s+(\d{4}))?/);
  if (match && monthIndexFor(match[2]) >= 0) {
    const yearValue = match[3] ? Number(match[3]) : new Date().getFullYear();
    return new Date(yearValue, monthIndexFor(match[2]), Number(match[1]));
  }

  const fallback = new Date(str);
  return isNaN(fallback.getTime()) ? null : fallback;
};

// The raw date value a claim carries, preferring meeting_date and falling back to a handful of alternate field names various API versions may have used.
const getRawScheduleDate = (claim) =>
  claim.meeting_date || claim.scheduled_date || claim.scheduledDate || claim.meetingDate || claim.schedule_date || claim.scheduleDate || claim.appointment_date || claim.appointmentDate || null;

// Resolves the actual Date a claim is scheduled for, with the meeting's start time stacked on top when it can be read.
const getScheduleDate = (claim) => {
  const parsed = parseDateOnly(getRawScheduleDate(claim));
  if (!parsed) return null;

  const base = new Date(parsed.getTime());
  const time = parseTimeRangeStart(claim.meeting_time);
  if (time) base.setHours(time.hours, time.minutes, 0, 0);

  return base;
};

const claimantLabel = (claim) => claim.claimant_name || 'Unnamed claimant';

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const { handleScroll } = useTabBarVisibility();
  const navigation = useNavigation();

  // Unread in-app notifications, shared with the badge on the tab bar.
  const unreadCount = useUnreadCount();

  // Colors passed as values (icons, inline styles) follow the app's appearance.
  const { isDark } = useAppearance();
  const navyIcon = isDark ? '#C7D2FE' : NAVY;
  const greenIcon = isDark ? '#6EE7B7' : '#1E6E3C';

  const [items, setItems] = useState([]);
  const [claims, setClaims] = useState([]);
  const [mapModalVisible, setMapModalVisible] = useState(false);

  const [calendarCursor, setCalendarCursor] = useState(new Date());
  const [selectedDateKey, setSelectedDateKey] = useState(null);
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);

  // Default to false so cards render zeroed values immediately while fetching
  const [refreshing, setRefreshing] = useState(false);
  const lastSummaryRef = useRef('');
  const [metrics, setMetrics] = useState({
    lost: 0,
    lostPending: 0,
    lostApproved: 0,
    surrendered: 0,
    surrenderedPending: 0,
    surrenderedApproved: 0,
    resolved: 0,
    lostResolved: 0,
    surrenderedReleased: 0,
    activeUsers: 0,
    staff: 0,
    regularUsers: 0,
  });

  const topHotspot = useMemo(() => {
    // Same rule as the Lost Reports card and the map colors: Claimed,
    // Declined and Archived lost reports are not counted.
    // A report can list several areas ("Library, Gymnasium"); each area gets
    // its own count instead of the whole text being treated as one place.
    const lostByLocation = items.reduce((counts, item) => {
      if (!countsTowardCard(item, 'Lost', LOST_EXCLUDED_STATUSES)) return counts;

      const areas = String(item.location || '')
        .split(',')
        .map((area) => area.trim())
        .filter(Boolean);

      (areas.length > 0 ? areas : ['Unspecified area']).forEach((area) => {
        counts[area] = (counts[area] || 0) + 1;
      });

      return counts;
    }, {});

    const sortedHotspots = Object.entries(lostByLocation).sort(
      ([locationA, countA], [locationB, countB]) =>
        countB - countA || locationA.localeCompare(locationB)
    );

    if (sortedHotspots.length === 0) {
      return {
        location: 'No lost reports',
        count: 0,
      };
    }

    const [location, count] = sortedHotspots[0];

    return { location, count };
  }, [items]);

  // Fetch with strict timeout handling
  const fetchLiveMetrics = async () => {
    try {
      const fetchWithTimeout = (promise, ms = 4000) =>
        Promise.race([
          promise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms)),
        ]);

      const [itemsRes, usersRes, claimsRes] = await Promise.allSettled([
        fetchWithTimeout(getItems()),
        fetchWithTimeout(getUsers()),
        // Claims get a longer timeout: the list is the largest payload here, and a timeout used to silently empty the calendar.
        fetchWithTimeout(getClaims({}), 10000),
      ]);

      const items = itemsRes.status === 'fulfilled' ? toList(itemsRes.value) || [] : [];
      setItems(items);

      const users = usersRes.status === 'fulfilled' ? toList(usersRes.value) || [] : [];

      // Only replace the claims when the request actually returned a list, so one slow or failed poll never wipes the calendar.
      const fetchedClaims = claimsRes.status === 'fulfilled' ? toList(claimsRes.value) : null;
      if (fetchedClaims) {
        setClaims(fetchedClaims);
      } else {
        console.warn(
          'Dashboard: claims could not be loaded for the calendar.',
          claimsRes.status === 'rejected' ? claimsRes.reason : claimsRes.value
        );
      }

      // The full item list is still fetched (the chart and map need it);
      // the cards count from it with the rules described at the top.
      const lostItems = items.filter(isLostItem);
      const surrenderedItems = items.filter(isSurrenderedItem);

      const lostPending = countWithStatus(lostItems, 'pending');
      const lostApproved = countWithStatus(lostItems, 'approved');
      const surrenderedPending = countWithStatus(surrenderedItems, 'pending');
      const surrenderedApproved = countWithStatus(surrenderedItems, 'approved');
      const lostResolved = countWithStatus(lostItems, 'claimed');
      const surrenderedReleased = countWithStatus(surrenderedItems, 'claimed');

      const activeAccounts = users.filter(isActiveAccount);
      const staff = activeAccounts.filter(isStaffAccount).length;

      setMetrics({
        lost: lostPending + lostApproved,
        lostPending,
        lostApproved,
        surrendered: surrenderedPending + surrenderedApproved,
        surrenderedPending,
        surrenderedApproved,
        resolved: lostResolved + surrenderedReleased,
        lostResolved,
        surrenderedReleased,
        activeUsers: activeAccounts.length,
        staff,
        regularUsers: activeAccounts.length - staff,
      });
    } catch (err) {
      console.warn('API Fetch issue:', err);
    } finally {
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchLiveMetrics();
      // Coming back from the notifications list: update the bell right away.
      refreshUnreadCount();
      const interval = setInterval(fetchLiveMetrics, 5000);
      return () => clearInterval(interval);
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchLiveMetrics();
  };

  // Narrows all claims down to the ones that count as scheduled (status is Scheduled)
  const scheduledClaims = useMemo(() => claims.filter(isScheduledClaim), [claims]);

  // Buckets scheduled claims by their "YYYY-MM-DD" schedule date so each calendar cell can look up its own list in O(1)
  const scheduleByDate = useMemo(() => {
    const map = {};

    scheduledClaims.forEach((claim) => {
      const scheduled = getScheduleDate(claim);
      if (!scheduled) return;

      const key = dateKeyFor(scheduled.getFullYear(), scheduled.getMonth(), scheduled.getDate());
      if (!map[key]) map[key] = [];
      map[key].push(claim);
    });

    return map;
  }, [scheduledClaims]);

  // Prints the status breakdown to the console whenever it changes, so the "scheduled" count can be checked against the statuses the API actually returns.
  useEffect(() => {
    const statusCounts = {};
    claims.forEach((claim) => {
      const label = String(claim.status ?? claim.claim_status ?? '(none)');
      statusCounts[label] = (statusCounts[label] || 0) + 1;
    });

    const summary = JSON.stringify({
      totalClaims: claims.length,
      statusCounts,
      countedAsScheduled: scheduledClaims.length,
      scheduledWithoutReadableDate: scheduledClaims.filter((claim) => !getScheduleDate(claim)).length,
    });

    if (summary !== lastSummaryRef.current) {
      lastSummaryRef.current = summary;
    }
  }, [claims, scheduledClaims]);

  const totalScheduled = useMemo(
    () => Object.values(scheduleByDate).reduce((sum, entries) => sum + entries.length, 0),
    [scheduleByDate]
  );

  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const monthLabel = calendarCursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Builds a full 7-column month grid (leading blanks for the 1st's weekday offset, then one cell per day) so the calendar reads like a real month instead of a scrolling day strip
  const monthCells = useMemo(() => {
    const firstWeekday = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const blanks = Array.from({ length: firstWeekday }, () => null);

    const days = Array.from({ length: daysInMonth }, (_, index) => {
      const day = index + 1;
      const key = dateKeyFor(year, month, day);

      return { day, key, count: (scheduleByDate[key] || []).length };
    });

    return [...blanks, ...days];
  }, [year, month, scheduleByDate]);

  const today = new Date();
  const todayKey = dateKeyFor(today.getFullYear(), today.getMonth(), today.getDate());

  // Clears the day selection whenever the visible month changes, since a previously selected date wouldn't exist on the new grid anyway
  const goToMonth = useCallback((delta) => {
    setCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
    setSelectedDateKey(null);
  }, []);

  const handleDayPress = (key) => {
    setSelectedDateKey(key);
    setScheduleModalVisible(true);
  };

  // Sorts the selected day's claims chronologically by their resolved meeting time before rendering the list
  const scheduledForSelected = useMemo(() => {
    if (!selectedDateKey) return [];

    return [...(scheduleByDate[selectedDateKey] || [])].sort((a, b) => {
      const timeA = getScheduleDate(a)?.getTime() || 0;
      const timeB = getScheduleDate(b)?.getTime() || 0;
      return timeA - timeB;
    });
  }, [selectedDateKey, scheduleByDate]);

  const selectedDateLabel = selectedDateKey
    ? new Date(`${selectedDateKey}T00:00:00`).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  // Each KPI has an icon color and badge background for light and dark mode.
  const KPI_METRICS = [
    {
      id: 'lost',
      label: 'Lost Reports',
      value: metrics.lost,
      subtext: `${metrics.lostPending} pending · ${metrics.lostApproved} approved`,
      icon: AlertTriangle,
      iconColor: isDark ? '#FCD34D' : '#B45309',
      iconBg: isDark ? '#451A03' : '#FEF3C7',
    },
    {
      id: 'surrendered',
      label: 'Surrendered Items',
      value: metrics.surrendered,
      subtext: `${metrics.surrenderedPending} pending · ${metrics.surrenderedApproved} approved`,
      icon: CheckCircle2,
      iconColor: isDark ? '#6EE7B7' : '#1E6E3C',
      iconBg: isDark ? '#022C22' : '#E7F5EC',
    },
    {
      id: 'resolved',
      label: 'Resolved Matches',
      value: metrics.resolved,
      subtext: `${metrics.lostResolved} lost ${
        metrics.lostResolved === 1 ? 'report' : 'reports'
      } resolved · ${metrics.surrenderedReleased} surrendered ${
        metrics.surrenderedReleased === 1 ? 'item' : 'items'
      } released`,
      icon: Package,
      iconColor: isDark ? '#C4B5FD' : '#6D28D9',
      iconBg: isDark ? '#2E1065' : '#EDE6FB',
    },
    {
      id: 'users',
      label: 'Active Users',
      value: metrics.activeUsers,
      subtext: `${metrics.staff} staff · ${metrics.regularUsers} ${
        metrics.regularUsers === 1 ? 'user' : 'users'
      } (students & employees)`,
      icon: Users,
      iconColor: isDark ? '#93C5FD' : '#1D4ED8',
      iconBg: isDark ? '#172554' : '#DBEAFE',
    },
  ];

  // Calendar day colors, set as inline styles.
  const calendarColors = isDark
    ? {
        selectedBg: '#4F46E5',
        scheduledBg: '#1E293B',
        todayBorder: '#A5B4FC',
        todayText: '#C7D2FE',
        dayText: '#F1F5F9',
        dot: '#6EE7B7',
      }
    : {
        selectedBg: NAVY,
        scheduledBg: '#EEF1F7',
        todayBorder: '#1b2061',
        todayText: NAVY,
        dayText: '#16233F',
        dot: '#1E6E3C',
      };

  return (
    <View className="flex-1 bg-white dark:bg-slate-950">
      <StatusBar style="light" backgroundColor={HEADER_BG} translucent={false} />

      {/* Header */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: HEADER_BG }} className="rounded-b-3xl">
        <View className="flex-row items-center justify-between px-4 pb-6 pt-2">
          <View>
            <Text className="text-[12px] font-bold tracking-widest text-white/60">
              Admin
            </Text>
            <Text className="text-2xl font-bold text-white">Dashboard</Text>
          </View>

          <TouchableOpacity
            className="h-10 w-10 items-center justify-center rounded-full bg-white/15"
            onPress={() => navigation.navigate('AdminNotifications')}
            accessibilityRole="button"
            accessibilityLabel={
              unreadCount > 0
                ? `Notifications, ${unreadCount} unread`
                : 'Notifications'
            }
          >
            <Bell size={18} color="#FFFFFF" />
            {unreadCount > 0 && (
              <View className="absolute -right-1 -top-1 h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1">
                <Text className="text-[10px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView
        className="flex-1"
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[isDark ? '#4F46E5' : HEADER_BG]}
            tintColor={navyIcon}
            progressBackgroundColor={isDark ? '#1E293B' : '#FFFFFF'}
          />
        }
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 20,
          paddingBottom: insets.bottom + 24,
        }}
      >
        {/* KPI metrics Grid */}
        <View className="mb-6 flex-row flex-wrap justify-between">
          {KPI_METRICS.map((metric) => {
            const Icon = metric.icon;
            return (
              <View
                key={metric.id}
                className="mb-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                style={{ width: '48%' }}
              >
                <View
                  className="mb-3 h-9 w-9 items-center justify-center rounded-full"
                  style={{ backgroundColor: metric.iconBg }}
                >
                  <Icon size={16} color={metric.iconColor} />
                </View>
                <Text className="text-2xl font-bold text-[#16233F] dark:text-slate-100">{metric.value}</Text>
                <Text className="mt-1 text-sm font-semibold text-[#16233F] dark:text-slate-100">{metric.label}</Text>
                <Text className="mt-0.5 text-xs leading-4 text-slate-500 dark:text-slate-400">{metric.subtext}</Text>
              </View>
            );
          })}
        </View>

        <View className="mb-3 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View className={SECTION_BAR} />
            <Text className={SECTION_TITLE}>Report Trend</Text>
          </View>
        </View>
        <ReportTrendChart items={items} />

        {/* Campus Hotspot Map */}
        <View className="mb-3 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View className={SECTION_BAR} />

            <Text className={SECTION_TITLE}>
              Campus Hotspot Map
            </Text>
          </View>

          {/* Current top hotspot (moved here from the header). */}
          <View className="ml-3 shrink rounded-full bg-[#EEF1F7] px-3 py-1 dark:bg-slate-800">
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              className="text-[11px] font-bold text-[#1b2061] dark:text-indigo-200"
            >
              🔥 Hotspot: {topHotspot.location}
            </Text>
          </View>
        </View>

        <CampusMap items={items} />

        {/* Claim verification schedule — a real month grid, driven by claims whose status is Scheduled */}
        <View className="mb-3 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View className={SECTION_BAR} />
            <Text className={SECTION_TITLE}>Claim Verification Schedule</Text>
          </View>

          <View className={`flex-row items-center rounded-full px-3 py-1 ${GREEN_PILL}`}>
            <CalendarDays size={11} color={greenIcon} />
            <Text className={`ml-1 text-[11px] font-bold ${GREEN_TEXT}`}>
              {totalScheduled} scheduled
            </Text>
          </View>
        </View>

        <View className="mb-3 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          {/* Month header with previous/next buttons */}
          <View className="flex-row items-center justify-between bg-white px-4 py-3.5 dark:bg-slate-900">
            <TouchableOpacity
              onPress={() => goToMonth(-1)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              className="h-8 w-8 items-center justify-center rounded-full bg-[#1b2061]/15 dark:bg-slate-800"
            >
              <ChevronLeft size={16} color={navyIcon} />
            </TouchableOpacity>

            <Text className="text-sm font-bold text-[#1b2061] dark:text-slate-100">{monthLabel}</Text>

            <TouchableOpacity
              onPress={() => goToMonth(1)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              className="h-8 w-8 items-center justify-center rounded-full bg-[#1b2061]/15 dark:bg-slate-800"
            >
              <ChevronRight size={16} color={navyIcon} />
            </TouchableOpacity>
          </View>

          <View className="p-4">
            <View className="flex-row">
              {WEEKDAY_LABELS.map((label, index) => (
                <View key={`${label}-${index}`} className="flex-1 items-center">
                  <Text className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {label}
                  </Text>
                </View>
              ))}
            </View>

            <View className="mt-2 flex-row flex-wrap">
              {monthCells.map((cell, index) => {
                if (!cell) {
                  return <View key={`blank-${index}`} style={{ width: '14.28%' }} className="aspect-square" />;
                }

                const isSelected = cell.key === selectedDateKey;
                const isToday = cell.key === todayKey;
                const hasSchedule = cell.count > 0;

                return (
                  <View key={cell.key} style={{ width: '14.28%' }} className="aspect-square items-center justify-center p-0.5">
                    <TouchableOpacity
                      onPress={() => handleDayPress(cell.key)}
                      activeOpacity={0.75}
                      className="h-full w-full items-center justify-center rounded-xl"
                      style={{
                        backgroundColor: isSelected
                          ? calendarColors.selectedBg
                          : hasSchedule
                            ? calendarColors.scheduledBg
                            : 'transparent',
                        borderWidth: isToday && !isSelected ? 1.5 : 0,
                        borderColor: calendarColors.todayBorder,
                      }}
                    >
                      <Text
                        className="text-[13px] font-bold"
                        style={{
                          color: isSelected
                            ? '#FFFFFF'
                            : isToday
                              ? calendarColors.todayText
                              : calendarColors.dayText,
                        }}
                      >
                        {cell.day}
                      </Text>

                      {hasSchedule && (
                        <View
                          className="mt-0.5 h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: isSelected ? '#FFFFFF' : calendarColors.dot }}
                        />
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>

            {/* Small legend so the dot's meaning is never ambiguous to a first-time viewer */}
            <View className="mt-3 flex-row items-center justify-center border-t border-slate-100 pt-3 dark:border-slate-800">
              <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: calendarColors.dot }} />
              <Text className="ml-1.5 text-[11px] text-slate-400">Has scheduled verification</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Full interactive map dialog.
          NOTE: nothing in this file sets mapModalVisible to true right
          now (the map is rendered inline above), so this is currently
          unreachable — restyled to match, ready for when it's wired up. */}
      <ConfirmationModal
        visible={mapModalVisible}
        tone="info"
        icon={Map}
        title="Campus Hotspot Map"
        confirmLabel="Close"
        dismissOnBackdrop
        onConfirm={() => setMapModalVisible(false)}
      >
        <View className="h-48 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-[#F7F8FB] dark:border-slate-700 dark:bg-slate-800">
          <Text className="text-sm text-slate-500 dark:text-slate-400">Interactive map goes here</Text>
        </View>
      </ConfirmationModal>

      {/* Claim schedule details dialog — lists every scheduled meeting for the tapped day, mirroring the web dashboard's calendar-day modal */}
      <ConfirmationModal
        visible={scheduleModalVisible}
        tone="info"
        icon={CalendarClock}
        title={selectedDateLabel}
        message={
          scheduledForSelected.length > 0
            ? `${scheduledForSelected.length} ${
                scheduledForSelected.length === 1 ? 'meeting scheduled' : 'meetings scheduled'
              }`
            : 'There are no claimant verification meetings set for this day.'
        }
        confirmLabel="Close"
        dismissOnBackdrop
        onConfirm={() => setScheduleModalVisible(false)}
      >
        {scheduledForSelected.length > 0
          ? scheduledForSelected.map((claim, idx) => (
              <View
                key={claim.id ?? idx}
                className="mb-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
              >
                <View className="flex-row items-start justify-between border-b border-slate-100 pb-3 dark:border-slate-700">
                  <View className="flex-1 flex-row items-center pr-3">
                    <View className="mr-2.5 h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">
                      <User size={15} color={navyIcon} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-[#16233F] dark:text-slate-100" numberOfLines={1}>
                        {claimantLabel(claim)}
                      </Text>
                      <Text className="mt-0.5 text-xs text-slate-400" numberOfLines={1}>
                        {claim.claimant_email || 'No email provided'}
                      </Text>
                    </View>
                  </View>

                  <View className={`flex-row items-center rounded-full px-2.5 py-1 ${GREEN_PILL}`}>
                    <Clock size={11} color={greenIcon} />
                    <Text className={`ml-1 text-[11px] font-bold ${GREEN_TEXT}`}>
                      {claim.meeting_time || 'Time set'}
                    </Text>
                  </View>
                </View>

                <View className="mt-3 flex-row justify-between">
                  <View>
                    <Text className="text-[10px] font-bold uppercase text-slate-400">
                      Contact
                    </Text>
                    <Text className="mt-0.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {claim.claimant_contact || 'N/A'}
                    </Text>
                  </View>

                  <View>
                    <Text className="text-[10px] font-bold uppercase text-slate-400">
                      Claim ID
                    </Text>
                    <Text className="mt-0.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                      #{claim.id || 'N/A'}
                    </Text>
                  </View>
                </View>
              </View>
            ))
          : null}
      </ConfirmationModal>
    </View>
  );
}