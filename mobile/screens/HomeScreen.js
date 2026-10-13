import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import {
  Bell,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  HandHelping,
  Info,
  MapPin,
  PackageCheck,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Ticket,
  X,
} from "lucide-react-native";

import { useTabBarVisibility } from "../hooks/TabBarVisibility";
import { useAppearance } from "../hooks/Appearance";
import {
  addPushListeners,
  registerForPushNotifications,
} from "../hooks/PushNotifications";
import { refreshUnreadCount, useUnreadCount } from "../hooks/UnreadNotifications";
import {
  checkClaimStatus,
  checkItemClaim,
  getCurrentUser,
  getItems,
  getMyClaims,
  getMyItems,
} from "../api/api";

const NAVY = "#1b2061";
const MUTED = "#5B647A";
// Icon colors used in dark mode, where navy and the darker grey are unreadable.
const NAVY_ON_DARK = "#C7D2FE";
const MUTED_ON_DARK = "#94A3B8";
const DATE_CHIPS = ["All", "Today", "This Week", "This Month"];
const DATE_KEYS = { All: null, Today: "today", "This Week": "week", "This Month": "month" };
const PAGE_SIZE = 10;

const getItemId = (item) => item?.id ?? item?._id ?? item?.claim_id ?? null;

const parseLocalDate = (value) => {
  if (!value || typeof value !== "string") return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isInDateFilter = (dateValue, filter) => {
  if (filter === "All") return true;

  const itemDate = parseLocalDate(dateValue);
  if (!itemDate) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  itemDate.setHours(0, 0, 0, 0);

  if (filter === "Today") {
    return itemDate.getTime() === today.getTime();
  }

  if (filter === "This Week") {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return itemDate >= weekStart && itemDate <= weekEnd;
  }

  if (filter === "This Month") {
    return (
      itemDate.getFullYear() === today.getFullYear() &&
      itemDate.getMonth() === today.getMonth()
    );
  }

  return true;
};

// Shows the exact calendar date (e.g. "Sep 17, 2026"), never a relative label like "3 days ago".
const formatExactDate = (value) => {
  const date = parseLocalDate(value);
  if (!date) return value || "Not specified";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
};

// Returns up to 3 non-blank locations; the app submits them as one comma-joined string, other shapes are a safety net.
const getLocationList = (item) => {
  const raw = item.locations ?? item.location;
  let list = [];

  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) list = parsed;
      } catch (err) {
        list = [trimmed];
      }
    } else if (/[,;|]/.test(trimmed)) {
      // The real shape: "Library, Gymnasium, Others: Room 204"
      list = trimmed.split(/[,;|]/);
    } else if (trimmed) {
      list = [trimmed];
    }
  }

  if (list.length === 0) {
    const separateFields = [
      item.location_1 ?? item.location1,
      item.location_2 ?? item.location2,
      item.location_3 ?? item.location3,
    ];
    if (separateFields.some(Boolean)) list = separateFields;
  }

  return list
    .map((entry) => (typeof entry === "string" ? entry.trim() : entry))
    .filter(Boolean)
    .slice(0, 3);
};

// When the item was lost or found, as a date + time range.
// The backend stores the "From" values in start_date / start_time and the
// optional "To" values in end_date / end_time (a blank "To" means a single
// moment). The older created_* names are still read as a fallback so the
// screen keeps working against either version of the API.
const getStartDate = (item) =>
  item.start_date ?? item.created_date ?? item.date ?? null;

const getDateTimeRange = (item) => {
  const dateFrom = getStartDate(item);
  const dateTo = item.end_date || item.created_date_to || dateFrom;
  const timeFrom = item.start_time ?? item.created_time ?? null;
  const timeTo = item.end_time ?? item.created_time_to ?? null;

  return { dateFrom, dateTo, timeFrom, timeTo };
};

