import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { cssInterop } from 'nativewind';
import {
  BarChart3,
  PieChart,
  Calendar,
  Download,
  Filter,
  Award,
  AlertTriangle,
  CheckCircle2,
  MapPin,
} from 'lucide-react-native';
import { useTabBarVisibility } from '../../hooks/TabBarVisibility';

cssInterop(LinearGradient, { className: 'style' });

// Fakes an inset shadow inside an input: a soft dark-to-transparent
// gradient hugging the top edge, clipped by the input's own rounded corners.
const INSET_SHADOW_COLORS = ['rgba(15,23,42,0.14)', 'rgba(15,23,42,0)'];

const TIMEFRAMES = ['This Week', 'This Month', 'Quarterly', 'Custom'];

// Swap for a real API response — keyed by the active timeframe pill.
const METRICS_BY_TIMEFRAME = {
  'This Week': {
    lostItems: 50,
    recoveryRate: 26,
    foundItems: 3,
    topHotspot: 'Canteen',
  },
  'This Month': {
    lostItems: 182,
    recoveryRate: 33,
    foundItems: 60,
    topHotspot: 'Canteen',
  },
  Quarterly: {
    lostItems: 511,
    recoveryRate: 41,
    foundItems: 209,
    topHotspot: 'Library',
  },
  Custom: { lostItems: 0, recoveryRate: 0, foundItems: 0, topHotspot: '—' },
};

// Item Categories breakdown (Personal, Electronics, Keys, ID, Valuables).
const CATEGORY_BREAKDOWN = [
  { label: 'Personal', percent: 59 },
  { label: 'Electronics', percent: 25 },
  { label: 'Keys', percent: 7 },
  { label: 'ID', percent: 5 },
  { label: 'Valuables', percent: 3 },
];

