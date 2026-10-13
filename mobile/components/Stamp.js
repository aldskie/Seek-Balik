import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { ShieldCheck, ShieldAlert, Clock, BadgeCheck, Archive } from 'lucide-react-native';

import { useAppearance } from '../hooks/Appearance';

// Helper function to generate a deterministic pseudo-hash based on input parameters
function generateHash(code, date, time) {
  const seed = `${code}-${date}-${time}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `${hex.slice(0, 4)}${code?.slice(-2) || 'XX'}...${hex.slice(4)}`;
}

// Hex fallbacks for icon `color` — react-native-svg based icons don't
// reliably pick up Tailwind/NativeWind `className` color utilities, so we
// mirror each status's text color here and pass it via the `color` prop.
// `light` matches the -800 text color, `dark` matches the -300 one.
const ICON_COLOR_HEX = {
  Approved: { light: '#065F46', dark: '#6EE7B7' },
  Pending: { light: '#9A3412', dark: '#FDBA74' },
  Declined: { light: '#991B1B', dark: '#FCA5A5' },
  Claimed: { light: '#6B21A8', dark: '#D8B4FE' },
  // Slate uses -700 in light mode; slate-800 on slate-50 reads as plain black.
  Archived: { light: '#334155', dark: '#CBD5E1' },
};

const STAMP_CONFIG = {
  Approved: {
    label: 'VERIFIED • OFFICIAL PASS',
    color: 'emerald',
    badgeBg: 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800',
    dotBg: 'bg-emerald-500',
    textColor: 'text-emerald-800 dark:text-emerald-300',
    Icon: ShieldCheck,
  },
  Pending: {
    label: 'PROCESSING • PENDING REVIEW',
    color: 'orange',
    badgeBg: 'bg-orange-50 border-orange-200 dark:bg-orange-950 dark:border-orange-800',
    dotBg: 'bg-orange-500',
    textColor: 'text-orange-800 dark:text-orange-300',
    // Lucide has no "ShieldClock" icon — using Clock instead so the
    // component doesn't render an undefined type and crash.
    Icon: Clock,
  },
  Declined: {
    label: 'FLAGGED • INVALID PASS',
    color: 'red',
    badgeBg: 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800',
    dotBg: 'bg-red-500',
    textColor: 'text-red-800 dark:text-red-300',
    Icon: ShieldAlert,
  },
  Claimed: {
    label: 'CLAIMED • ITEM RELEASED',
    color: 'purple',
    badgeBg: 'bg-purple-50 border-purple-200 dark:bg-purple-950 dark:border-purple-800',
    dotBg: 'bg-purple-500',
    textColor: 'text-purple-800 dark:text-purple-300',
    Icon: BadgeCheck,
  },
  Archived: {
    label: 'ARCHIVED • RECORD CLOSED',
    color: 'slate',
    badgeBg: 'bg-slate-50 border-slate-200 dark:bg-slate-900 dark:border-slate-700',
    dotBg: 'bg-slate-500',
    textColor: 'text-slate-700 dark:text-slate-300',
    Icon: Archive,
  },
};

// The backend may send "claimed" or "ARCHIVED"; match the keys above
// ("Claimed", "Archived") so the right stamp is used either way.
const normalizeStatus = (value) => {
  if (typeof value !== 'string' || !value.trim()) return 'Pending';
  const text = value.trim().toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export default function SecurityHashGraphic({
  code,
  status = 'Approved',
  date = '',
  time = '',
}) {
  const { isDark } = useAppearance();

  const statusKey = normalizeStatus(status);
  const config = STAMP_CONFIG[statusKey] || STAMP_CONFIG.Pending;
  const iconColors = ICON_COLOR_HEX[statusKey] || ICON_COLOR_HEX.Pending;
  const iconColor = isDark ? iconColors.dark : iconColors.light;

  // Memoize hash calculation so it doesn't recalculate on every re-render
  const hash = useMemo(() => generateHash(code, date, time), [code, date, time]);

  return (
    <View className="w-full items-center py-2">
      {/* Dynamic Badge. Centered as a whole, and its text is centered too,
          so a label that wraps onto a second line on narrow phones stays in
          the middle instead of hugging the left edge. */}
      <View
        className={`max-w-full flex-row items-center justify-center self-center rounded-lg border px-3 py-1.5 ${config.badgeBg}`}
      >
        <View className="mr-1.5">
          <config.Icon size={12} color={iconColor} />
        </View>
        <Text
          className={`shrink text-center font-mono text-[11px] font-bold tracking-wider ${config.textColor}`}
        >
          {code || 'TKT-000-000'} • {config.label}
        </Text>
      </View>
    </View>
  );
}