// Converts a 24-hour time to a 12-hour label like "2:30 PM". Only the hours
// and minutes are shown: seconds and milliseconds are dropped, so "14:30",
// "14:30:00", "14:30:00.123456" and "2026-10-03T14:30:00.123Z" all become
// "2:30 PM". Other shapes pass through and empty values return null.
const formatTimeLabel = (value) => {
  if (!value || typeof value !== "string") return null;

  const match = value
    .trim()
    .match(/(?:^|T|\s)([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?/);
  if (!match) return value;

  const period = Number(match[1]) >= 12 ? "PM" : "AM";
  const hour12 = Number(match[1]) % 12 || 12;

  return `${hour12}:${match[2]} ${period}`;
};

// Label for a claim's meeting time. The backend stores it as a ready-made
// slot such as "10:00 AM - 11:00 AM", which is shown as it is so both the
// start and the end appear. Only a plain 24-hour time ("14:30:00") is
// converted with formatTimeLabel.
const formatMeetingTime = (value) => {
  if (!value || typeof value !== "string") return null;

  const trimmed = value.trim();
  if (/[AP]M/i.test(trimmed)) return trimmed.replace(/\s*-\s*/g, " – ");

  return formatTimeLabel(trimmed);
};

// ---- Declined claims ----
// Same rule as the website's public landing board: a surrendered item this
// student already had a claim declined for is hidden from their Surrendered
// tab (staff decided they aren't the owner, and create_claim in the backend
// refuses a new claim from them). Other students still see the item.
// The "claim declined" modal stays as a safety net for the few seconds
// before the student's claims have loaded.

// Status text staff decline buttons set, same list as the website.
const DECLINED_STATUSES = new Set(["declined", "rejected", "denied"]);

// Same text the website and the Items screen use for a "Not the owner" decline.
const NOT_OWNER_REASON =
  "After verification, you were found not to be the owner of this item.";

// getMyClaims may return a plain list or { claims } / { results }.
const extractClaims = (response) => {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.claims)) return response.claims;
  if (Array.isArray(response?.results)) return response.results;
  return [];
};

// The id of the item a claim is for. The claim may carry the item as an id,
// as a nested object, or as item_details.
const getClaimItemId = (claim) => {
  const nested =
    (claim?.item_details && typeof claim.item_details === "object" && claim.item_details) ||
    (claim?.item && typeof claim.item === "object" && claim.item) ||
    null;
  const id = nested ? getItemId(nested) : claim?.item ?? claim?.item_id ?? null;
  return id === null || id === undefined ? null : String(id);
};

const isDeclinedClaim = (claim) =>
  DECLINED_STATUSES.has(String(claim?.status || "").trim().toLowerCase());

