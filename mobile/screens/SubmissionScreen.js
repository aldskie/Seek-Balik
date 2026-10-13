import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Inbox,
  MapPin,
  PackageSearch,
  Search,
  Ticket,
} from 'lucide-react-native';

import { getMyItems } from '../api/api';
import ItemDetailModal from '../components/ItemDetailModal';
import { useAppearance } from '../hooks/Appearance';

const NAVY = '#1b2061';
const MUTED = '#9AA3B5';
// Icon colors used in dark mode.
const NAVY_ON_DARK = '#C7D2FE';
const MUTED_ON_DARK = '#64748B';

// How often the list is re-fetched while the screen is focused.
const POLL_INTERVAL_MS = 5000;

// Most cards shown on one page.
const PAGE_SIZE = 10;

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'Lost', label: 'Lost' },
  { key: 'Surrendered', label: 'Surrendered' },
];

// Matches ItemDetails.STATUS_OPTION exactly: Pending, Approved, Claimed,
// Returned, Archived, Declined. Each has a light and a dark color pair.
const STATUS_STYLES = {
  Pending: { bg: 'bg-orange-50 dark:bg-orange-950', text: 'text-orange-700 dark:text-orange-300' },
  Approved: { bg: 'bg-green-50 dark:bg-green-950', text: 'text-green-700 dark:text-green-300' },
  Claimed: { bg: 'bg-purple-50 dark:bg-purple-950', text: 'text-purple-700 dark:text-purple-300' },
  Archived: { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300' },
  Declined: { bg: 'bg-red-50 dark:bg-red-950', text: 'text-red-700 dark:text-red-300' },
};

const formatDate = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return String(value);

  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

// When the item was lost or found. The backend stores a range: start_date
// ("From") and the optional end_date ("To"). The older created_* names are
// still read as a fallback. Returns "Oct 3, 2026 – Oct 5, 2026" for a range,
// a single date otherwise, or '' when there is no date at all.
const getDateRangeLabel = (item) => {
  const dateFrom = item.start_date || item.created_date;
  const dateTo = item.end_date || item.created_date_to;

  if (!dateFrom) return '';

  return dateTo && dateTo !== dateFrom
    ? `${formatDate(dateFrom)} to ${formatDate(dateTo)}`
    : formatDate(dateFrom);
};

export default function MySubmissionsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const listRef = useRef(null);
  const inFlight = useRef(false); // prevents overlapping requests if one takes >5s

  // Icon and spinner colors follow the app's Light / Dark appearance.
  const { isDark } = useAppearance();
  const navyIcon = isDark ? NAVY_ON_DARK : NAVY;
  const mutedIcon = isDark ? MUTED_ON_DARK : MUTED;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  // 1-based page number for the current filter.
  const [page, setPage] = useState(1);

  // Store only the selected id and derive the item from the latest polled
  // data, so the open modal always shows fresh values (e.g. status changes).
  // null means the modal is closed.
  const [selectedId, setSelectedId] = useState(null);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  const load = useCallback(async (silent = false) => {
    if (inFlight.current) {
      setRefreshing(false); // don't leave pull-to-refresh spinning
      return;
    }
    inFlight.current = true;

    if (!silent) setLoading(true);

    try {
      // The authenticated endpoint returns the user's own Lost reports by email
      // plus Surrendered items matched to the school ID in their account email.
      const response = await getMyItems();
      const mine = Array.isArray(response)
        ? response
        : Array.isArray(response?.results)
          ? response.results
          : [];
      setItems(mine);
      setError('');
    } catch (err) {
      console.error('Failed to load submissions:', err);
      // Background polls fail quietly and keep the current list on screen;
      // only the initial/manual load shows the error state.
      if (!silent) {
        setError('Could not load your submissions.');
        setItems([]);
      }
    } finally {
      inFlight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch on focus, then poll every 5s. The cleanup runs on blur/unmount,
  // so polling stops when the screen isn't visible.
  useFocusEffect(
    useCallback(() => {
      load();
      const id = setInterval(() => load(true), POLL_INTERVAL_MS);
      return () => clearInterval(id);
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  const counts = useMemo(
    () => ({
      all: items.length,
      Lost: items.filter((item) => item.type === 'Lost').length,
      Surrendered: items.filter((item) => item.type === 'Surrendered').length,
    }),
    [items],
  );

  const visibleItems = useMemo(
    () => (filter === 'all' ? items : items.filter((item) => item.type === filter)),
    [items, filter],
  );

  const totalPages = Math.max(1, Math.ceil(visibleItems.length / PAGE_SIZE));
  // A poll can shrink the list (e.g. an item removed), so the page in use is
  // clamped to the last one that still exists instead of showing a blank page.
  const currentPage = Math.min(page, totalPages);

  const pagedItems = useMemo(
    () => visibleItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [visibleItems, currentPage],
  );

  const scrollToTop = () => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  };

  // Filter tabs are sticky (outside the scrollable FlatList content), so
  // changing filter needs an explicit scroll-to-top — the list won't do
  // it automatically since the header no longer scrolls with the content.
  // A new filter always starts again on page 1.
  const handleFilterChange = (key) => {
    setFilter(key);
    setPage(1);
    scrollToTop();
  };

  const goToPage = (next) => {
    const target = Math.min(Math.max(next, 1), totalPages);
    if (target === currentPage) return;
    setPage(target);
    scrollToTop();
  };

  // Pagination under the last card, same design as My Claim Requests:
  // "Showing X–Y of N" and "Page X of Y" on top, then a previous arrow,
  // page numbers and a next arrow. Always shown when there is at least one
  // card, even if everything fits on one page (the arrows are then greyed
  // out). The empty / loading / error states have their own message instead.
  const renderPagination = () => {
    if (visibleItems.length === 0) return null;

    const startIndex = (currentPage - 1) * PAGE_SIZE;
    const endIndex = Math.min(startIndex + PAGE_SIZE, visibleItems.length);
    const atStart = currentPage === 1;
    const atEnd = currentPage === totalPages;
    const disabledIcon = isDark ? '#475569' : '#CBD5E1';

    // First page, last page, and the pages next to the current one.
    const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1).filter(
      (number) =>
        number === 1 || number === totalPages || Math.abs(number - currentPage) <= 1,
    );

    const arrowClass = (disabled) =>
      `h-9 w-9 items-center justify-center rounded-lg border ${
        disabled
          ? 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900'
          : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800'
      }`;

    return (
      <View className="mt-2 border-t border-slate-100 pt-4 dark:border-slate-800">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-[11px] font-semibold text-slate-400">
            Showing {startIndex + 1}–{endIndex} of {visibleItems.length}
          </Text>
          <Text className="text-[11px] font-semibold text-slate-400">
            Page {currentPage} of {totalPages}
          </Text>
        </View>

        <View className="flex-row items-center justify-between">
          <TouchableOpacity
            disabled={atStart}
            onPress={() => goToPage(currentPage - 1)}
            accessibilityLabel="Previous page"
            className={arrowClass(atStart)}
          >
            <ChevronLeft size={16} color={atStart ? disabledIcon : navyIcon} />
          </TouchableOpacity>

          <View className="flex-row gap-1.5">
            {pageNumbers.map((number) => {
              const active = number === currentPage;
              return (
                <TouchableOpacity
                  key={number}
                  onPress={() => goToPage(number)}
                  className={`h-9 w-9 items-center justify-center rounded-lg ${
                    active ? 'bg-[#1b2061] dark:bg-indigo-600' : 'bg-[#EEF1F7] dark:bg-slate-800'
                  }`}
                >
                  <Text
                    className={`text-[11px] font-bold ${
                      active ? 'text-white' : 'text-[#1b2061] dark:text-slate-200'
                    }`}
                  >
                    {number}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            disabled={atEnd}
            onPress={() => goToPage(currentPage + 1)}
            accessibilityLabel="Next page"
            className={arrowClass(atEnd)}
          >
            <ChevronRight size={16} color={atEnd ? disabledIcon : navyIcon} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderEmpty = () => {
    if (loading) {
      return (
        <View className="items-center py-16">
          <ActivityIndicator size="small" color={navyIcon} />
          <Text className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Loading your submissions...
          </Text>
        </View>
      );
    }

    if (error) {
      return (
        <View className="items-center px-4 py-16">
          <PackageSearch size={32} color={mutedIcon} />

          <Text className="mt-3 text-center text-sm text-slate-500 dark:text-slate-400">{error}</Text>

          <TouchableOpacity
            onPress={() => load()}
            className="mt-4 rounded-full bg-[#1b2061] px-5 py-2.5 dark:bg-indigo-600"
          >
            <Text className="text-sm font-bold text-white">Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View className="items-center px-4 py-16">
        <Inbox size={32} color={mutedIcon} />

        <Text className="mt-4 text-center text-base font-bold text-[#16233F] dark:text-slate-100">
          {filter === 'all' ? 'No submissions yet' : `No ${filter.toLowerCase()} submissions`}
        </Text>

        <Text className="mt-2 text-center text-sm leading-5 text-slate-500 dark:text-slate-400">
          {filter === 'Lost'
            ? 'Lost item reports you file will show up here.'
            : filter === 'Surrendered'
              ? 'Surrendered items registered with your School ID will show up here.'
              : 'Your lost reports and surrendered items will show up here.'}
        </Text>
      </View>
    );
  };

  const renderItem = ({ item }) => {
    const statusStyle = STATUS_STYLES[item.status] || STATUS_STYLES.Pending;
    const thumbnail = item.images?.[0]?.image || item.image;
    // Single date, or "From – To" when the report has a date range.
    const dateLabel = getDateRangeLabel(item);

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setSelectedId(item.id)}
        className="mb-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
      >
        <View className="flex-row items-start justify-between">
          <View className="flex-1 flex-row items-center pr-3">
            {thumbnail ? (
              <Image
                source={{ uri: thumbnail }}
                className="mr-3 h-11 w-11 rounded-lg bg-slate-100 dark:bg-slate-800"
              />
            ) : (
              <View
                className={`mr-3 h-11 w-11 items-center justify-center rounded-lg ${
                  item.type === 'Lost'
                    ? 'bg-rose-50 dark:bg-rose-950'
                    : 'bg-slate-100 dark:bg-slate-800'
                }`}
              >
                {item.type === 'Lost' ? (
                  <Search size={18} color={isDark ? '#FB7185' : '#E11D48'} />
                ) : (
                  <PackageSearch size={18} color={navyIcon} />
                )}
              </View>
            )}

            <View className="flex-1">
              <Text className="text-sm font-bold text-[#16233F] dark:text-slate-100" numberOfLines={2}>
                {item.title}
              </Text>

              <Text className="mt-0.5 text-[11px] font-semibold text-slate-400">
                {item.type} • {item.category}
              </Text>
            </View>
          </View>

          <View className={`rounded-full px-2.5 py-1 ${statusStyle.bg}`}>
            <Text className={`text-[10px] font-bold ${statusStyle.text}`}>
              {item.status}
            </Text>
          </View>
        </View>

        {!!item.description && (
          <Text className="mt-2.5 text-xs leading-5 text-slate-500 dark:text-slate-400" numberOfLines={2}>
            {item.description}
          </Text>
        )}

        <View className="mt-3 flex-row flex-wrap items-center">
          {!!item.location && (
            <View className="mr-4 flex-row items-center">
              <MapPin size={12} color={mutedIcon} />
              <Text className="ml-1 text-[11px] text-slate-400">{item.location}</Text>
            </View>
          )}

          {!!dateLabel && (
            <View className="mr-4 flex-row items-center">
              <CalendarDays size={12} color={mutedIcon} />
              <Text className="ml-1 text-[11px] text-slate-400">
                {dateLabel}
              </Text>
            </View>
          )}

          {!!item.ticket_code && (
            <View className="flex-row items-center">
              <Ticket size={12} color={mutedIcon} />
              <Text className="ml-1 text-[11px] text-slate-400">
                {item.ticket_code}
              </Text>
            </View>
          )}
        </View>

        {item.status === 'Declined' && !!item.declined_remarks && (
          <View className="mt-3 rounded-lg bg-rose-50 px-3 py-2 dark:bg-rose-950">
            <Text className="text-[11px] leading-4 text-rose-700 dark:text-rose-300">
              {item.declined_remarks}
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <StatusBar style="light" backgroundColor={NAVY} translucent={false} />

      <SafeAreaView edges={['top']} className="rounded-b-3xl bg-[#1b2061]">
        <View className="flex-row items-center px-4 pb-6 pt-2">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            className="mr-3 h-9 w-9 items-center justify-center rounded-full bg-white/10"
          >
            <ArrowLeft size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <View>
            <Text className="text-[12px] font-bold tracking-widest text-white/60">
              SEEK AND BALIK
            </Text>
            <Text className="text-2xl font-bold text-white">My Submissions</Text>
          </View>
        </View>
      </SafeAreaView>

      {/* Sticky filter row — sits outside the FlatList, so it never scrolls
          with the cards. Its own bottom border/shadow-less bg keeps it
          visually separated from the list below. */}
      <View className="bg-slate-50 px-4 pb-3 pt-4 dark:bg-slate-950">
        <View className="flex-row overflow-hidden rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
          {FILTERS.map((option) => {
            const active = filter === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                onPress={() => handleFilterChange(option.key)}
                className={`flex-1 flex-row items-center justify-center py-2.5 ${
                  active ? 'bg-[#1b2061] dark:bg-indigo-600' : 'bg-white dark:bg-slate-900'
                }`}
              >
                <Text
                  className={`text-sm font-semibold ${
                    active ? 'text-white' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {option.label}
                </Text>

                <View
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 ${
                    active ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-800'
                  }`}
                >
                  <Text
                    className={`text-[10px] font-bold ${
                      active ? 'text-white' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {counts[option.key] ?? 0}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <FlatList
        ref={listRef}
        data={pagedItems}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderPagination}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[isDark ? '#4F46E5' : NAVY]}
            tintColor={navyIcon}
            progressBackgroundColor={isDark ? '#1E293B' : '#FFFFFF'}
          />
        }
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 16,
          paddingTop: 4,
          paddingBottom: insets.bottom + 24,
        }}
      />

      <ItemDetailModal
        visible={!!selectedItem}
        item={selectedItem}
        onClose={() => setSelectedId(null)}
      />
    </View>
  );
}