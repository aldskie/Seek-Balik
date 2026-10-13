import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Medal, Search, X } from "lucide-react-native";

import {
  getCurrentUser,
  getLeaderboard,
  getLeaderboardSettings,
} from "../api/api"; // Change this path if needed.
import { useTabBarVisibility } from "../hooks/TabBarVisibility";
import { useAppearance } from "../hooks/Appearance";

const NAVY = "#1b2061";

// Class strings reused below, each with its light and dark colors.
const CARD = "rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900";
const STRONG_TEXT = "text-[#16233F] dark:text-slate-100";
const NAVY_TEXT = "text-[#1b2061] dark:text-indigo-200";
const BODY_TEXT = "text-slate-500 dark:text-slate-400";
const SOFT_TILE = "bg-[#EEF1F7] dark:bg-slate-800";
const SECTION_BAR = "mr-2 h-4 w-1 rounded-full bg-[#1b2061] dark:bg-indigo-500";
const GOLD_TILE = "bg-[#FFF3C4] dark:bg-amber-950";
const GOLD_TEXT = "text-[#8A5900] dark:text-amber-300";
const YOU_BADGE = "rounded-full bg-[#1b2061] px-2 py-0.5 dark:bg-indigo-600";

// Gold, silver, and bronze stay the same in both appearances.
const PODIUM_STYLES = {
  1: {
    blockColor: "#f0c94a",
    numberColor: NAVY,
    blockHeight: 62,
    avatarBg: "#f0c94a",
    avatarText: NAVY,
    ring: "#f0c94a",
  },
  2: {
    blockColor: "#c7cce0",
    numberColor: NAVY,
    blockHeight: 48,
    avatarBg: "#c7cce0",
    avatarText: NAVY,
    ring: "#c7cce0",
  },
  3: {
    blockColor: "#cf8a4f",
    numberColor: "#FFFFFF",
    blockHeight: 38,
    avatarBg: "#cf8a4f",
    avatarText: "#FFFFFF",
    ring: "#cf8a4f",
  },
};

// Mirrors the web Leaderboard's getSchoolYearAndSemFromDate exactly.
const getSchoolYearAndSemFromDate = (dateString) => {
  const referenceDate = dateString ? new Date(dateString) : new Date();
  const finalDate = isNaN(referenceDate.getTime()) ? new Date() : referenceDate;

  const year = finalDate.getFullYear();
  const month = finalDate.getMonth();

  let sem = "";
  let schoolYear = "";

  if (month >= 7 && month <= 11) {
    sem = "1st Semester";
    schoolYear = `${year}-${year + 1}`;
  } else if (month >= 0 && month <= 4) {
    sem = "2nd Semester";
    schoolYear = `${year - 1}-${year}`;
  } else {
    sem = "Short Term";
    schoolYear = `${year}`;
  }

  return { schoolYear, sem };
};

const getInitials = (name = "") => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (
    parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
  ).toUpperCase();
};

const formatPoints = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString() : String(value ?? 0);
};

// Digits only, so "12345678", "12345678@slc-sflu.edu.ph" and any other
// formatting of the same ID number all match (same as the website).
const normalizeId = (value) => String(value ?? "").replace(/\D/g, "");

// A leaderboard row's ID number (the website reads the same two fields).
const leaderIdNumber = (leader) =>
  normalizeId(leader?.id_number || leader?.student_id);

