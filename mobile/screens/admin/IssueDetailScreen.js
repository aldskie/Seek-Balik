import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Mail,
  RefreshCw,
  Tag,
  UserRound,
} from 'lucide-react-native';

import { getIssueReportDetail, updateIssueReportStatus } from '../../api/api';
import { useTabBarVisibility } from '../../hooks/TabBarVisibility';
import { useAppearance } from '../../hooks/Appearance';
import { useConfirmationModal } from '../../components/ConfirmationModal';

const NAVY = '#1b2061';

// Dark-mode palette for the support screens.
const DARK = {
  accent: '#7EA3EA',
  muted: '#A8B4C7',
};

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open', tint: '#e11d48', background: '#fff1f2', darkTint: '#FB7185', darkBackground: '#3B1220', icon: AlertCircle, note: 'Needs attention' },
  { value: 'in_review', label: 'In review', tint: '#b45309', background: '#fffbeb', darkTint: '#FBBF24', darkBackground: '#3A2A0B', icon: Clock3, note: 'Being investigated' },
  { value: 'resolved', label: 'Resolved', tint: '#047857', background: '#ecfdf5', darkTint: '#34D399', darkBackground: '#0B2E26', icon: CheckCircle2, note: 'Issue addressed' },
];

const CATEGORY_LABELS = {
  bug: 'Bug',
  account: 'Account issue',
  listing: 'Lost item listing',
  other: 'Other',
};

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function InfoRow({ icon: Icon, label, value, last = false }) {
  const { isDark } = useAppearance();

  return (
    <View className={`flex-row items-center py-3.5 ${last ? '' : 'border-b border-slate-100 dark:border-[#263750]'}`}>
      <View className="mr-3 h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-[#111B2E]"><Icon size={18} color={isDark ? DARK.accent : NAVY} /></View>
      <View className="flex-1">
        <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#A8B4C7]">{label}</Text>
        <Text selectable className="mt-1 text-[13px] font-semibold leading-5 text-[#17213d] dark:text-[#F8FAFC]">{value || 'Not provided'}</Text>
      </View>
    </View>
  );
}