// The reason shown in the modal, when the claim has one.
const getDeclineReason = (claim) => {
  if (claim?.not_owner) return NOT_OWNER_REASON;
  const reason = [claim?.decline_reason, claim?.declined_reason, claim?.declined_remarks, claim?.remarks]
    .find((value) => typeof value === "string" && value.trim());
  return reason ? reason.trim() : null;
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { handleScroll } = useTabBarVisibility();

  // Icon colors follow the app's Light / Dark appearance.
  const { isDark } = useAppearance();
  const navyIcon = isDark ? NAVY_ON_DARK : NAVY;
  const mutedIcon = isDark ? MUTED_ON_DARK : MUTED;
  const disabledIcon = isDark ? "#475569" : "#CBD5E1";

  // No auth context exists, so the screen re-fetches the logged-in user itself from "account/current/".
  const [user, setUser] = useState(null);

  const [query, setQuery] = useState("");
  const [mode, setMode] = useState("lost");
  const [dateFilter, setDateFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Unread in-app notifications, shared with the badge on the tab bar.
  const unreadCount = useUnreadCount();
  const [items, setItems] = useState([]);

  // Ids (as strings) of the items the logged-in user reported themselves,
  // from "item/mine/". Their own surrendered items are hidden from the
  // Surrendered tab so they can't send a claim request for something they
  // turned in.
  const [myItemIds, setMyItemIds] = useState(() => new Set());
  const myItemsSignatureRef = useRef("");

  // Ids (as strings) of the surrendered items this user had a claim
  // declined for, from "my claims". Those items are hidden from the
  // Surrendered tab, like on the website.
  const [declinedItemIds, setDeclinedItemIds] = useState(() => new Set());
  const declinedSignatureRef = useRef("");

  // The item shown in the "already claimed" modal, paired with its claim schedule if one exists.
  const [claimDetails, setClaimDetails] = useState(null);
  // The item shown in the "claim declined" modal, paired with its declined claim.
  const [declinedDetails, setDeclinedDetails] = useState(null);
  // The item id being checked after a "Claim this item" press, so only that row shows a loading state.
  const [checkingItemId, setCheckingItemId] = useState(null);

  const listRef = useRef(null);
  const itemsRequestInFlightRef = useRef(false);
  const itemSignatureRef = useRef("");
  // Set when opening the claim form so returning from it keeps the tab, page, and scroll position.
  const skipResetRef = useRef(false);
  const [currentPage, setCurrentPage] = useState(1);

  const isSurrendered = mode === "surrendered";

  const loadCurrentUser = useCallback(async () => {
    try {
      const profile = await getCurrentUser();
      setUser(profile ?? null);
    } catch (err) {
      // Not logged in or token expired, so claim checks simply skip when there's no user.
      setUser(null);
    }
  }, []);

  // Loads the ids of the items this user reported. State only changes when
  // the id list actually changes, so the 5-second poll doesn't re-render
  // the board for nothing.
  const loadMyItems = useCallback(async () => {
    try {
      const response = await getMyItems();
      const data = Array.isArray(response) ? response : [];
      const ids = data
        .map((item) => getItemId(item))
        .filter((id) => id !== null)
        .map(String)
        .sort();
      const signature = ids.join("|");

      if (signature !== myItemsSignatureRef.current) {
        myItemsSignatureRef.current = signature;
        setMyItemIds(new Set(ids));
      }
    } catch (err) {
      // Not logged in or the request failed: keep the last known list.
    }
  }, []);

  // Loads the ids of the items this user had a claim declined for. State
  // only changes when the list actually changes, so the 5-second poll
  // doesn't re-render the board for nothing.
  const loadDeclinedClaims = useCallback(async () => {
    try {
      const claims = extractClaims(await getMyClaims());
      const ids = Array.from(
        new Set(
          claims
            .filter(isDeclinedClaim)
            .map(getClaimItemId)
            .filter((id) => id !== null)
        )
      ).sort();
      const signature = ids.join("|");

      if (signature !== declinedSignatureRef.current) {
        declinedSignatureRef.current = signature;
        setDeclinedItemIds(new Set(ids));
      }
    } catch (err) {
      // Not logged in or the request failed: keep the last known list.
    }
  }, []);

  // Refreshes the bell badge. A failed request keeps the last known count.
  const loadUnreadCount = useCallback(() => refreshUnreadCount(), []);

  // Opens the notifications list, keeping the board's tab, page and scroll.
  const openNotifications = () => {
    skipResetRef.current = true;
    navigation.navigate("Notifications");
  };

  useEffect(() => {
    loadCurrentUser();
  }, [loadCurrentUser]);

  // Real push: this screen is only reached by students, so admins never
  // register a phone. Does nothing in Expo Go (see hooks/PushNotifications).
  useEffect(() => {
    registerForPushNotifications();

    return addPushListeners({
      // A push arrived while the app is open: refresh the bell badge.
      onReceive: loadUnreadCount,
      // The user tapped a push: open the notifications list.
      onTap: () => {
        skipResetRef.current = true;
        navigation.navigate("Notifications");
      },
    });
  }, [loadUnreadCount, navigation]);

  // Opens the claim form and flags the navigation so the leave-focus reset doesn't wipe the board state.
  const openClaimForm = (item) => {
    skipResetRef.current = true;
    navigation.navigate("ClaimRequest", { item });
  };

  // Returns this user's newest declined claim for the item, or null (any
  // declined claim counts, same as the website). A failed request returns
  // null, so the form still opens and the backend's own check at submit
  // time still applies.
  const findDeclinedClaim = async (itemId) => {
    try {
      const claims = extractClaims(await getMyClaims());
      const declined = claims
        .filter((claim) => getClaimItemId(claim) === String(itemId) && isDeclinedClaim(claim))
        .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
      return declined[0] || null;
    } catch (err) {
      console.error("Failed to check declined claims:", err);
      return null;
    }
  };

  // On "Claim this item":
  //   1. a declined claim on this item -> "claim declined" modal, no form;
  //   2. an active claim (matched by email) -> its schedule modal;
  //   3. otherwise the claim form opens.
  const handleOpenClaim = async (item) => {
    const itemId = getItemId(item);
    const email = user?.email;

    // Safety net: never open the claim form for an item this user surrendered.
    if (itemId !== null && myItemIds.has(String(itemId))) return;

    // Without an item id there's nothing to check, so the form's own guards take over.
    if (itemId === null) {
      openClaimForm(item);
      return;
    }

    setCheckingItemId(itemId);

    try {
      const declinedClaim = await findDeclinedClaim(itemId);
      if (declinedClaim) {
        setDeclinedDetails({ item, reason: getDeclineReason(declinedClaim) });
        // Hide the item right away instead of waiting for the next poll.
        loadDeclinedClaims();
        return;
      }

      // Without an account email the active-claim check can't run, so the form's own duplicate guard takes over.
      if (!email) {
        openClaimForm(item);
        return;
      }

      const { claimed } = await checkClaimStatus(itemId, email);

      if (claimed) {
        let schedule = null;
        try {
          schedule = await checkItemClaim(itemId);
        } catch (err) {
          console.error("Failed to fetch claim schedule:", err);
        }

        setClaimDetails({
          item,
          claim: {
            meetingDate: schedule?.has_claim ? schedule.meeting_date : null,
            meetingTime: schedule?.has_claim ? schedule.meeting_time : null,
          },
        });
        return;
      }

      openClaimForm(item);
    } catch (err) {
      console.error("Failed to check claim status:", err);
      // Fails open since the backend still blocks a real duplicate at submit time.
      openClaimForm(item);
    } finally {
      setCheckingItemId(null);
    }
  };

  const fetchItems = useCallback(async () => {
    if (itemsRequestInFlightRef.current) return;
    itemsRequestInFlightRef.current = true;

    try {
      const response = await getItems();
      const data = Array.isArray(response) ? response : [];
      const nextItems = data.map((item) => ({ ...item, date: getStartDate(item) }));
      // The date and time range is part of the signature, so an edited
      // range refreshes the card on the next poll.
      const signature = nextItems
        .map((item) => {
          const { dateFrom, dateTo, timeFrom, timeTo } = getDateTimeRange(item);
          return `${item.id}:${item.updated_at || ""}:${dateFrom || ""}:${dateTo || ""}:${timeFrom || ""}:${timeTo || ""}:${item.status}:${item.type}:${item.title || ""}:${item.category || ""}:${item.location || ""}`;
        })
        .join("|");

      if (signature !== itemSignatureRef.current) {
        itemSignatureRef.current = signature;
        setItems(nextItems);
      }
    } catch (error) {
      console.error("Error fetching items:", error);
    } finally {
      itemsRequestInFlightRef.current = false;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      skipResetRef.current = false;
      fetchItems();
      loadMyItems();
      loadDeclinedClaims();
      loadCurrentUser();
      loadUnreadCount();

      const interval = setInterval(() => {
        fetchItems();
        loadMyItems();
        loadDeclinedClaims();
        loadUnreadCount();
      }, 5000);

      return () => {
        clearInterval(interval);

        // Leaving for another tab resets the board to Lost, page 1, scrolled to the top.
        if (skipResetRef.current) return;
        setMode("lost");
        setCurrentPage(1);
        listRef.current?.scrollToOffset({ offset: 0, animated: false });
      };
    }, [fetchItems, loadMyItems, loadDeclinedClaims, loadCurrentUser, loadUnreadCount])
  );

  const approvedItemsByMode = useMemo(() => {
    const grouped = { lost: [], surrendered: [] };

    items.forEach((item) => {
      const itemMode = item.type?.toLowerCase();
      const status = item.status?.trim().toUpperCase();
      if (status !== "APPROVED" || !grouped[itemMode]) return;

      // The person who surrendered an item must not be able to claim it,
      // so their own surrendered items never appear on the Surrendered tab.
      if (itemMode === "surrendered" && myItemIds.has(String(getItemId(item)))) {
        return;
      }

      // A surrendered item this user had a claim declined for is hidden
      // from them too (same as the website).
      if (itemMode === "surrendered" && declinedItemIds.has(String(getItemId(item)))) {
        return;
      }

      grouped[itemMode].push(item);
    });

    return grouped;
  }, [items, myItemIds, declinedItemIds]);

  const source = approvedItemsByMode[mode] || [];

  // Categories come from the approved items on the active tab, de-duped case-insensitively like the web board.
  const categories = useMemo(() => {
    const map = new Map();

    source.forEach((item) => {
      if (!item.category) return;
      const key = item.category.trim().toLowerCase();
      if (!map.has(key)) map.set(key, item.category.trim());
    });

    return [
      "All",
      ...Array.from(map.values()).sort((a, b) => a.localeCompare(b)),
    ];
  }, [source]);

  const handleModePress = useCallback((nextMode) => {
    setMode((currentMode) =>
      currentMode === nextMode ? currentMode : nextMode
    );
  }, []);

  const activeFilterCount =
    (dateFilter !== "All" ? 1 : 0) + (categoryFilter !== "All" ? 1 : 0);

  const toggleFilters = useCallback(() => {
    setFiltersOpen((open) => {
      if (open) setCategoryOpen(false);
      return !open;
    });
  }, []);

  // Puts both filters back to their defaults: "All" dates and "All Categories".
  const clearFilters = useCallback(() => {
    setDateFilter("All");
    setCategoryFilter("All");
    setCategoryOpen(false);
  }, []);

  const filtered = useMemo(() => {
    return source
      .filter((item) => {
        const matchesDate = isInDateFilter(getStartDate(item), dateFilter);
        const matchesCategory =
          categoryFilter === "All" ||
          item.category?.trim().toLowerCase() === categoryFilter.trim().toLowerCase();

        const searchableText =
          `${item.title} ${item.category} ${item.ticket_code || ""}`.toLowerCase();

        return (
          matchesDate &&
          matchesCategory &&
          searchableText.includes(query.trim().toLowerCase())
        );
      })
      .sort((a, b) => Number(b.id) - Number(a.id));
  }, [source, dateFilter, categoryFilter, query]);

  // Switching tabs resets the category to "All" since the two tabs rarely share categories and a stale one could hide everything.
  useEffect(() => {
    setCategoryFilter("All");
  }, [mode]);

  useEffect(() => {
    setCurrentPage(1);
  }, [mode, dateFilter, categoryFilter, query]);

  const totalPages = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1);
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, filtered.length);
  const paginatedItems = filtered.slice(startIndex, endIndex);

  const pageNumbers = Array.from(
    { length: totalPages },
    (_, index) => index + 1
  ).filter(
    (page) =>
      page === 1 || page === totalPages || Math.abs(page - safeCurrentPage) <= 1
  );

  function goToPage(page) {
    if (page < 1 || page > totalPages) return;
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setCurrentPage(page);
  }

  return (
    <View className="flex-1 bg-white dark:bg-slate-950">
      <StatusBar style="light" backgroundColor={NAVY} translucent={false} />

      <SafeAreaView edges={["top"]} className="rounded-b-3xl bg-[#1b2061]">
        <View className="flex-row items-center justify-between px-4 pb-6 pt-2">
          <View>
            <Text className="text-[12px] font-bold tracking-widest text-white/60">
              SEEK AND BALIK
            </Text>
            <Text className="text-2xl font-bold text-white">
              Lost & Surrendered Board
            </Text>
          </View>

          <TouchableOpacity
            className="h-10 w-10 items-center justify-center rounded-full bg-white/15"
            onPress={openNotifications}
            accessibilityRole="button"
            accessibilityLabel={
              unreadCount > 0
                ? `Notifications, ${unreadCount} unread`
                : "Notifications"
            }
          >
            <Bell size={18} color="#FFFFFF" />
            {unreadCount > 0 && (
              <View className="absolute -right-1 -top-1 h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1">
                <Text className="text-[10px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <View className="px-4 pt-4">
        <View className="relative flex-row items-center overflow-hidden rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900">
          <Search size={15} color={mutedIcon} />
          <TextInput
            className="ml-2 h-11 flex-1 text-sm text-[#1b2061] dark:text-slate-100"
            placeholder="Search items..."
            placeholderTextColor={isDark ? "#64748B" : "#9AA3B5"}
            value={query}
            onChangeText={setQuery}
            accessibilityLabel="Search items"
          />
        </View>

        <View className="mt-4 flex-row overflow-hidden rounded-xl border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
          <TouchableOpacity
            onPress={() => handleModePress("lost")}
            className={`flex-1 flex-row items-center justify-center rounded-lg py-2.5 ${
              !isSurrendered ? "bg-[#1b2061] dark:bg-indigo-600" : ""
            }`}
          >
            <Eye size={14} color={!isSurrendered ? "#FFFFFF" : mutedIcon} />
            <Text
              className={`ml-1.5 text-sm font-semibold ${
                !isSurrendered ? "text-white" : "text-slate-500 dark:text-slate-400"
              }`}
            >
              Lost
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleModePress("surrendered")}
            className={`flex-1 flex-row items-center justify-center rounded-lg py-2.5 ${
              isSurrendered ? "bg-[#1b2061] dark:bg-indigo-600" : ""
            }`}
          >
            <PackageCheck
              size={14}
              color={isSurrendered ? "#FFFFFF" : mutedIcon}
            />
            <Text
              className={`ml-1.5 text-sm font-semibold ${
                isSurrendered ? "text-white" : "text-slate-500 dark:text-slate-400"
              }`}
            >
              Surrendered
            </Text>
          </TouchableOpacity>
        </View>

        <View className="relative z-30 mt-4 rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={toggleFilters}
            className="flex-row items-center justify-between rounded-xl px-3 py-3"
          >
            <View className="flex-row items-center">
              <SlidersHorizontal size={14} color={filtersOpen ? navyIcon : mutedIcon} />
              <Text
                className={`ml-2 text-sm font-semibold ${
                  filtersOpen
                    ? "text-[#1b2061] dark:text-indigo-200"
                    : "text-slate-500 dark:text-slate-400"
                }`}
              >
                Filters
              </Text>
              {activeFilterCount > 0 && (
                <View className="ml-2 h-5 min-w-[20px] items-center justify-center rounded-full bg-[#1b2061] px-1.5 dark:bg-indigo-600">
                  <Text className="text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </Text>
                </View>
              )}
            </View>

            <ChevronDown
              size={18}
              color={mutedIcon}
              style={{ transform: [{ rotate: filtersOpen ? "180deg" : "0deg" }] }}
            />
          </TouchableOpacity>

          {filtersOpen && (
            <View className="border-t border-slate-100 px-3 pb-3 pt-3 dark:border-slate-800">
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingRight: 4 }}
              >
                {DATE_CHIPS.map((chip) => {
                  const active = dateFilter === chip;

                  return (
                    <TouchableOpacity
                      key={chip}
                      onPress={() => setDateFilter(chip)}
                      className={`mr-2 rounded-full border px-3.5 py-1.5 ${
                        active
                          ? "border-[#1b2061] bg-[#1b2061] dark:border-indigo-600 dark:bg-indigo-600"
                          : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"
                      }`}
                      accessibilityState={{ selected: active }}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          active ? "text-white" : "text-slate-500 dark:text-slate-300"
                        }`}
                      >
                        {chip}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View className="relative z-20 mt-3">
                <TouchableOpacity
                  onPress={() => setCategoryOpen((open) => !open)}
                  className="h-11 flex-row items-center justify-between rounded-lg border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-800"
                >
                  <View className="flex-row items-center">
                    <Ticket size={14} color={mutedIcon} />
                    <Text className="ml-2 text-sm text-[#16233F] dark:text-slate-100">
                      {categoryFilter === "All" ? "All Categories" : categoryFilter}
                    </Text>
                  </View>
                  <ChevronDown
                    size={16}
                    color={mutedIcon}
                    style={{ transform: [{ rotate: categoryOpen ? "180deg" : "0deg" }] }}
                  />
                </TouchableOpacity>

                {categoryOpen && (
                  <View className="absolute left-0 right-0 top-12 z-30 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                    {categories.map((category) => (
                      <TouchableOpacity
                        key={category}
                        onPress={() => {
                          setCategoryFilter(category);
                          setCategoryOpen(false);
                        }}
                        className={`border-b border-slate-100 px-3 py-3 last:border-b-0 dark:border-slate-700 ${
                          categoryFilter === category ? "bg-slate-50 dark:bg-slate-700" : ""
                        }`}
                      >
                        <Text className="text-sm text-[#16233F] dark:text-slate-100">{category}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              {/* Shown only while a date or category filter is applied. */}
              {activeFilterCount > 0 && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={clearFilters}
                  accessibilityRole="button"
                  accessibilityLabel="Clear filters"
                  className="mt-3 h-10 flex-row items-center justify-center rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                >
                  <X size={14} color={mutedIcon} />
                  <Text className="ml-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                    Clear filters
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Item count, at the top right above the cards. It sits outside the
            list, so it stays in place while the cards scroll. Kept below the
            filter panel (z-30 above) so the category dropdown opens over it. */}
        <View className="z-0 mt-3 flex-row justify-end">
          <Text
            className="text-xs font-semibold text-slate-400"
            accessibilityLabel={`${filtered.length} item${filtered.length !== 1 ? "s" : ""}`}
          >
            {filtered.length} item{filtered.length !== 1 ? "s" : ""}
          </Text>
        </View>
      </View>

      <FlatList
        ref={listRef}
        className="flex-1"
        data={paginatedItems}
        keyExtractor={(item) => String(item.id)}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: insets.bottom + 24,
        }}
        ListHeaderComponent={
          !isSurrendered ? (
            <View className="mb-3 flex-row rounded-xl bg-[#EEF1F7] p-3 dark:bg-slate-800">
              <Info size={15} color={navyIcon} style={{ marginTop: 1 }} />
              <Text className="ml-2 flex-1 text-sm leading-5 text-[#1b2061] dark:text-indigo-100">
                Lost items are for awareness only. Found something similar?
                Turn it in and report it as surrendered.
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View className="items-center pt-20">
            <Text className="text-lg font-semibold text-[#1b2061] dark:text-slate-100">
              No items match yet
            </Text>
            <Text className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Try another search or date filter.
            </Text>
          </View>
        }
        ListFooterComponent={
          filtered.length > 0 ? (
            <View className="mt-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              <View className="mb-3 flex-row items-center justify-between">
                <Text className="text-[11px] font-semibold text-slate-400">
                  Showing {startIndex + 1}–{endIndex} of {filtered.length}
                </Text>
                <Text className="text-[11px] font-semibold text-slate-400">
                  Page {safeCurrentPage} of {totalPages}
                </Text>
              </View>

              <View className="flex-row items-center justify-between">
                <TouchableOpacity
                  disabled={safeCurrentPage === 1}
                  onPress={() => goToPage(safeCurrentPage - 1)}
                  className={`h-9 w-9 items-center justify-center rounded-lg border ${
                    safeCurrentPage === 1
                      ? "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
                      : "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800"
                  }`}
                >
                  <ChevronLeft
                    size={16}
                    color={safeCurrentPage === 1 ? disabledIcon : navyIcon}
                  />
                </TouchableOpacity>

                <View className="flex-row gap-1.5">
                  {pageNumbers.map((page) => (
                    <TouchableOpacity
                      key={page}
                      onPress={() => goToPage(page)}
                      className={`h-9 w-9 items-center justify-center rounded-lg ${
                        page === safeCurrentPage
                          ? "bg-[#1b2061] dark:bg-indigo-600"
                          : "bg-[#EEF1F7] dark:bg-slate-800"
                      }`}
                    >
                      <Text
                        className={`text-[11px] font-bold ${
                          page === safeCurrentPage
                            ? "text-white"
                            : "text-[#1b2061] dark:text-slate-200"
                        }`}
                      >
                        {page}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  disabled={safeCurrentPage === totalPages}
                  onPress={() => goToPage(safeCurrentPage + 1)}
                  className={`h-9 w-9 items-center justify-center rounded-lg border ${
                    safeCurrentPage === totalPages
                      ? "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
                      : "border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800"
                  }`}
                >
                  <ChevronRight
                    size={16}
                    color={
                      safeCurrentPage === totalPages ? disabledIcon : navyIcon
                    }
                  />
                </TouchableOpacity>
              </View>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const locations = getLocationList(item);
          const itemId = getItemId(item);
          const isChecking = isSurrendered && checkingItemId === itemId;

          // Both tabs show a From – To range when the report has one, and a
          // single date/time when the "To" values are blank or the same.
          const { dateFrom, dateTo, timeFrom, timeTo } = getDateTimeRange(item);

          const dateLabel =
            dateTo && dateTo !== dateFrom
              ? `${formatExactDate(dateFrom)} to ${formatExactDate(dateTo)}`
              : formatExactDate(dateFrom);

          const timeFromLabel = formatTimeLabel(timeFrom);
          const timeToLabel = formatTimeLabel(timeTo);

          const timeLabel =
            timeFromLabel && timeToLabel && timeFromLabel !== timeToLabel
              ? `${timeFromLabel} to ${timeToLabel}`
              : timeFromLabel || timeToLabel || null;

          return (
            <View className="mb-3 flex-row overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
              {/* Accent stripe: navy in light mode, indigo in dark mode. */}
              <View className="w-1.5 bg-[#1b2061] dark:bg-indigo-500" />

              <View className="flex-1 p-3.5">
                <View className="flex-row items-start justify-between">
                  <View className="flex-1">
                    <Text
                      numberOfLines={1}
                      className="text-[15px] font-bold text-[#16233F] dark:text-slate-100"
                    >
                      {item.title}
                    </Text>
                    <Text
                      numberOfLines={1}
                      className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"
                    >
                      {item.category || "Uncategorized"}
                    </Text>
                  </View>

                  <View className="ml-2 shrink-0 rounded-full bg-[#EEF1F7] px-2.5 py-1 dark:bg-slate-800">
                    <Text className="text-[10px] font-bold text-[#1b2061] dark:text-indigo-200">
                      {isSurrendered ? "Surrendered" : "Lost"}
                    </Text>
                  </View>
                </View>

                <View className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                  {/* Lost items list up to 3 locations, surrendered items have one. */}
                  {locations.length > 0 ? (
                    locations.map((loc, index) => (
                      <View
                        key={`${loc}-${index}`}
                        className={`flex-row items-center ${
                          index > 0 ? "mt-1" : ""
                        }`}
                      >
                        <MapPin size={12} color={mutedIcon} />
                        <Text
                          numberOfLines={1}
                          className="ml-1 flex-1 text-xs text-slate-500 dark:text-slate-400"
                        >
                          {loc}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <View className="flex-row items-center">
                      <MapPin size={12} color={mutedIcon} />
                      <Text className="ml-1 text-xs text-slate-500 dark:text-slate-400">
                        Not specified
                      </Text>
                    </View>
                  )}

                  <View className="mt-2 flex-row items-center flex-wrap gap-x-4 gap-y-1">
                    <View className="flex-row items-center">
                      <Calendar size={12} color={mutedIcon} />
                      <Text className="ml-1 text-xs text-slate-500 dark:text-slate-400">
                        {dateLabel}
                      </Text>
                    </View>

                    {timeLabel && (
                      <View className="flex-row items-center">
                        <Clock size={12} color={mutedIcon} />
                        <Text className="ml-1 text-xs text-slate-500 dark:text-slate-400">
                          {timeLabel}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {isSurrendered && (
                  // handleOpenClaim shows the schedule modal if a claim already exists, otherwise opens the form.
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => handleOpenClaim(item)}
                    disabled={isChecking}
                    className={`mt-3.5 flex-row items-center justify-center rounded-xl py-3 ${
                      isChecking
                        ? "bg-[#1b2061]/60 dark:bg-indigo-600/60"
                        : "bg-[#1b2061] dark:bg-indigo-600"
                    }`}
                  >
                    {isChecking ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <HandHelping size={15} color="#FFFFFF" />
                    )}
                    <Text className="ml-2 text-xs font-bold uppercase tracking-wide text-white">
                      {isChecking ? "Checking..." : "Claim this item"}
                    </Text>
                    {!isChecking && (
                      <ChevronRight
                        size={14}
                        color="#FFFFFF"
                        style={{ marginLeft: 4 }}
                      />
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
      />

      {/* "Already claimed" modal shown instead of the claim form when the user has an active claim. */}
      <Modal
        visible={Boolean(claimDetails)}
        transparent
        animationType="fade"
        onRequestClose={() => setClaimDetails(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(15,23,42,0.5)",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View className="rounded-2xl bg-white p-5 dark:bg-slate-900">
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                  Claim Request
                </Text>
                <Text className="mt-1 text-base font-bold text-[#16233F] dark:text-slate-100">
                  {claimDetails?.item?.title}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setClaimDetails(null)}
                accessibilityLabel="Close"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color={mutedIcon} />
              </TouchableOpacity>
            </View>

            <View className="mt-4 rounded-xl bg-[#EEF1F7] p-4 dark:bg-slate-800">
              {claimDetails?.claim?.meetingDate ? (
                <>
                  <View className="flex-row items-center">
                    <Calendar size={14} color={navyIcon} />
                    <Text className="ml-2 text-sm font-semibold text-[#1b2061] dark:text-indigo-100">
                      {formatExactDate(claimDetails.claim.meetingDate)}
                    </Text>
                  </View>
                  {claimDetails.claim.meetingTime && (
                    <View className="mt-2 flex-row items-center">
                      <Clock size={14} color={navyIcon} />
                      <Text className="ml-2 text-sm font-semibold text-[#1b2061] dark:text-indigo-100">
                        {formatMeetingTime(claimDetails.claim.meetingTime)}
                      </Text>
                    </View>
                  )}
                </>
              ) : (
                <Text className="text-sm text-slate-500 dark:text-slate-400">
                  Your claim request has been submitted and is awaiting a
                  scheduled meeting.
                </Text>
              )}
            </View>

            <Text className="mt-4 text-xs text-slate-400">
              You've already submitted a claim for this item. Please wait
              for further instructions or visit the office if you have
              questions.
            </Text>

            <TouchableOpacity
              onPress={() => setClaimDetails(null)}
              className="mt-5 items-center rounded-xl bg-[#1b2061] py-3 dark:bg-indigo-600"
            >
              <Text className="text-xs font-bold uppercase tracking-widest text-white">
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* "Claim declined" modal: shown instead of the claim form when this
          user's earlier claim on the item was declined. */}
      <Modal
        visible={Boolean(declinedDetails)}
        transparent
        animationType="fade"
        onRequestClose={() => setDeclinedDetails(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(15,23,42,0.5)",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View className="rounded-2xl bg-white p-5 dark:bg-slate-900">
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                  Claim Request
                </Text>
                <Text className="mt-1 text-base font-bold text-[#16233F] dark:text-slate-100">
                  {declinedDetails?.item?.title}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setDeclinedDetails(null)}
                accessibilityLabel="Close"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={20} color={mutedIcon} />
              </TouchableOpacity>
            </View>

            <View className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950">
              <View className="flex-row items-center">
                <ShieldAlert size={16} color={isDark ? "#FDA4AF" : "#BE123C"} />
                <Text className="ml-2 text-sm font-bold text-rose-700 dark:text-rose-300">
                  Your claim request was declined
                </Text>
              </View>
              <Text className="mt-2 text-xs leading-5 text-rose-700 dark:text-rose-200">
                {declinedDetails?.reason ||
                  "The Lost and Found Office declined your earlier claim request for this item."}
              </Text>
            </View>

            <Text className="mt-4 text-xs leading-5 text-slate-400">
              You can no longer send a new claim request for this item. Please
              visit the Lost and Found Office if you have questions.
            </Text>

            <TouchableOpacity
              onPress={() => setDeclinedDetails(null)}
              className="mt-5 items-center rounded-xl bg-[#1b2061] py-3 dark:bg-indigo-600"
            >
              <Text className="text-xs font-bold uppercase tracking-widest text-white">
                Close
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}