export default function LeaderboardScreen({
  schoolYear: schoolYearProp = "",
  sem: semProp = "",
  // Optional: the logged-in user's id. If it isn't passed, the screen
  // finds the logged-in account itself (see getCurrentUser below).
  currentUserId = null,
}) {
  const insets = useSafeAreaInsets();
  const { handleScroll } = useTabBarVisibility();

  // Icon and spinner colors follow the app's Light / Dark appearance.
  const { isDark } = useAppearance();
  const navyIcon = isDark ? "#C7D2FE" : NAVY;
  const goldIcon = isDark ? "#FBBF24" : "#A66B00";
  const mutedIcon = isDark ? "#94A3B8" : "#5B647A";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [leaders, setLeaders] = useState([]);
  const [leaderboardActive, setLeaderboardActive] = useState(false);
  const [daysLeft, setDaysLeft] = useState(null);
  const [error, setError] = useState("");
  const [config, setConfig] = useState({ auto_mode: false, open_date: "" });
  // The logged-in account, used to find "You" on the leaderboard.
  const [me, setMe] = useState(null);
  // Search by name or ID number.
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    getCurrentUser()
      .then((account) => {
        if (!cancelled && account) setMe(account);
      })
      .catch((err) => {
        // Not fatal: the leaderboard still shows, just without "You".
        console.warn("Could not load the logged-in account:", err?.message || err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadLeaderboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);

    try {
      setError("");

      const [settingsData, leaderboardData] = await Promise.all([
        getLeaderboardSettings(),
        getLeaderboard(),
      ]);

      setLeaderboardActive(
        Boolean(settingsData?.is_active && leaderboardData?.active)
      );

      setLeaders(
        Array.isArray(leaderboardData?.leaders)
          ? leaderboardData.leaders
          : []
      );

      setConfig({
        auto_mode: Boolean(settingsData?.auto_mode),
        open_date: settingsData?.open_date || "",
      });

      if (settingsData?.close_date) {
        const closingDate = new Date(`${settingsData.close_date}T23:59:59`);
        const millisecondsRemaining = closingDate.getTime() - Date.now();

        setDaysLeft(
          Math.max(
            0,
            Math.ceil(millisecondsRemaining / (1000 * 60 * 60 * 24))
          )
        );
      } else {
        setDaysLeft(null);
      }
    } catch (err) {
      console.error("Failed to load leaderboard:", err);

      if (!silent) {
        setError("Could not load leaderboard data.");
        setLeaderboardActive(false);
        setLeaders([]);
      }
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadLeaderboard();

      const refreshInterval = setInterval(() => {
        loadLeaderboard(true);
      }, 10000);

      return () => clearInterval(refreshInterval);
    }, [loadLeaderboard])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadLeaderboard(true);
  }, [loadLeaderboard]);

  const topLeaders = leaders.slice(0, 3);
  const otherLeaders = leaders.slice(3);

  const podiumOrder =
    topLeaders.length === 3
      ? [1, 0, 2]
      : topLeaders.length === 2
        ? [1, 0]
        : [0];

  // Used to draw each row's progress bar relative to the leader.
  const topPoints = useMemo(() => {
    const n = Number(leaders[0]?.points);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }, [leaders]);

  // ---- Who is "You" ----
  // Matched by ID number, which is unique (two people can share a name).
  // The name is only a fallback when either side has no ID number, and a
  // passed-in currentUserId still works as before.
  const myIdNumber = normalizeId(me?.id_number || me?.student_id || me?.username);
  const myFullName = me
    ? `${me.first_name || ""} ${me.last_name || ""}`.trim().toLowerCase()
    : "";
  const hasCurrentUser =
    Boolean(me) ||
    (currentUserId !== null && currentUserId !== undefined && currentUserId !== "");

  const isMe = useCallback(
    (leader) => {
      if (!leader) return false;
      if (
        currentUserId !== null &&
        currentUserId !== undefined &&
        currentUserId !== "" &&
        String(leader.id) === String(currentUserId)
      ) {
        return true;
      }
      const leaderId = leaderIdNumber(leader);
      if (myIdNumber && leaderId) return myIdNumber === leaderId;
      return (
        Boolean(myFullName) &&
        String(leader.full_name || "").trim().toLowerCase() === myFullName
      );
    },
    [currentUserId, myIdNumber, myFullName]
  );

  // Logged-in user's standing.
  const myIndex = leaders.findIndex(isMe);
  const myEntry = myIndex >= 0 ? leaders[myIndex] : null;
  const myRank = myIndex + 1;
  const pointsToNext =
    myIndex > 0
      ? Math.max(
          0,
          Number(leaders[myIndex - 1]?.points) - Number(myEntry?.points)
        )
      : 0;

  const { schoolYear: computedSchoolYear, sem: computedSem } =
    getSchoolYearAndSemFromDate(config.auto_mode ? config.open_date : null);
  const schoolYear = schoolYearProp || computedSchoolYear;
  const sem = semProp || computedSem;

  const showDaysLeft = daysLeft !== null && daysLeft <= 30;
  const ready = leaderboardActive && !loading && !error;
  const showOthers = ready;

  // ---- Search ----
  // Results keep each person's real rank.
  const searchTerm = search.trim().toLowerCase();
  const searchDigits = searchTerm.replace(/\D/g, "");
  const searching = ready && leaders.length > 0 && searchTerm.length > 0;
  const searchResults = searching
    ? leaders
        .map((leader, index) => ({ leader, rank: index + 1 }))
        .filter(
          ({ leader }) =>
            String(leader.full_name || "").toLowerCase().includes(searchTerm) ||
            (searchDigits.length > 0 && leaderIdNumber(leader).includes(searchDigits))
        )
    : [];

  // One row in "Other rankings" (also used for search results).
  const renderRankRow = (leader, rank, key) => {
    const mine = isMe(leader);
    const podium = PODIUM_STYLES[rank];
    const idNumber = leaderIdNumber(leader);
    const pct = Math.max(
      4,
      Math.min(100, (Number(leader.points) / topPoints) * 100 || 0)
    );

    return (
      <View
        key={key}
        className={`mb-2.5 rounded-2xl border px-3 py-3 ${
          mine
            ? "border-[#1b2061] bg-[#F4F6FC] dark:border-indigo-400 dark:bg-indigo-950"
            : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
        }`}
      >
        <View className="flex-row items-center">
          {/* Rank badge (gold / silver / bronze for the top 3 in search results) */}
          <View
            className={`mr-3 h-9 w-9 items-center justify-center rounded-full ${
              podium ? "" : SOFT_TILE
            }`}
            style={podium ? { backgroundColor: podium.blockColor } : undefined}
          >
            <Text
              className={`text-sm font-extrabold ${podium ? "" : NAVY_TEXT}`}
              style={podium ? { color: podium.numberColor } : undefined}
            >
              {rank}
            </Text>
          </View>

          {/* Initials avatar */}
          <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-[#1b2061] dark:bg-indigo-600">
            <Text className="text-xs font-bold text-white">
              {getInitials(leader.full_name)}
            </Text>
          </View>

          <View className="flex-1 pr-2">
            <View className="flex-row items-center">
              <Text
                className={`shrink text-sm font-bold ${STRONG_TEXT}`}
                numberOfLines={1}
              >
                {leader.full_name}
              </Text>
              {mine ? (
                <View className={`ml-2 ${YOU_BADGE}`}>
                  <Text className="text-[9px] font-bold text-white">You</Text>
                </View>
              ) : null}
            </View>

            <Text className={`mt-0.5 text-[11px] ${BODY_TEXT}`} numberOfLines={1}>
              ID: {idNumber || "—"}
            </Text>

            {/* Progress vs. the leader */}
            <View className={`mt-1.5 h-1.5 overflow-hidden rounded-full ${SOFT_TILE}`}>
              <View
                className="h-1.5 rounded-full bg-[#1b2061] dark:bg-indigo-500"
                style={{ width: `${pct}%` }}
              />
            </View>
          </View>

          <View className="items-end">
            <Text className={`text-base font-extrabold ${NAVY_TEXT}`}>
              {formatPoints(leader.points)}
            </Text>
            <Text className={`text-[10px] font-semibold ${BODY_TEXT}`}>pts</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-white dark:bg-slate-950">
      <StatusBar style="light" backgroundColor={NAVY} translucent={false} />

      {/* Header. The season details ("Honest Finders · SY · semester" and
          the days-left pill) sit in the header itself instead of a separate
          card, so the Rank 4+ list below gets more room. */}
      <SafeAreaView edges={["top"]} className="rounded-b-3xl bg-[#1b2061]">
        <View className="px-4 pb-5 pt-2">
          <Text className="text-[12px] font-bold tracking-widest text-white/60">
            SEEK AND BALIK
          </Text>

          <Text className="text-2xl font-bold text-white">
            Leaderboards
          </Text>

          {/* Season strip */}
          <View className="mt-3 flex-row items-center rounded-xl bg-white/10 px-3 py-2">
            <View className="mr-2.5 h-7 w-7 items-center justify-center rounded-full bg-[#f0c94a]">
              <Medal size={14} color={NAVY} />
            </View>

            <View className="flex-1 pr-2">
              <Text className="text-[13px] font-black text-white" numberOfLines={1}>
                Honest Finders Leaderboard
              </Text>
              <Text className="text-[11px] font-semibold text-white/70" numberOfLines={1}>
                SY {schoolYear} · {sem}
              </Text>
            </View>

            {showDaysLeft ? (
              <View
                className={`rounded-full px-2.5 py-1 ${
                  daysLeft <= 7 ? "bg-[#f0c94a]" : "bg-white/15"
                }`}
              >
                <Text
                  className={`text-[11px] font-black ${
                    daysLeft <= 7 ? "text-[#1b2061]" : "text-white"
                  }`}
                >
                  {daysLeft === 0
                    ? "Last day"
                    : `${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </SafeAreaView>

      {/* ---- Fixed section: search, your rank, podium ---- */}
      <View className="px-4">

        {/* Search by name or ID number */}
        {ready && leaders.length > 0 ? (
          <View className="mt-3 flex-row items-center overflow-hidden rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900">
            <Search size={16} color={mutedIcon} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search by name or ID number..."
              placeholderTextColor={isDark ? "#64748B" : "#9AA3B5"}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel="Search the leaderboard"
              className="ml-2 h-11 flex-1 text-sm text-[#16233F] dark:text-slate-100"
            />
            {search ? (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={() => setSearch("")}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                className="h-7 w-7 items-center justify-center rounded-full"
              >
                <X size={15} color={mutedIcon} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {/* Your standing (hidden while searching, to make room for results) */}
        {hasCurrentUser && ready && !searching ? (
          <View className="mt-3 flex-row items-center rounded-2xl bg-[#1b2061] px-4 py-3 dark:bg-indigo-900">
            {myEntry ? (
              <>
                <View className="mr-3 h-11 w-11 items-center justify-center rounded-full bg-white">
                  <Text className="text-base font-black text-[#1b2061]">
                    {myRank}
                  </Text>
                </View>

                <View className="flex-1 pr-3">
                  <Text className="text-sm font-bold text-white">
                    Your rank
                  </Text>
                  <Text
                    className="mt-0.5 text-xs text-white/70"
                    numberOfLines={1}
                  >
                    {myRank === 1
                      ? "You're in first place"
                      : `${formatPoints(pointsToNext)} ${
                          pointsToNext === 1 ? "pt" : "pts"
                        } behind #${myRank - 1}`}
                    {" · "}of {leaders.length}
                  </Text>
                </View>

                <View className="items-end">
                  <Text className="text-xl font-black text-[#f0c94a]">
                    {formatPoints(myEntry.points)}
                  </Text>
                  <Text className="text-[10px] font-semibold text-white/70">
                    pts
                  </Text>
                </View>
              </>
            ) : (
              <>
                <View className="mr-3 h-11 w-11 items-center justify-center rounded-full bg-white/15">
                  <Ionicons name="person" size={20} color="#FFFFFF" />
                </View>

                <View className="flex-1">
                  <Text className="text-sm font-bold text-white">
                    You're not ranked yet
                  </Text>
                  <Text className="mt-0.5 text-xs text-white/70">
                    Return or claim an item to earn points.
                  </Text>
                </View>
              </>
            )}
          </View>
        ) : null}

        {/* Podium card (hidden while searching) */}
        {!searching ? (
          <View className={`mt-3 px-3 pb-3 pt-3 ${CARD}`}>
            {loading ? (
              <View className="items-center py-10">
                <ActivityIndicator size="small" color={navyIcon} />
                <Text className={`mt-3 text-sm ${BODY_TEXT}`}>
                  Loading leaderboard...
                </Text>
              </View>
            ) : error ? (
              <View className="items-center px-2 py-8">
                <Ionicons
                  name="cloud-offline-outline"
                  size={30}
                  color={mutedIcon}
                />

                <Text className={`mt-3 text-center text-sm ${BODY_TEXT}`}>
                  {error} Check your connection and try again.
                </Text>

                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Reload leaderboard"
                  activeOpacity={0.8}
                  className="mt-4 flex-row items-center rounded-full bg-[#1b2061] px-5 py-2.5 dark:bg-indigo-600"
                  onPress={() => loadLeaderboard()}
                >
                  <Ionicons name="refresh" size={14} color="#FFFFFF" />
                  <Text className="ml-2 text-sm font-bold text-white">
                    Try again
                  </Text>
                </TouchableOpacity>
              </View>
            ) : !leaderboardActive ? (
              <View className="items-center px-4 py-8">
                <View className={`h-14 w-14 items-center justify-center rounded-full ${SOFT_TILE}`}>
                  <Medal size={28} color="#94A3B8" />
                </View>

                <Text className={`mt-4 text-center text-base font-bold ${STRONG_TEXT}`}>
                  Leaderboard is currently closed
                </Text>

                <Text className={`mt-2 text-center text-sm leading-5 ${BODY_TEXT}`}>
                  Rankings will appear when the administrator starts the
                  leaderboard season.
                </Text>
              </View>
            ) : leaders.length === 0 ? (
              <View className="items-center px-2 py-8">
                <View className={`h-14 w-14 items-center justify-center rounded-full ${GOLD_TILE}`}>
                  <Medal size={26} color={goldIcon} />
                </View>

                <Text className={`mt-4 text-center text-base font-bold ${STRONG_TEXT}`}>
                  No scores yet
                </Text>

                <Text className={`mt-2 text-center text-sm leading-5 ${BODY_TEXT}`}>
                  Return items and claim yours to earn points. The first
                  finder takes the top spot.
                </Text>
              </View>
            ) : (
              <>
                <View className="mb-2 flex-row items-center justify-between px-1">
                  <View className="flex-row items-center">
                    <View className={SECTION_BAR} />
                    <Text className={`text-sm font-bold ${STRONG_TEXT}`}>
                      Top {Math.min(leaders.length, 3)}
                    </Text>
                  </View>

                  <View className={`rounded-full px-3 py-1 ${SOFT_TILE}`}>
                    <Text className={`text-[11px] font-bold ${NAVY_TEXT}`}>
                      {leaders.length} ranked
                    </Text>
                  </View>
                </View>

                {/* The panel follows dark mode; the gold, silver, and bronze stages and their base keep the same colors in both appearances. */}
                <View className="relative overflow-hidden rounded-2xl bg-[#F8FAFC] px-2 pt-3 dark:bg-slate-800">
                  <View className="flex-row items-end justify-center">
                    {podiumOrder.map((leaderIndex) => {
                      const leader = topLeaders[leaderIndex];
                      const rank = leaderIndex + 1;
                      const style = PODIUM_STYLES[rank];
                      const size = rank === 1 ? 52 : 42;
                      const mine = isMe(leader);

                      return (
                        <View
                          key={leader.id ?? rank}
                          className="mx-1 flex-1 items-center"
                        >
                          {/* Initials avatar (navy ring when it's you) */}
                          <View
                            className="items-center justify-center rounded-full border-[3px] bg-white dark:bg-slate-900"
                            style={{
                              width: size + 6,
                              height: size + 6,
                              borderColor: mine ? navyIcon : style.ring,
                            }}
                          >
                            <View
                              className="items-center justify-center rounded-full"
                              style={{
                                width: size - 4,
                                height: size - 4,
                                backgroundColor: style.avatarBg,
                              }}
                            >
                              <Text
                                className="font-extrabold"
                                style={{
                                  color: style.avatarText,
                                  fontSize: rank === 1 ? 17 : 14,
                                }}
                              >
                                {getInitials(leader.full_name)}
                              </Text>
                            </View>
                          </View>

                          <Text
                            className={`mt-1.5 text-center font-bold ${STRONG_TEXT} ${
                              rank === 1 ? "text-[13px]" : "text-xs"
                            }`}
                            numberOfLines={2}
                          >
                            {leader.full_name}
                          </Text>

                          {mine ? (
                            <View className={`mt-0.5 ${YOU_BADGE}`}>
                              <Text className="text-[9px] font-bold text-white">
                                You
                              </Text>
                            </View>
                          ) : null}

                          <View
                            className={`mt-1 flex-row items-center rounded-full px-2 py-0.5 ${
                              rank === 1 ? GOLD_TILE : "bg-[#EEF1F7] dark:bg-slate-700"
                            }`}
                          >
                            <Medal
                              size={10}
                              color={rank === 1 ? goldIcon : navyIcon}
                            />
                            <Text
                              className={`ml-1 text-[10px] font-extrabold ${
                                rank === 1 ? GOLD_TEXT : NAVY_TEXT
                              }`}
                            >
                              {formatPoints(leader.points)} pts
                            </Text>
                          </View>

                          <View
                            className="mt-2 w-full items-center justify-center rounded-t-2xl border-t border-white/50"
                            style={{
                              height: style.blockHeight,
                              backgroundColor: style.blockColor,
                            }}
                          >
                            <Text
                              className="text-2xl font-extrabold"
                              style={{ color: style.numberColor }}
                            >
                              {rank}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>

                  <View className="h-2 bg-[#1b2061]" />
                </View>
              </>
            )}
          </View>
        ) : null}
      </View>

      {/* ---- Scrollable section: search results, or rank 4 and below ---- */}
      <View className="mt-4 flex-1">
        {searching ? (
          <View className="mb-2 flex-row items-center justify-between px-4">
            <View className="flex-row items-center">
              <View className={SECTION_BAR} />
              <Text className={`text-sm font-bold ${STRONG_TEXT}`}>
                Search results
              </Text>
            </View>

            <View className={`rounded-full px-3 py-1 ${SOFT_TILE}`}>
              <Text className={`text-[11px] font-bold ${NAVY_TEXT}`}>
                {searchResults.length} found
              </Text>
            </View>
          </View>
        ) : showOthers && otherLeaders.length > 0 ? (
          <View className="mb-2 flex-row items-center justify-between px-4">
            <View className="flex-row items-center">
              <View className={SECTION_BAR} />
              <Text className={`text-sm font-bold ${STRONG_TEXT}`}>
                Other rankings
              </Text>
            </View>

            <View className={`rounded-full px-3 py-1 ${SOFT_TILE}`}>
              <Text className={`text-[11px] font-bold ${NAVY_TEXT}`}>
                Rank 4+
              </Text>
            </View>
          </View>
        ) : null}

        <ScrollView
          onScroll={handleScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[isDark ? "#4F46E5" : NAVY]}
              tintColor={navyIcon}
              progressBackgroundColor={isDark ? "#1E293B" : "#FFFFFF"}
            />
          }
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 24,
          }}
        >
          {searching ? (
            searchResults.length > 0 ? (
              searchResults.map(({ leader, rank }) =>
                renderRankRow(leader, rank, leader.id ?? `rank-${rank}`)
              )
            ) : (
              <View className="items-center justify-center py-6">
                <Text className="text-center text-xs text-slate-400">
                  No one on the leaderboard matches "{search.trim()}".
                </Text>
              </View>
            )
          ) : showOthers && otherLeaders.length > 0 ? (
            otherLeaders.map((leader, index) =>
              renderRankRow(leader, index + 4, leader.id ?? index)
            )
          ) : showOthers && leaders.length > 0 ? (
            <View className="items-center justify-center py-6">
              <Text className="text-center text-xs text-slate-400">
                Only {Math.min(leaders.length, 3)}{" "}
                {leaders.length === 1 ? "finder is" : "finders are"} ranked
                so far. More will appear here as they earn points.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}