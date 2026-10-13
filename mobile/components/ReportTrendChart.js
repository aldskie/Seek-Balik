import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, {
  Circle,
  Line,
  Polyline,
  Text as SvgText,
} from 'react-native-svg';

import { useAppearance } from '../hooks/Appearance';

// SVG colors are props, not classes, so each mode gets its own set.
const CHART_COLORS = {
  light: {
    axis: '#E2E8F0',
    line: '#1B2061',
    pointFill: '#FFFFFF',
    count: '#1B2061',
    label: '#64748B',
  },
  dark: {
    axis: '#334155',
    line: '#A5B4FC',
    pointFill: '#0F172A',
    count: '#C7D2FE',
    label: '#94A3B8',
  },
};

// The three ranges the chart can show.
//   weekly  -> last 7 days, one point per day
//   monthly -> last 30 days, one point per day
//   yearly  -> last 12 months, one point per month
const RANGES = [
  { key: 'weekly', label: 'Weekly', subtitle: 'Reports submitted in the last seven days' },
  { key: 'monthly', label: 'Monthly', subtitle: 'Reports submitted in the last 30 days' },
  { key: 'yearly', label: 'Yearly', subtitle: 'Reports submitted in the last 12 months' },
];

const MONTHLY_DAYS = 30;
// In the 30-day view only every 7th day gets a label under the axis, so they don't overlap.
const MONTHLY_LABEL_EVERY = 7;

const getLocalDateKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

// One empty bucket per day, ending today.
const buildDayBuckets = (dayCount, makeLabel) => {
  const today = new Date();

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (dayCount - 1 - index));

    return {
      key: getLocalDateKey(date),
      label: makeLabel(date, index),
      count: 0,
    };
  });
};

// One empty bucket per month, ending with the current month.
const buildMonthBuckets = (monthCount) => {
  const today = new Date();

  return Array.from({ length: monthCount }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() - (monthCount - 1 - index), 1);

    return {
      key: getLocalDateKey(date).slice(0, 7), // "YYYY-MM"
      label: date.toLocaleDateString('en-US', { month: 'short' }),
      count: 0,
    };
  });
};

export default function ReportTrendChart({ items = [] }) {
  const { isDark } = useAppearance();
  const colors = isDark ? CHART_COLORS.dark : CHART_COLORS.light;

  const [range, setRange] = useState('weekly');
  const activeRange = RANGES.find((option) => option.key === range) || RANGES[0];

  const trendData = useMemo(() => {
    let buckets;
    // How many characters of time_stamp identify a bucket: "YYYY-MM-DD" or "YYYY-MM".
    let keyLength = 10;

    if (range === 'yearly') {
      buckets = buildMonthBuckets(12);
      keyLength = 7;
    } else if (range === 'monthly') {
      buckets = buildDayBuckets(MONTHLY_DAYS, (date, index) =>
        (MONTHLY_DAYS - 1 - index) % MONTHLY_LABEL_EVERY === 0
          ? `${date.getMonth() + 1}/${date.getDate()}`
          : ''
      );
    } else {
      buckets = buildDayBuckets(7, (date) =>
        date.toLocaleDateString('en-US', { weekday: 'short' })
      );
    }

    const counts = items.reduce((result, item) => {
      const bucketKey = item.time_stamp?.slice(0, keyLength);
      if (bucketKey) {
        result[bucketKey] = (result[bucketKey] || 0) + 1;
      }

      return result;
    }, {});

    return buckets.map((bucket) => ({
      ...bucket,
      count: counts[bucket.key] || 0,
    }));
  }, [items, range]);

  const chartWidth = 300;
  const chartHeight = 132;
  const padding = { top: 28, right: 16, bottom: 28, left: 16 };
  const maxCount = Math.max(...trendData.map((point) => point.count), 1);
  const usableWidth = chartWidth - padding.left - padding.right;
  const usableHeight = chartHeight - padding.top - padding.bottom;

  // The 30-day view has many points, so it uses a thinner line, smaller dots,
  // and smaller numbers so neighbouring days don't overlap.
  const dense = trendData.length > 12;

  const points = trendData.map((point, index) => ({
    ...point,
    x: padding.left + (index * usableWidth) / (trendData.length - 1),
    y:
      padding.top +
      usableHeight -
      (point.count / maxCount) * usableHeight,
    // Every day with at least one report shows its number, in every range.
    showCount: point.count > 0,
  }));

  const totalReports = trendData.reduce(
    (total, point) => total + point.count,
    0
  );

  return (
    <View className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      {/* Weekly / Monthly / Yearly filter */}
      <View className="mb-3 flex-row overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700">
        {RANGES.map((option) => {
          const selected = option.key === range;

          return (
            <TouchableOpacity
              key={option.key}
              activeOpacity={0.6}
              onPress={() => setRange(option.key)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={`flex-1 items-center justify-center px-1 py-2 ${
                selected ? 'bg-[#1b2061] dark:bg-indigo-600' : 'bg-white dark:bg-slate-900'
              }`}
            >
              <Text
                className={`text-center text-xs font-bold ${
                  selected ? 'text-white' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View className="mb-3 flex-row items-start justify-between">
        <View className="flex-1 pr-2">
          <Text className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            {activeRange.subtitle}
          </Text>
        </View>

        <View className="rounded-full bg-[#EEF1F7] px-2.5 py-1 dark:bg-slate-800">
          <Text className="text-[10px] font-bold text-[#1B2061] dark:text-indigo-200">
            {totalReports} {totalReports === 1 ? 'report' : 'reports'}
          </Text>
        </View>
      </View>

      <Svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
        <Line
          x1={padding.left}
          y1={padding.top + usableHeight}
          x2={chartWidth - padding.right}
          y2={padding.top + usableHeight}
          stroke={colors.axis}
          strokeWidth="1"
        />

        <Polyline
          points={points.map((point) => `${point.x},${point.y}`).join(' ')}
          fill="none"
          stroke={colors.line}
          strokeWidth={dense ? '2' : '3'}
        />

        {points.map((point) => (
          <React.Fragment key={point.key}>
            <Circle
              cx={point.x}
              cy={point.y}
              r={dense ? '2.5' : '4'}
              fill={colors.pointFill}
              stroke={colors.line}
              strokeWidth={dense ? '1.5' : '2.5'}
            />

            {point.showCount && (
              <SvgText
                x={point.x}
                y={point.y - (dense ? 6 : 10)}
                fontSize={dense ? '8' : '11'}
                fontWeight="700"
                fill={colors.count}
                textAnchor="middle"
              >
                {point.count}
              </SvgText>
            )}

            {point.label ? (
              <SvgText
                x={point.x}
                y={chartHeight - 7}
                fontSize="10"
                fill={colors.label}
                textAnchor="middle"
              >
                {point.label}
              </SvgText>
            ) : null}
          </React.Fragment>
        ))}
      </Svg>
    </View>
  );
}