export default function IssueDetailScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();
  const { handleScroll } = useTabBarVisibility();
  const { isDark } = useAppearance();

  // Status colors: lighter tint on a dark tile when in dark mode.
  const tone = (style) =>
    isDark ? { tint: style.darkTint, background: style.darkBackground } : style;

  const { confirmationModal, showFeedback } = useConfirmationModal();
  const { issueId } = route.params || {};
  const [issue, setIssue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    if (!issueId) {
      setError('No issue was specified.');
      setLoading(false);
      return () => {};
    }
    getIssueReportDetail(issueId)
      .then((value) => {
        if (!cancelled) {
          setIssue(value);
          setSelectedStatus(value?.status || 'open');
        }
      })
      .catch(() => {
        if (!cancelled) setError('We could not load this report. Check your connection and try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [issueId, reloadKey]);

  const hasChanges = Boolean(issue && selectedStatus !== issue.status);
  const currentStatus = useMemo(
    () => STATUS_OPTIONS.find((option) => option.value === (selectedStatus || issue?.status)) || STATUS_OPTIONS[0],
    [issue, selectedStatus],
  );

  const handleSave = async () => {
    if (!hasChanges || isSaving) return;
    setIsSaving(true);
    try {
      const updated = await updateIssueReportStatus(issueId, selectedStatus);
      const nextIssue = updated && typeof updated === 'object' ? updated : { ...issue, status: selectedStatus };
      setIssue(nextIssue);
      setSelectedStatus(nextIssue.status || selectedStatus);
      const label = STATUS_OPTIONS.find((status) => status.value === (nextIssue.status || selectedStatus))?.label || 'updated';
      showFeedback({ title: 'Status updated', message: `Report marked as “${label}”.`, tone: 'success' });
    } catch {
      showFeedback({ title: 'Update failed', message: 'We could not update the status. Please try again.', tone: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const reportDate = formatDate(issue?.created_at || issue?.time_stamp || issue?.createdAt);
  const category = CATEGORY_LABELS[issue?.category] || issue?.category || 'Other';
  const StatusIcon = currentStatus.icon;

  return (
    <View className="flex-1 bg-[#f4f6fb] dark:bg-[#0B1220]">
      <StatusBar style="light" backgroundColor={NAVY} translucent={false} />
      <SafeAreaView edges={['top']} className="bg-[#1b2061]">
        <View className="flex-row items-center px-5 pb-6 pt-2">
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Go back to reported issues"
            onPress={() => navigation.goBack()}
            className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-white/15"
          >
            <ChevronLeft size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-[11px] font-bold uppercase tracking-[2px] text-white/65">Support center</Text>
            <Text className="mt-0.5 text-[23px] font-extrabold text-white">Issue details</Text>
          </View>
          {issue?.id != null && <Text className="rounded-full bg-white/15 px-3 py-2 text-[11px] font-bold text-white">#{issue.id}</Text>}
        </View>
      </SafeAreaView>

      <ScrollView
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 20, paddingBottom: insets.bottom + 32 }}
      >
        {loading ? (
          <View className="items-center rounded-3xl border border-slate-100 bg-white dark:border-[#263750] dark:bg-[#162238] py-12">
            <ActivityIndicator size="small" color={isDark ? DARK.accent : NAVY} />
            <Text className="mt-3 text-sm text-slate-500 dark:text-[#A8B4C7]">Loading report…</Text>
          </View>
        ) : error ? (
          <View className="items-center rounded-3xl border border-rose-100 bg-white dark:border-[#263750] dark:bg-[#162238] px-6 py-9">
            <View className="mb-3 h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 dark:bg-rose-950"><AlertCircle size={23} color={isDark ? '#FB7185' : '#e11d48'} /></View>
            <Text className="text-center text-base font-bold text-[#17213d] dark:text-[#F8FAFC]">Report unavailable</Text>
            <Text className="mt-1 text-center text-sm leading-5 text-slate-500 dark:text-[#A8B4C7]">{error}</Text>
            <TouchableOpacity onPress={() => setReloadKey((key) => key + 1)} className="mt-4 rounded-full bg-[#1b2061] dark:bg-[#4F7FD9] px-5 py-3">
              <Text className="text-xs font-bold text-white">Try again</Text>
            </TouchableOpacity>
          </View>
        ) : issue ? (
          <>
            <View className="mb-4 overflow-hidden rounded-3xl border border-slate-100 bg-white dark:border-[#263750] dark:bg-[#162238]">
              <View className="h-1.5" style={{ backgroundColor: tone(currentStatus).tint }} />
              <View className="p-5">
                <View className="mb-4 flex-row items-center justify-between">
                  <View className="rounded-full px-3 py-1.5" style={{ backgroundColor: tone(currentStatus).background }}>
                    <View className="flex-row items-center">
                      <StatusIcon size={13} color={tone(currentStatus).tint} />
                      <Text className="ml-1.5 text-[11px] font-extrabold" style={{ color: tone(currentStatus).tint }}>{currentStatus.label}</Text>
                    </View>
                  </View>
                  <View className="flex-row items-center">
                    <Tag size={13} color={isDark ? DARK.muted : '#64748b'} />
                    <Text className="ml-1.5 text-xs font-semibold text-slate-500 dark:text-[#A8B4C7]">{category}</Text>
                  </View>
                </View>
                <Text className="text-xl font-extrabold leading-7 text-[#17213d] dark:text-[#F8FAFC]">{issue.subject || 'Untitled report'}</Text>
                {reportDate ? (
                  <View className="mt-3 flex-row items-center">
                    <CalendarDays size={14} color={isDark ? DARK.muted : '#94a3b8'} />
                    <Text className="ml-1.5 text-xs text-slate-400 dark:text-[#A8B4C7]">Submitted {reportDate}</Text>
                  </View>
                ) : null}
                <View className="my-4 h-px bg-slate-100 dark:bg-[#263750]" />
                <Text className="mb-2 text-[10px] font-extrabold uppercase tracking-[1.5px] text-slate-400 dark:text-[#A8B4C7]">Description</Text>
                <Text selectable className="text-[14px] leading-[23px] text-slate-700 dark:text-[#A8B4C7]">{issue.description || 'No description was provided.'}</Text>
              </View>
            </View>

            <View className="mb-4 rounded-3xl border border-slate-100 bg-white dark:border-[#263750] dark:bg-[#162238] px-4">
              <Text className="pt-4 text-[10px] font-extrabold uppercase tracking-[1.5px] text-slate-400 dark:text-[#A8B4C7]">Reporter information</Text>
              <InfoRow icon={UserRound} label="Name" value={issue.reporter_name || 'Unknown reporter'} />
              <InfoRow icon={Mail} label="Email address" value={issue.reporter_email} last />
            </View>

            <View className="mb-4 rounded-3xl border border-slate-100 bg-white dark:border-[#263750] dark:bg-[#162238] p-4">
              <View className="mb-3">
                <Text className="text-base font-extrabold text-[#17213d] dark:text-[#F8FAFC]">Update status</Text>
                <Text className="mt-1 text-xs leading-5 text-slate-500 dark:text-[#A8B4C7]">Choose the current progress for this report.</Text>
              </View>
              {STATUS_OPTIONS.map((option) => {
                const selected = selectedStatus === option.value;
                const Icon = option.icon;
                return (
                  <TouchableOpacity
                    key={option.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => setSelectedStatus(option.value)}
                    className={`mb-2 flex-row items-center rounded-2xl border p-3.5 ${selected ? 'border-[#1b2061] bg-indigo-50/70 dark:border-[#4F7FD9] dark:bg-[#111B2E]' : 'border-slate-100 bg-white dark:border-[#263750] dark:bg-[#111B2E]'}`}
                  >
                    <View className="mr-3 h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: tone(option).background }}>
                      <Icon size={19} color={tone(option).tint} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-[#17213d] dark:text-[#F8FAFC]">{option.label}</Text>
                      <Text className="mt-0.5 text-[11px] text-slate-500 dark:text-[#A8B4C7]">{option.note}</Text>
                    </View>
                    <View className={`h-5 w-5 items-center justify-center rounded-full border ${selected ? 'border-[#1b2061] bg-[#1b2061] dark:border-[#4F7FD9] dark:bg-[#4F7FD9]' : 'border-slate-300 bg-white dark:border-[#263750] dark:bg-[#111B2E]'}`}>
                      {selected && <Check size={12} color="#FFFFFF" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                onPress={handleSave}
                disabled={!hasChanges || isSaving}
                activeOpacity={0.85}
                className={`mt-2 h-[50px] flex-row items-center justify-center rounded-2xl ${hasChanges && !isSaving ? 'bg-[#1b2061] dark:bg-[#4F7FD9]' : 'bg-slate-300 dark:bg-[#263750]'}`}
              >
                {isSaving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <>
                  {hasChanges ? <Check size={17} color="#FFFFFF" /> : <RefreshCw size={16} color="#FFFFFF" />}
                  <Text className="ml-2 text-sm font-extrabold text-white">{hasChanges ? 'Save status' : 'Status up to date'}</Text>
                </>}
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </ScrollView>
      {confirmationModal}
    </View>
  );
}