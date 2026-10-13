import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  ChevronLeft,
  ChevronRight,
  History,
  SlidersHorizontal,
  X,
} from 'lucide-react-native';

import { getPointsTracking } from '../../api/api';
import { useAppearance } from '../../hooks/Appearance';

const NAVY = '#1b2061';
const PAGE_SIZE = 10;

export default function LeaderboardHistory() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const { isDark } = useAppearance();

  // Navy icons and spinners turn light indigo on dark backgrounds.
  const accent = isDark ? '#C7D2FE' : NAVY;

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [schoolYear, setSchoolYear] = useState('');
  const [semester, setSemester] = useState('');
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [draftSchoolYear, setDraftSchoolYear] = useState('');
  const [draftSemester, setDraftSemester] = useState('');

  const [page, setPage] = useState(1);

  const getSchoolYearAndSemester = (dateString) => {
    const date = dateString ? new Date(dateString) : new Date();

    if (Number.isNaN(date.getTime())) {
      return { schoolYear: '', semester: '' };
    }

    const year = date.getFullYear();
    const month = date.getMonth();

    // August–December
    if (month >= 7 && month <= 11) {
      return {
        schoolYear: `${year}-${year + 1}`,
        semester: '1st Semester',
      };
    }

    // January–May
    if (month >= 0 && month <= 4) {
      return {
        schoolYear: `${year - 1}-${year}`,
        semester: '2nd Semester',
      };
    }

    // June–July
    return {
      schoolYear: `${year}`,
      semester: 'Short Term',
    };
  };

  const openFilters = () => {
    setDraftSchoolYear(schoolYear);
    setDraftSemester(semester);
    setFilterModalVisible(true);
  };

  const applyFilters = () => {
    setSchoolYear(draftSchoolYear);
    setSemester(draftSemester);
    setFilterModalVisible(false);
  };

  const clearFilters = () => {
    setSchoolYear('');
    setSemester('');
    setDraftSchoolYear('');
    setDraftSemester('');
    setFilterModalVisible(false);
  };

  const activeFilterCount =
    Number(Boolean(schoolYear)) + Number(Boolean(semester));

  const loadHistory = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      setLoadError('');

      const data = await getPointsTracking();
      setRecords(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load point history:', error);
      setLoadError('Could not load point history. Please try again.');
      setRecords([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory])
  );

  // Go back to page 1 whenever the filters change
  useEffect(() => {
    setPage(1);
  }, [schoolYear, semester]);

  const schoolYearOptions = [
    ...new Set(
      records.map((record) =>
        getSchoolYearAndSemester(record.created_at).schoolYear
      )
    ),
  ]
    .filter(Boolean)
    .sort()
    .reverse();

  const semesterOptions = [
    '1st Semester',
    '2nd Semester',
    'Short Term',
  ];

  const filteredRecords = records.filter((record) => {
    const period = getSchoolYearAndSemester(record.created_at);

    return (
      (!schoolYear || period.schoolYear === schoolYear) &&
      (!semester || period.semester === semester)
    );
  });

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, filteredRecords.length);
  const paginatedRecords = filteredRecords.slice(startIndex, endIndex);

  // Show first page, last page, and the current page +/- 1
  const pageNumbers = Array.from(
    { length: totalPages },
    (_, index) => index + 1
  ).filter(
    (p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1
  );

  const goToPage = (next) => {
    const target = Math.min(Math.max(next, 1), totalPages);
    setPage(target);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  return (
    <View className="flex-1 bg-[#F7F8FC] dark:bg-slate-950">
      <StatusBar style="light" backgroundColor={NAVY} />

      <SafeAreaView edges={['top']} className="rounded-b-3xl bg-[#1b2061]">
        <View className="flex-row items-center px-4 pb-6 pt-2">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-white/10"
          >
            <ChevronLeft size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View className="flex-1">
            <Text className="text-[12px] font-bold tracking-widest text-white/60">
              SYSTEM CONTROL
            </Text>

            <Text className="text-2xl font-bold text-white">
              Leaderboard History
            </Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        ref={scrollRef}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadHistory(true)}
            colors={[isDark ? '#4F46E5' : NAVY]}
            progressBackgroundColor={isDark ? '#1E293B' : '#FFFFFF'}
          />
        }
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 24,
        }}
      >
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-lg font-bold text-[#16233F] dark:text-slate-100">
              Point History
            </Text>

            <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Track earned leaderboard points.
            </Text>
          </View>

          <TouchableOpacity
            onPress={openFilters}
            className="flex-row items-center rounded-xl bg-[#EEF1F7] dark:bg-slate-800 px-3 py-2.5"
          >
            <SlidersHorizontal size={16} color={accent} />

            <Text className="ml-2 text-xs font-bold text-[#1b2061] dark:text-indigo-200">
              Filter{activeFilterCount ? ` (${activeFilterCount})` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {activeFilterCount ? (
          <View className="mt-4 flex-row flex-wrap gap-2">
            {schoolYear ? (
              <TouchableOpacity
                onPress={() => setSchoolYear('')}
                className="flex-row items-center rounded-full bg-[#E8EBF8] dark:bg-slate-800 px-3 py-1.5"
              >
                <Text className="text-xs font-bold text-[#1b2061] dark:text-indigo-200">
                  SY {schoolYear}
                </Text>
                <X size={13} color={accent} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            ) : null}

            {semester ? (
              <TouchableOpacity
                onPress={() => setSemester('')}
                className="flex-row items-center rounded-full bg-[#E8EBF8] dark:bg-slate-800 px-3 py-1.5"
              >
                <Text className="text-xs font-bold text-[#1b2061] dark:text-indigo-200">
                  {semester}
                </Text>
                <X size={13} color={accent} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        <View className="mb-3 mt-6 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View className="mr-2 h-4 w-1 rounded-full bg-[#1b2061] dark:bg-indigo-400" />

            <Text className="text-sm font-bold text-[#16233F] dark:text-slate-100">
              Point records
            </Text>
          </View>

          <View className="rounded-full bg-[#EEF1F7] dark:bg-slate-800 px-3 py-1">
            <Text className="text-[11px] font-bold text-[#1b2061] dark:text-indigo-200">
              {filteredRecords.length} entries
            </Text>
          </View>
        </View>

        {loading ? (
          <View className="items-center py-12">
            <ActivityIndicator size="small" color={accent} />
            <Text className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Loading point history...
            </Text>
          </View>
        ) : loadError ? (
          <View className="items-center rounded-2xl border border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950 px-6 py-12">
            <Text className="text-center text-sm font-bold text-rose-700 dark:text-rose-300">
              {loadError}
            </Text>

            <TouchableOpacity
              onPress={() => loadHistory()}
              className="mt-4 rounded-xl bg-[#1b2061] dark:bg-indigo-600 px-4 py-3"
            >
              <Text className="text-xs font-bold text-white">
                TRY AGAIN
              </Text>
            </TouchableOpacity>
          </View>
        ) : filteredRecords.length === 0 ? (
          <View className="items-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-6 py-12">
            <History size={30} color="#94A3B8" />

            <Text className="mt-3 text-sm font-bold text-[#16233F] dark:text-slate-100">
              No point records found
            </Text>

            <Text className="mt-2 text-center text-xs leading-5 text-slate-500 dark:text-slate-400">
              Try another school year or semester.
            </Text>
          </View>
        ) : (
          paginatedRecords.map((record) => {
            const isPositive = Number(record.points) >= 0;

            const reason =
              record.reason === 'SURRENDER_ITEM'
                ? 'Surrendered item'
                : record.reason === 'ITEM_CLAIMED'
                  ? 'Item claimed by owner'
                  : record.reason;

            return (
              <View
                key={record.id}
                className="mb-2.5 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-4"
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="text-sm font-bold text-[#16233F] dark:text-slate-100">
                      {record.player_name || 'Unknown student'}
                    </Text>

                    <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {reason}
                    </Text>
                  </View>

                  <View
                    className={`rounded-full px-2.5 py-1 ${
                      isPositive ? 'bg-emerald-100 dark:bg-emerald-950' : 'bg-rose-100 dark:bg-rose-950'
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        isPositive
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-rose-700 dark:text-rose-300'
                      }`}
                    >
                      {isPositive ? '+' : ''}
                      {record.points} pts
                    </Text>
                  </View>
                </View>

                <View className="mt-3 flex-row items-center justify-between">
                  <View className="rounded-full bg-[#EEF1F7] dark:bg-slate-800 px-2.5 py-1">
                    <Text className="text-[11px] font-semibold text-[#1b2061] dark:text-indigo-200">
                      {record.item_id ? `Item #${record.item_id}` : 'No item'}
                    </Text>
                  </View>

                  <Text className="text-[11px] text-slate-400 dark:text-slate-500">
                    {record.created_at
                      ? new Date(record.created_at).toLocaleString()
                      : 'Unknown date'}
                  </Text>
                </View>
              </View>
            );
          })
        )}

        {/* Pagination controls */}
        {!loading && !loadError && filteredRecords.length > 0 ? (
          <View className="mt-2 border-t border-slate-100 dark:border-slate-800 pt-4">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                Showing {startIndex + 1}–{endIndex} of {filteredRecords.length}
              </Text>
              <Text className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                Page {currentPage} of {totalPages}
              </Text>
            </View>

            <View className="flex-row items-center justify-between">
              <TouchableOpacity
                disabled={currentPage === 1}
                onPress={() => goToPage(currentPage - 1)}
                className={`h-9 w-9 items-center justify-center rounded-lg border ${
                  currentPage === 1
                    ? 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900'
                    : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800'
                }`}
              >
                <ChevronLeft
                  size={16}
                  color={currentPage === 1 ? (isDark ? '#475569' : '#CBD5E1') : accent}
                />
              </TouchableOpacity>

              <View className="flex-row gap-1.5">
                {pageNumbers.map((p) => (
                  <TouchableOpacity
                    key={p}
                    onPress={() => goToPage(p)}
                    className={`h-9 w-9 items-center justify-center rounded-lg ${
                      p === currentPage ? 'bg-[#1b2061] dark:bg-indigo-600' : 'bg-[#EEF1F7] dark:bg-slate-800'
                    }`}
                  >
                    <Text
                      className={`text-[11px] font-bold ${
                        p === currentPage ? 'text-white' : 'text-[#1b2061] dark:text-indigo-200'
                      }`}
                    >
                      {p}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                disabled={currentPage === totalPages}
                onPress={() => goToPage(currentPage + 1)}
                className={`h-9 w-9 items-center justify-center rounded-lg border ${
                  currentPage === totalPages
                    ? 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900'
                    : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800'
                }`}
              >
                <ChevronRight
                  size={16}
                  color={currentPage === totalPages ? (isDark ? '#475569' : '#CBD5E1') : accent}
                />
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={filterModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/40 dark:bg-black/60">
          <View className="rounded-t-3xl bg-white dark:bg-slate-900 px-5 pb-6 pt-3">
            <View className="items-center">
              <View className="h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700" />
            </View>

            <View className="mt-5 flex-row items-center justify-between">
              <View>
                <Text className="text-lg font-bold text-[#16233F] dark:text-slate-100">
                  Filter history
                </Text>
                <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Choose the point-record period to display.
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setFilterModalVisible(false)}
                className="h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"
              >
                <X size={18} color={isDark ? '#94A3B8' : '#475569'} />
              </TouchableOpacity>
            </View>

            <Text className="mb-2 mt-6 text-[11px] font-bold tracking-wide text-slate-500 dark:text-slate-400">
              SCHOOL YEAR
            </Text>

            <View className="flex-row flex-wrap gap-2">
              <TouchableOpacity
                onPress={() => setDraftSchoolYear('')}
                className={`rounded-full px-3 py-2 ${
                  !draftSchoolYear
                    ? 'bg-[#1b2061] dark:bg-indigo-600'
                    : 'border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800'
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    !draftSchoolYear ? 'text-white' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  All years
                </Text>
              </TouchableOpacity>

              {schoolYearOptions.map((year) => (
                <TouchableOpacity
                  key={year}
                  onPress={() => setDraftSchoolYear(year)}
                  className={`rounded-full px-3 py-2 ${
                    draftSchoolYear === year
                      ? 'bg-[#1b2061] dark:bg-indigo-600'
                      : 'border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800'
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      draftSchoolYear === year ? 'text-white' : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    SY {year}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text className="mb-2 mt-6 text-[11px] font-bold tracking-wide text-slate-500 dark:text-slate-400">
              SEMESTER
            </Text>

            <View className="flex-row flex-wrap gap-2">
              <TouchableOpacity
                onPress={() => setDraftSemester('')}
                className={`rounded-full px-3 py-2 ${
                  !draftSemester
                    ? 'bg-[#1b2061] dark:bg-indigo-600'
                    : 'border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800'
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    !draftSemester ? 'text-white' : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  All semesters
                </Text>
              </TouchableOpacity>

              {semesterOptions.map((option) => (
                <TouchableOpacity
                  key={option}
                  onPress={() => setDraftSemester(option)}
                  className={`rounded-full px-3 py-2 ${
                    draftSemester === option
                      ? 'bg-[#1b2061] dark:bg-indigo-600'
                      : 'border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800'
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      draftSemester === option ? 'text-white' : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {option}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View className="mt-7 flex-row gap-3">
              <TouchableOpacity
                onPress={clearFilters}
                className="flex-1 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 py-3.5"
              >
                <Text className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  CLEAR
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={applyFilters}
                className="flex-[1.4] items-center justify-center rounded-xl bg-[#1b2061] dark:bg-indigo-600 py-3.5"
              >
                <Text className="text-xs font-bold text-white">
                  APPLY FILTERS
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}