const LOCATION_HOTSPOTS = [
  { name: 'Canteen', count: 16 },
  { name: 'Library', count: 10 },
  { name: 'Gymnasium', count: 8 },
  { name: 'Main Lobby', count: 6 },
  { name: 'Parking Lot', count: 5 },
  { name: 'Auditorium', count: 5 },
];

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const { handleScroll } = useTabBarVisibility();

  const [timeframe, setTimeframe] = useState('This Week');
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [exportFormat, setExportFormat] = useState('pdf'); // 'pdf' | 'csv'

  const metrics = useMemo(
    () => METRICS_BY_TIMEFRAME[timeframe] ?? METRICS_BY_TIMEFRAME['This Week'],
    [timeframe]
  );

  const openStartDatePicker = () => {
    // Wire up to a native/community date picker and call setStartDate(value).
  };

  const openEndDatePicker = () => {
    // Wire up to a native/community date picker and call setEndDate(value).
  };

  const handleQuickExport = () => {
    console.log('Quick export PDF for timeframe:', timeframe);
  };

  const handleGenerateReport = () => {
    const payload = { timeframe, startDate, endDate, exportFormat };
    console.log('Generating full report:', payload);
  };

  const summaryCards = [
    {
      key: 'recovery',
      label: 'Recovery Rate',
      value: `${metrics.recoveryRate}%`,
      icon: Award,
      iconColor: '#7c3aed',
    },
    {
      key: 'lost',
      label: 'Lost Items',
      value: metrics.lostItems,
      icon: AlertTriangle,
      iconColor: '#e11d48',
    },
    {
      key: 'found',
      label: 'Found Items',
      value: metrics.foundItems,
      icon: CheckCircle2,
      iconColor: '#059669',
    },
    {
      key: 'hotspot',
      label: 'Top Hotspot',
      value: metrics.topHotspot,
      icon: MapPin,
      iconColor: '#D97706',
    },
  ];

  return (
    <View className="flex-1 bg-white">
      <StatusBar style="light" backgroundColor="#1b2061" translucent={false} />

      <SafeAreaView edges={['top']} className="rounded-b-3xl bg-[#1b2061]">
        <View className="flex-row items-center justify-between px-4 pb-6 pt-2">
          <View>
            <Text className="text-[12px] font-bold tracking-widest text-white/60">ANALYTICS</Text>
            <Text className="text-2xl font-bold text-white">Reports Overview</Text>
          </View>
          <TouchableOpacity
            className="flex-row items-center rounded-full bg-white/10 px-3 py-1.5"
            onPress={handleQuickExport}
          >
            <Download size={14} color="#FFFFFF" />
            <Text className="ml-1.5 text-xs font-semibold text-white">Export PDF</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView
        className="flex-1"
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 20,
          paddingBottom: insets.bottom + 100,
        }}
      >
        {/* Timeframe filter tabs */}
        <View className="mb-4 h-10 flex-row rounded-xl bg-slate-100 p-1">
          {TIMEFRAMES.map((t) => {
            const active = timeframe === t;
            return (
              <TouchableOpacity
                key={t}
                onPress={() => setTimeframe(t)}
                className={`flex-1 items-center justify-center rounded-lg ${
                  active ? 'bg-white shadow-sm' : 'bg-transparent'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${active ? 'text-[#1b2061]' : 'text-slate-500'}`}
                >
                  {t}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Summary metrics grid (2x2) */}
        <View className="mb-4 flex-row gap-3">
          {summaryCards.slice(0, 2).map(({ key, label, value, icon: Icon, iconColor }) => (
            <View key={key} className="flex-1 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <Icon size={18} color={iconColor} />
              <Text className="mt-2 text-xl font-extrabold text-[#16233F]">{value}</Text>
              <Text className="mt-0.5 text-[11px] font-semibold text-slate-500">{label}</Text>
            </View>
          ))}
        </View>
        <View className="mb-4 flex-row gap-3">
          {summaryCards.slice(2, 4).map(({ key, label, value, icon: Icon, iconColor }) => (
            <View key={key} className="flex-1 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
              <Icon size={18} color={iconColor} />
              <Text className="mt-2 text-xl font-extrabold text-[#16233F]">{value}</Text>
              <Text className="mt-0.5 text-[11px] font-semibold text-slate-500">{label}</Text>
            </View>
          ))}
        </View>

        {/* Category breakdown */}
        <View className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <View className="mb-3 flex-row items-center">
            <BarChart3 size={16} color="#1b2061" />
            <Text className="ml-2 text-sm font-bold text-[#16233F]">Item categories</Text>
          </View>

          {CATEGORY_BREAKDOWN.map((c) => (
            <View key={c.label} className="mb-3 last:mb-0">
              <View className="mb-1 flex-row items-center justify-between">
                <Text className="text-xs font-semibold text-slate-600">{c.label}</Text>
                <Text className="text-xs font-bold text-[#16233F]">{c.percent}%</Text>
              </View>
              <View className="h-2 w-full rounded-full bg-slate-100">
                <View
                  className="h-2 rounded-full bg-[#1b2061]"
                  style={{ width: `${c.percent}%` }}
                />
              </View>
            </View>
          ))}
        </View>

        {/* Location hotspots */}
        <View className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <View className="mb-3 flex-row items-center">
            <PieChart size={16} color="#1b2061" />
            <Text className="ml-2 text-sm font-bold text-[#16233F]">Location hotspots</Text>
          </View>

          {LOCATION_HOTSPOTS.map((loc, index) => (
            <View
              key={loc.name}
              className="flex-row items-center justify-between border-b border-slate-100 py-2.5 last:border-b-0"
            >
              <View className="flex-row items-center">
                <View className="mr-2.5 h-6 w-6 items-center justify-center rounded-full bg-[#1b2061]/10">
                  <Text className="text-[11px] font-bold text-[#1b2061]">{index + 1}</Text>
                </View>
                <Text className="text-sm text-[#16233F]">{loc.name}</Text>
              </View>
              <Text className="text-xs font-semibold text-slate-500">{loc.count} reports</Text>
            </View>
          ))}
        </View>

        {/* Custom date filter & export options */}
        <View className="mb-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <View className="mb-3 flex-row items-center">
            <Filter size={16} color="#1b2061" />
            <Text className="ml-2 text-sm font-bold text-[#16233F]">Custom date & export</Text>
          </View>

          <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Date range
          </Text>
          <View className="mb-4 flex-row gap-3">
            <TouchableOpacity className="flex-1" onPress={openStartDatePicker} activeOpacity={0.7}>
              <View className="relative flex-row items-center overflow-hidden rounded-lg border border-slate-300 bg-white px-3">
                <Calendar size={14} color="#5B647A" />
                <Text
                  className={`ml-2 h-11 flex-1 text-sm leading-[44px] ${
                    startDate ? 'text-[#16233F]' : 'text-[#9AA3B5]'
                  }`}
                >
                  {startDate ?? 'Start date'}
                </Text>
                <LinearGradient
                  colors={INSET_SHADOW_COLORS}
                  className="absolute inset-x-0 top-0 h-1.5 opacity-40"
                  pointerEvents="none"
                />
              </View>
            </TouchableOpacity>

            <TouchableOpacity className="flex-1" onPress={openEndDatePicker} activeOpacity={0.7}>
              <View className="relative flex-row items-center overflow-hidden rounded-lg border border-slate-300 bg-white px-3">
                <Calendar size={14} color="#5B647A" />
                <Text
                  className={`ml-2 h-11 flex-1 text-sm leading-[44px] ${
                    endDate ? 'text-[#16233F]' : 'text-[#9AA3B5]'
                  }`}
                >
                  {endDate ?? 'End date'}
                </Text>
                <LinearGradient
                  colors={INSET_SHADOW_COLORS}
                  className="absolute inset-x-0 top-0 h-1.5 opacity-40"
                  pointerEvents="none"
                />
              </View>
            </TouchableOpacity>
          </View>

          <Text className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Format
          </Text>
          <View className="flex-row gap-3">
            <TouchableOpacity
              className={`flex-1 flex-row items-center justify-between rounded-lg border px-3 py-3 ${
                exportFormat === 'pdf' ? 'border-[#1b2061] bg-[#1b2061]/5' : 'border-slate-300 bg-white'
              }`}
              onPress={() => setExportFormat('pdf')}
            >
              <View>
                <Text
                  className={`text-xs font-bold ${
                    exportFormat === 'pdf' ? 'text-[#1b2061]' : 'text-[#16233F]'
                  }`}
                >
                  PDF Summary
                </Text>
                <Text className="text-[11px] text-slate-500">Formatted overview</Text>
              </View>
              {exportFormat === 'pdf' && <CheckCircle2 size={16} color="#1b2061" />}
            </TouchableOpacity>

            <TouchableOpacity
              className={`flex-1 flex-row items-center justify-between rounded-lg border px-3 py-3 ${
                exportFormat === 'csv' ? 'border-[#1b2061] bg-[#1b2061]/5' : 'border-slate-300 bg-white'
              }`}
              onPress={() => setExportFormat('csv')}
            >
              <View>
                <Text
                  className={`text-xs font-bold ${
                    exportFormat === 'csv' ? 'text-[#1b2061]' : 'text-[#16233F]'
                  }`}
                >
                  CSV Raw Data
                </Text>
                <Text className="text-[11px] text-slate-500">Spreadsheet export</Text>
              </View>
              {exportFormat === 'csv' && <CheckCircle2 size={16} color="#1b2061" />}
            </TouchableOpacity>
          </View>
        </View>

        {/* Primary action */}
        <TouchableOpacity
          className="mb-6 mt-6 h-12 items-center justify-center rounded-xl bg-[#1b2061]"
          onPress={handleGenerateReport}
        >
          <Text className="text-sm font-bold tracking-wide text-white">GENERATE FULL REPORT</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}