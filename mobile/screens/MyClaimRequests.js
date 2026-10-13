import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import {
  CalendarCheck2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  WifiOff,
} from 'lucide-react-native';

import { getMyClaims } from '../api/api';
import { useTabBarVisibility } from '../hooks/TabBarVisibility';
import { useAppearance } from '../hooks/Appearance';

export default function MyClaimRequestsScreen() {
  const NAVY = '#1b2061';
  const PAGE_SIZE = 10;

  // Colors passed as values (icons, spinners, inline styles) follow the
  // app's Light / Dark appearance.
  const { isDark } = useAppearance();
  const navyIcon = isDark ? '#C7D2FE' : NAVY;
  const disabledIcon = isDark ? '#475569' : '#CBD5E1';
  const filterColors = isDark
    ? {
        activeBg: '#4F46E5',
        activeBorder: '#4F46E5',
        idleBg: '#0F172A',
        idleBorder: '#334155',
        idleText: '#CBD5E1',
        idleCountBg: '#1E293B',
        idleCountText: '#94A3B8',
      }
    : {
        activeBg: NAVY,
        activeBorder: NAVY,
        idleBg: '#FFFFFF',
        idleBorder: '#E2E8F0',
        idleText: '#475569',
        idleCountBg: '#F1F5F9',
        idleCountText: '#64748B',
      };

  const STATUS_FILTERS = [
    { key: 'All'},
    { key: 'Pending'},
    { key: 'Scheduled'},
    { key: 'Declined'},
  ];

  // Each status has a light and a dark color pair.
  const STATUS_STYLES = {
    Pending: {
      pill: 'bg-orange-100 dark:bg-orange-950',
      pillText: 'text-orange-700 dark:text-orange-300',
      noteBox: 'border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950',
      noteText: 'text-orange-700 dark:text-orange-300',
      note: 'Your claim request is waiting for moderator review.',
    },
    Scheduled: {
      pill: 'bg-blue-100 dark:bg-blue-950',
      pillText: 'text-blue-700 dark:text-blue-300',
      noteBox: 'border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950',
      noteText: 'text-blue-700 dark:text-blue-300',
      note: 'Your meeting has been scheduled. Please bring your School ID.',
    },
    Approved: {
      pill: 'bg-green-100 dark:bg-green-950',
      pillText: 'text-green-700 dark:text-green-300',
      noteBox: 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950',
      noteText: 'text-green-700 dark:text-green-300',
      note: 'Your claim has been approved.',
    },
    Declined: {
      pill: 'bg-red-100 dark:bg-red-950',
      pillText: 'text-red-700 dark:text-red-300',
      noteBox: 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950',
      noteText: 'text-red-700 dark:text-red-300',
      note: 'Your claim request was declined.',
    },
  };

  const FALLBACK_STATUS_STYLE = {
    pill: 'bg-slate-100 dark:bg-slate-800',
    pillText: 'text-slate-600 dark:text-slate-300',
    noteBox: '',
    noteText: '',
    note: '',
  };

  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { handleScroll } = useTabBarVisibility();

  const [claims, setClaims] = useState([]);
  const [statusFilter, setStatusFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const listRef = useRef(null);
  const requestInFlightRef = useRef(false);

  const normalizeStatus = (status) => {
    const value = String(status || '').trim();
    if (!value) return '';

    const titled = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
    return titled === 'Declined' ? 'Declined' : titled;
  };

  const toTitleCase = (text) => {
    if (!text || typeof text !== 'string') return '';

    return text
      .toLowerCase()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatExactDate = (value, fallback = '-') => {
    if (!value || typeof value !== 'string') return value || fallback;

    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return value;

    const [year, month, day] = match.slice(1).map(Number);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(year, month - 1, day));
  };

  // Shows hours and minutes only: seconds and milliseconds are dropped, so
  // "14:30", "14:30:00" and "14:30:00.123456" all become "2:30 PM".
  const formatTimeLabel = (value) => {
    if (!value || typeof value !== 'string') return '-';

    const match = value
      .trim()
      .match(/(?:^|T|\s)([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?/);
    if (!match) return value;

    const period = Number(match[1]) >= 12 ? 'PM' : 'AM';
    const hour = Number(match[1]) % 12 || 12;
    return `${hour}:${match[2]} ${period}`;
  };

  const extractClaims = (response) => {
    if (Array.isArray(response)) return response;
    if (Array.isArray(response?.claims)) return response.claims;
    if (Array.isArray(response?.results)) return response.results;
    return [];
  };

  const getClaimItem = (claim) => {
    if (claim?.item_details && typeof claim.item_details === 'object') {
      return claim.item_details;
    }
    if (claim?.item && typeof claim.item === 'object') {
      return claim.item;
    }
    return {};
  };

  const loadClaims = useCallback(async ({ pullToRefresh = false } = {}) => {
    if (requestInFlightRef.current) return;

    requestInFlightRef.current = true;
    setError('');
    if (pullToRefresh) setRefreshing(true);

    try {
      const response = await getMyClaims();
      setClaims(extractClaims(response));
    } catch (err) {
      console.error('Failed to load claim requests:', err);
      setError(
        'We could not load your claim requests. Please check your connection and try again.'
      );
    } finally {
      requestInFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadClaims();
    }, [loadClaims])
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter]);

  const visibleClaims = useMemo(
    () =>
      [...claims]
        .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
        .filter(
          (claim) =>
            statusFilter === 'All' ||
            normalizeStatus(claim.status) === statusFilter
        ),
    [claims, statusFilter]
  );

  const statusCounts = useMemo(() => {
    const counts = { All: claims.length, Pending: 0, Scheduled: 0, Declined: 0 };

    claims.forEach((claim) => {
      const status = normalizeStatus(claim.status);
      if (status === 'Pending' || status === 'Scheduled' || status === 'Declined') {
        counts[status] += 1;
      }
    });

    return counts;
  }, [claims]);

  const totalPages = Math.max(Math.ceil(visibleClaims.length / PAGE_SIZE), 1);
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, visibleClaims.length);
  const paginatedClaims = visibleClaims.slice(startIndex, endIndex);

  const pageNumbers = Array.from(
    { length: totalPages },
    (_, index) => index + 1
  ).filter(
    (page) =>
      page === 1 ||
      page === totalPages ||
      Math.abs(page - safeCurrentPage) <= 1
  );

  const goToPage = (page) => {
    if (page < 1 || page > totalPages) return;
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setCurrentPage(page);
  };

  const renderClaimCard = ({ item: claim }) => {
    const item = getClaimItem(claim);
    const status = normalizeStatus(claim.status);
    const style = STATUS_STYLES[status] || FALLBACK_STATUS_STYLE;

    const details = [
      { label: 'LOCATION', value: toTitleCase(item.location) || '-' },
      { label: 'SUBMITTED', value: formatExactDate(claim.claim_date) },
      {
        label: 'MEETING DATE',
        value: claim.meeting_date
          ? formatExactDate(claim.meeting_date)
          : 'Pending staff review',
      },
      { label: 'MEETING TIME', value: formatTimeLabel(claim.meeting_time) },
    ];

    return (
      <View className="mb-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <View className="flex-row items-start justify-between">
          <View className="flex-1 pr-3">
            <Text numberOfLines={2} className="text-base font-bold text-[#1b2061] dark:text-slate-100">
              {toTitleCase(item.title || claim.item_title || 'Claimed Item')}
            </Text>
            <Text numberOfLines={1} className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {toTitleCase(item.category) || '-'}
            </Text>
          </View>

          {/* The status is uppercased in JS and the text is told not to
              wrap, because some Android phones measure bold uppercase text
              slightly too narrow and clip its last letter ("PENDIN"). */}
          <View className={`shrink-0 rounded-full px-3 py-1 ${style.pill}`}>
            <Text
              numberOfLines={1}
              textBreakStrategy="simple"
              className={`text-[10px] font-bold ${style.pillText}`}
            >
              {(status || 'Unknown').toUpperCase()}
            </Text>
          </View>
        </View>

        <View className="mt-1 flex-row flex-wrap border-t border-slate-100 pt-1 dark:border-slate-800">
          {details.map((detail) => (
            <View key={detail.label} className="mt-4 w-1/2 pr-3">
              <Text className="text-[10px] font-bold tracking-wide text-slate-400">
                {detail.label}
              </Text>
              <Text className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                {detail.value}
              </Text>
            </View>
          ))}

          <View className="mt-4 w-full">
            <Text className="text-[10px] font-bold tracking-wide text-slate-400">
              MEETING LOCATION
            </Text>
            <Text className="mt-0.5 text-sm font-medium text-slate-700 dark:text-slate-200">
              {claim.meeting_location || 'Student Affairs Office'}
            </Text>
          </View>
        </View>

        {!!style.note && (
          <View className={`mt-4 rounded-xl border p-3 ${style.noteBox}`}>
            <Text className={`text-xs font-medium ${style.noteText}`}>
              {style.note}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;

    if (error) {
      return (
        <View className="items-center px-6 pt-16">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-rose-50 dark:bg-rose-950">
            <WifiOff size={26} color={isDark ? '#FB7185' : '#E11D48'} />
          </View>
          <Text className="mt-4 text-center text-base font-semibold text-[#16233F] dark:text-slate-100">
            Couldn't load your requests
          </Text>
          <Text className="mt-1 text-center text-sm text-slate-500 dark:text-slate-400">{error}</Text>
          <TouchableOpacity
            onPress={() => {
              setLoading(true);
              loadClaims();
            }}
            className="mt-5 h-11 flex-row items-center justify-center rounded-xl bg-[#1b2061] px-5 dark:bg-indigo-600"
          >
            <RefreshCw size={15} color="#FFFFFF" />
            <Text className="ml-2 text-sm font-semibold text-white">Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const filtered = statusFilter !== 'All' && claims.length > 0;

    return (
      <View className="items-center px-6 pt-16">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
          <CalendarCheck2 size={26} color={isDark ? '#64748B' : '#9AA3B5'} />
        </View>
        <Text className="mt-4 text-center text-base font-semibold text-[#16233F] dark:text-slate-100">
          {filtered ? `No ${statusFilter.toLowerCase()} requests` : 'No claim requests yet'}
        </Text>
        <Text className="mt-1 text-center text-sm text-slate-500 dark:text-slate-400">
          {filtered
            ? 'Try another status filter.'
            : 'Claims you submit on surrendered items will appear here.'}
        </Text>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <StatusBar style="light" backgroundColor={NAVY} translucent={false} />

      <SafeAreaView edges={['top']} className="rounded-b-3xl bg-[#1b2061]">
        <View className="flex-row items-center px-4 pb-6 pt-2">
          <TouchableOpacity
            onPress={() => {
              if (navigation.canGoBack()) navigation.goBack();
            }}
            className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-white/10"
            accessibilityLabel="Return to profile"
          >
            <ChevronLeft size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View className="flex-1">
            <Text className="text-[12px] font-bold tracking-widest text-white/60">
              SEEK AND BALIK
            </Text>
            <Text className="text-2xl font-bold text-white">My Claim Requests</Text>
          </View>

          <View className="h-10 w-10 items-center justify-center rounded-full bg-white/10">
            <CalendarCheck2 size={20} color="#FFFFFF" />
          </View>
        </View>
      </SafeAreaView>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={navyIcon} />
          <Text className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
            Loading your claim requests…
          </Text>
        </View>
      ) : (
        <>
          {!error && claims.length > 0 && (
            <View className="z-10 bg-slate-50 px-4 pb-2 pt-4 dark:bg-slate-950">
              <View className="flex-row gap-2">
                {STATUS_FILTERS.map(({ key }) => {
                  const active = statusFilter === key;

                  return (
                    <TouchableOpacity
                      key={key}
                      activeOpacity={0.85}
                      onPress={() => setStatusFilter(key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      className="h-11 flex-1 flex-row items-center justify-center rounded-xl border px-2"
                      style={{
                        backgroundColor: active ? filterColors.activeBg : filterColors.idleBg,
                        borderColor: active ? filterColors.activeBorder : filterColors.idleBorder,
                      }}
                    >
                      {/* The label shrinks slightly on narrow phones instead of losing its last letter. */}
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                        textBreakStrategy="simple"
                        className="shrink text-[13px] font-semibold"
                        style={{ color: active ? '#FFFFFF' : filterColors.idleText }}
                      >
                        {key}
                      </Text>
                      <View
                        className="ml-1.5 h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5"
                        style={{
                          backgroundColor: active
                            ? 'rgba(255,255,255,0.18)'
                            : filterColors.idleCountBg,
                        }}
                      >
                        <Text
                          className="text-[10px] font-bold"
                          style={{ color: active ? '#FFFFFF' : filterColors.idleCountText }}
                        >
                          {statusCounts[key] || 0}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          <FlatList
            ref={listRef}
            className="flex-1"
            data={error ? [] : paginatedClaims}
            keyExtractor={(claim, index) => String(claim.id ?? `claim-${index}`)}
            renderItem={renderClaimCard}
            onScroll={handleScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadClaims({ pullToRefresh: true })}
                tintColor={navyIcon}
                colors={[isDark ? '#4F46E5' : NAVY]}
                progressBackgroundColor={isDark ? '#1E293B' : '#FFFFFF'}
              />
            }
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 8,
              paddingBottom: insets.bottom + 24,
              flexGrow: 1,
            }}
            ListEmptyComponent={renderEmpty}
            ListFooterComponent={
              !error && visibleClaims.length > 0 ? (
                <View className="mt-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <View className="mb-3 flex-row items-center justify-between">
                    <Text className="text-[11px] font-semibold text-slate-400">
                      Showing {startIndex + 1}–{endIndex} of {visibleClaims.length}
                    </Text>
                    <Text className="text-[11px] font-semibold text-slate-400">
                      Page {safeCurrentPage} of {totalPages}
                    </Text>
                  </View>

                  <View className="flex-row items-center justify-between">
                    <TouchableOpacity
                      disabled={safeCurrentPage === 1}
                      onPress={() => goToPage(safeCurrentPage - 1)}
                      accessibilityLabel="Previous page"
                      className={`h-9 w-9 items-center justify-center rounded-lg border ${
                        safeCurrentPage === 1
                          ? 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900'
                          : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800'
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
                              ? 'bg-[#1b2061] dark:bg-indigo-600'
                              : 'bg-[#EEF1F7] dark:bg-slate-800'
                          }`}
                        >
                          <Text
                            className={`text-[11px] font-bold ${
                              page === safeCurrentPage
                                ? 'text-white'
                                : 'text-[#1b2061] dark:text-slate-200'
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
                      accessibilityLabel="Next page"
                      className={`h-9 w-9 items-center justify-center rounded-lg border ${
                        safeCurrentPage === totalPages
                          ? 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900'
                          : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800'
                      }`}
                    >
                      <ChevronRight
                        size={16}
                        color={safeCurrentPage === totalPages ? disabledIcon : navyIcon}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null
            }
          />
        </>
      )}
    </View>
  );
}