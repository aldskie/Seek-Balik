import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Inbox,
  RefreshCw,
} from 'lucide-react-native';

import { getIssueReports } from '../../api/api';
import { useTabBarVisibility } from '../../hooks/TabBarVisibility';
import { useAppearance } from '../../hooks/Appearance';

const NAVY = '#1b2061';

// Dark-mode palette for the support screens.
const DARK = {
  accent: '#7EA3EA',
  muted: '#A8B4C7',
};

const STATUS_STYLES = {
  open: { label: 'Open', tint: '#e11d48', background: '#fff1f2', darkTint: '#FB7185', darkBackground: '#3B1220', icon: AlertCircle },
  in_review: { label: 'In review', tint: '#b45309', background: '#fffbeb', darkTint: '#FBBF24', darkBackground: '#3A2A0B', icon: Clock3 },
  resolved: { label: 'Resolved', tint: '#047857', background: '#ecfdf5', darkTint: '#34D399', darkBackground: '#0B2E26', icon: CheckCircle2 },
};

const FILTERS = [
  { value: 'all', label: 'All reports' },
  { value: 'open', label: 'Open' },
  { value: 'in_review', label: 'In review' },
  { value: 'resolved', label: 'Resolved' },
];

export default function ReportedIssuesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { handleScroll } = useTabBarVisibility();
  const { isDark } = useAppearance();

  // Status colors: lighter tint on a dark tile when in dark mode.
  const tone = (style) =>
    isDark ? { tint: style.darkTint, background: style.darkBackground } : style;

  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [reloadKey, setReloadKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoading(true);
      setError('');
      getIssueReports()
        .then((value) => {
          if (!cancelled) setIssues(Array.isArray(value) ? value : []);
        })
        .catch(() => {
          if (!cancelled) setError('We could not load the reports. Check your connection and try again.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => { cancelled = true; };
    }, [reloadKey]),
  );

  const counts = useMemo(() => issues.reduce((acc, item) => {
    const status = STATUS_STYLES[item.status] ? item.status : 'open';
    acc.all += 1;
    acc[status] += 1;
    return acc;
  }, { all: 0, open: 0, in_review: 0, resolved: 0 }), [issues]);

  const visibleIssues = useMemo(
    () => filter === 'all' ? issues : issues.filter((item) => item.status === filter),
    [filter, issues],
  );

  return (
    <View className="flex-1 bg-[#f4f6fb] dark:bg-[#0B1220]">
      <StatusBar style="light" backgroundColor={NAVY} translucent={false} />
      <SafeAreaView edges={['top']} className="bg-[#1b2061]">
        <View className="px-5 pb-7 pt-2">
          <View className="mb-5 flex-row items-center">
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() => navigation.goBack()}
              className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-white/15"
            >
              <ChevronLeft size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <View className="flex-1">
              <Text className="text-[11px] font-bold uppercase tracking-[2px] text-white/65">Support center</Text>
              <Text className="mt-0.5 text-[25px] font-extrabold text-white">Reported issues</Text>
            </View>
            <View className="h-11 min-w-[44px] items-center justify-center rounded-2xl bg-white/15 px-3">
              <Text className="text-lg font-extrabold text-white">{counts.all}</Text>
            </View>
          </View>
          <Text className="text-sm leading-5 text-white/75">Review reports and follow their progress.</Text>
        </View>
      </SafeAreaView>

      <ScrollView
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 20, paddingBottom: insets.bottom + 28 }}
      >
        <View className="mb-5 flex-row">
          {[
            { key: 'open', label: 'Open', icon: AlertCircle, color: '#e11d48', dark: '#FB7185' },
            { key: 'in_review', label: 'In review', icon: Clock3, color: '#b45309', dark: '#FBBF24' },
            { key: 'resolved', label: 'Resolved', icon: CheckCircle2, color: '#047857', dark: '#34D399' },
          ].map((stat) => {
            const Icon = stat.icon;
            const statColor = isDark ? stat.dark : stat.color;
            return (
              <View key={stat.key} className="mr-2 flex-1 rounded-2xl border border-slate-100 bg-white dark:border-[#263750] dark:bg-[#162238] p-3.5 shadow-sm">
                <View className="mb-2 h-8 w-8 items-center justify-center rounded-xl" style={{ backgroundColor: `${statColor}${isDark ? '26' : '14'}` }}>
                  <Icon size={17} color={statColor} />
                </View>
                <Text className="text-xl font-extrabold text-[#17213d] dark:text-[#F8FAFC]">{counts[stat.key]}</Text>
                <Text className="mt-0.5 text-[11px] font-medium text-slate-500 dark:text-[#A8B4C7]">{stat.label}</Text>
              </View>
            );
          })}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4" contentContainerStyle={{ paddingRight: 8 }}>
          {FILTERS.map((item) => {
            const selected = filter === item.value;
            return (
              <TouchableOpacity
                key={item.value}
                onPress={() => setFilter(item.value)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                className={`mr-2 flex-row items-center rounded-full border px-4 py-2.5 ${selected ? 'border-[#1b2061] bg-[#1b2061] dark:border-[#4F7FD9] dark:bg-[#4F7FD9]' : 'border-slate-200 bg-white dark:border-[#263750] dark:bg-[#111B2E]'}`}
              >
                <Text className={`text-xs font-bold ${selected ? 'text-white' : 'text-slate-600 dark:text-[#A8B4C7]'}`}>{item.label}</Text>
                <Text className={`ml-2 text-[10px] font-bold ${selected ? 'text-white/75' : 'text-slate-400 dark:text-[#A8B4C7]'}`}>{counts[item.value]}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View className="mb-3 flex-row items-center justify-between px-1">
          <Text className="text-base font-extrabold text-[#17213d] dark:text-[#F8FAFC]">Your reports</Text>
          {!loading && <Text className="text-xs font-medium text-slate-400 dark:text-[#A8B4C7]">{visibleIssues.length} shown</Text>}
        </View>

        {loading ? (
          <View className="items-center rounded-3xl border border-slate-100 bg-white dark:border-[#263750] dark:bg-[#162238] py-12">
            <ActivityIndicator size="small" color={isDark ? DARK.accent : NAVY} />
            <Text className="mt-3 text-sm text-slate-500 dark:text-[#A8B4C7]">Loading reports…</Text>
          </View>
        ) : error ? (
          <View className="items-center rounded-3xl border border-rose-100 bg-white dark:border-[#263750] dark:bg-[#162238] px-6 py-8">
            <View className="mb-3 h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 dark:bg-rose-950"><AlertCircle size={23} color={isDark ? '#FB7185' : '#e11d48'} /></View>
            <Text className="text-center text-sm font-semibold text-[#17213d] dark:text-[#F8FAFC]">Unable to load reports</Text>
            <Text className="mt-1 text-center text-xs leading-5 text-slate-500 dark:text-[#A8B4C7]">{error}</Text>
            <TouchableOpacity onPress={() => setReloadKey((key) => key + 1)} className="mt-4 flex-row items-center rounded-full bg-[#1b2061] dark:bg-[#4F7FD9] px-4 py-2.5">
              <RefreshCw size={14} color="#fff" />
              <Text className="ml-2 text-xs font-bold text-white">Try again</Text>
            </TouchableOpacity>
          </View>
        ) : visibleIssues.length === 0 ? (
          <View className="items-center rounded-3xl border border-slate-100 bg-white dark:border-[#263750] dark:bg-[#162238] px-6 py-10">
            <View className="mb-3 h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-[#111B2E]"><Inbox size={26} color={isDark ? DARK.accent : NAVY} /></View>
            <Text className="text-base font-bold text-[#17213d] dark:text-[#F8FAFC]">{issues.length ? 'No reports in this status' : 'No reports yet'}</Text>
            <Text className="mt-1 text-center text-sm leading-5 text-slate-500 dark:text-[#A8B4C7]">{issues.length ? 'Choose another filter to see more reports.' : 'Reported issues will appear here.'}</Text>
          </View>
        ) : (
          <View>
            {visibleIssues.map((issue) => {
              const status = STATUS_STYLES[issue.status] || STATUS_STYLES.open;
              const StatusIcon = status.icon;
              return (
                <TouchableOpacity
                  key={issue.id}
                  activeOpacity={0.82}
                  onPress={() => navigation.navigate('IssueDetails', { issueId: issue.id })}
                  className="mb-3 rounded-3xl border border-slate-100 bg-white dark:border-[#263750] dark:bg-[#162238] p-4 shadow-sm"
                >
                  <View className="mb-3 flex-row items-start">
                    <View className="mr-3 h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-[#111B2E]">
                      <AlertCircle size={21} color={isDark ? DARK.accent : NAVY} />
                    </View>
                    <View className="flex-1 pt-0.5">
                      <Text className="text-[15px] font-extrabold leading-5 text-[#17213d] dark:text-[#F8FAFC]" numberOfLines={2}>{issue.subject || 'Untitled report'}</Text>
                      <Text className="mt-1 text-xs text-slate-500 dark:text-[#A8B4C7]" numberOfLines={1}>{issue.category || 'General issue'}</Text>
                    </View>
                    <ChevronRight size={18} color={isDark ? DARK.muted : '#94a3b8'} />
                  </View>
                  <Text className="mb-4 text-[13px] leading-5 text-slate-600 dark:text-[#A8B4C7]" numberOfLines={3}>{issue.description || 'No description provided.'}</Text>
                  <View className="flex-row items-center justify-between border-t border-slate-100 dark:border-[#263750] pt-3">
                    <Text className="mr-2 flex-1 text-[11px] text-slate-500 dark:text-[#A8B4C7]" numberOfLines={1}>{issue.reporter_name || issue.reporter_email || 'Unknown reporter'}</Text>
                    <View className="flex-row items-center rounded-full px-2.5 py-1.5" style={{ backgroundColor: tone(status).background }}>
                      <StatusIcon size={12} color={tone(status).tint} />
                      <Text className="ml-1.5 text-[10px] font-bold" style={{ color: tone(status).tint }}>{status.label}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}