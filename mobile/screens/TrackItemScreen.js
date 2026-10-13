import React, { useEffect, useRef, useState, useCallback} from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Keyboard,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Search,
  X,
  AlertTriangle,
  Info,
  CheckCircle2,
  MapPin,
  Package,
  FileMinus,
  Tag,
  Clock,
  Calendar,
  Archive,
} from 'lucide-react-native';
import { StatusBar } from 'expo-status-bar';
import { trackItem } from '../api/api';
import SecurityHashGraphic from '../components/Stamp';
import LoadingModal from '../components/LoadingModal';
import { useAppearance } from '../hooks/Appearance';

const NAVY = '#1b2061';
const NAVY_SOFT = '#EEF1F7';
const INK_MUTED = '#5B647A';
const WHITE = '#FFFFFF';
// Dark-mode replacements for colors that are passed as props or inline styles.
const INDIGO = '#4F46E5';
const MUTED_ON_DARK = '#94A3B8';

const TONE = {
  danger: { fg: '#B3261E', bg: '#F87171', Icon: AlertTriangle },
  warning: { fg: '#8A5A00', bg: '#FBBF24', Icon: AlertTriangle },
  success: { fg: '#1E6E3C', bg: '#34D399', Icon: CheckCircle2 },
  info: { fg: NAVY, bg: NAVY_SOFT, Icon: Info },
  claimed: { fg: '#581C87', bg: '#C084FC', Icon: CheckCircle2 },
  archived: { fg: '#1E293B', bg: '#94A3B8', Icon: Archive },
};

// Maps an item's raw status label to a TONE key. Anything not explicitly
// listed (unexpected/legacy statuses) safely falls back to 'info' rather
// than being silently miscolored as a warning.
const STATUS_TONE_MAP = {
  Approved: 'success',
  Pending: 'warning',
  Declined: 'danger',
  Claimed: 'claimed',
  Archived: 'archived',
};

// "claimed" / "ARCHIVED" from the backend become "Claimed" / "Archived",
// so they match the map above and the stamp.
const normalizeStatus = (value) => {
  if (typeof value !== 'string' || !value.trim()) return 'Pending';
  const text = value.trim().toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

// Shared classes for the small labels and values on the ticket.
const META_LABEL = 'text-[11px] font-bold uppercase text-slate-400';
const META_VALUE = 'text-xs font-bold text-[#1b2061] dark:text-indigo-200';
const STEP_BADGE = 'h-6 w-6 items-center justify-center rounded-full bg-white dark:bg-slate-800';
const STEP_NUMBER = 'text-[11px] font-bold text-[#1b2061] dark:text-indigo-200';
const STEP_TEXT = 'ml-3 flex-1 text-xs leading-5 text-[#4A5873] dark:text-slate-400';
const STEP_STRONG = 'font-bold text-[#1b2061] dark:text-indigo-200';

// Converts a 24-hour time such as "14:30" or "14:30:00" to "2:30 PM".
// Other shapes pass through unchanged and empty values return null.
const formatTimeLabel = (value) => {
  if (!value || typeof value !== 'string') return null;

  const match = value.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)/);
  if (!match) return value;

  const period = Number(match[1]) >= 12 ? 'PM' : 'AM';
  const hour12 = Number(match[1]) % 12 || 12;

  return `${hour12}:${match[2]} ${period}`;
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Turns the backend's "2026-10-07" into "Oct 07, 2026" for the Date Logged
// value. The parts are read straight from the text, so the day never shifts
// with the phone's time zone. Anything in another shape is shown as it is.
const formatDateLabel = (value) => {
  if (!value || typeof value !== 'string') return value || null;

  const match = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return value;

  const month = MONTH_LABELS[Number(match[2]) - 1];
  if (!month) return value;

  return `${month} ${match[3].padStart(2, '0')}, ${match[1]}`;
};

// When the item was lost or found. The backend stores a range: start_date /
// start_time ("From") and the optional end_date / end_time ("To"). The older
// created_* names are still read as a fallback.
// Returns the raw start values plus the labels shown on the ticket, which
// read "From – To" when the report has a range.
const getDateTimeDetails = (item) => {
  const dateFrom = item.start_date || item.created_date || item.date || null;
  const dateTo = item.end_date || item.created_date_to || null;
  const timeFrom = item.start_time || item.created_time || item.time || null;
  const timeTo = item.end_time || item.created_time_to || null;

  const timeFromLabel = formatTimeLabel(timeFrom);
  const timeToLabel = formatTimeLabel(timeTo);

  const dateLabel =
    dateFrom && dateTo && dateTo !== dateFrom
      ? `${formatDateLabel(dateFrom)} to ${formatDateLabel(dateTo)}`
      : formatDateLabel(dateFrom);

  const timeLabel =
    timeFromLabel && timeToLabel && timeToLabel !== timeFromLabel
      ? `${timeFromLabel} to ${timeToLabel}`
      : timeFromLabel || timeToLabel;

  return {
    date: dateFrom || 'N/A',
    time: timeFrom || 'N/A',
    dateLabel: dateLabel || 'N/A',
    timeLabel: timeLabel || 'N/A',
  };
};

// The reason staff gave when declining the report (ItemDetails.declined_remarks).
// The backend keeps this text even after the status moves out of "Declined",
// so it is only returned while the report is actually Declined.
const getDeclinedRemarks = (item, statusLabel) => {
  if (statusLabel !== 'Declined') return null;
  if (typeof item.declined_remarks !== 'string') return null;

  return item.declined_remarks.trim() || null;
};

export default function TrackItemScreen() {
  const insets = useSafeAreaInsets();

  // Colors passed as props or inline styles follow the app's appearance.
  const { isDark } = useAppearance();
  const mutedIcon = isDark ? MUTED_ON_DARK : INK_MUTED;

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const mountedRef = useRef(true);
  const resetTaskRef = useRef(null);

  useFocusEffect(
    useCallback(() => {
      // User returned before a pending reset ran.
      if (resetTaskRef.current != null) {
        cancelIdleCallback(resetTaskRef.current);
        resetTaskRef.current = null;
      }

      return () => {
        resetTaskRef.current = requestIdleCallback(() => {
          setQuery('');
          setTicket(null);
          setErrorMessage('');
          setLoading(false);
          resetTaskRef.current = null;
        });
      };
    }, [])
  );
  
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function handleTrack() {
    Keyboard.dismiss();
  
    const ticketCode = query.trim();

    if (!ticketCode) {
      setTicket(null);
      setErrorMessage('Enter a ticket code to track an item.');
    } else if (!loading) {
      setLoading(true);
      setTicket(null);
      setErrorMessage('');

      try {
        const response = await trackItem(ticketCode);

          if (!mountedRef.current) return;

          if (response?.found && response?.item) {
            const item = response.item;
            const statusLabel = normalizeStatus(item.status);
            // `date` / `time` hold the start values (used by the stamp);
            // `dateLabel` / `timeLabel` are what the ticket shows.
            const { date, time, dateLabel, timeLabel } = getDateTimeDetails(item);

            setTicket({
              ...item,
              code: item.ticket_code || ticketCode.toUpperCase(),
              statusLabel,
              statusTone: STATUS_TONE_MAP[statusLabel] || 'info',
              title: item.title || 'Untitled Item',
              category: item.category || 'Uncategorized',
              location: item.location || 'Not Specified',
              type: item.type || 'Claim / Lost',
              date,
              time,
              dateLabel,
              timeLabel,
              remark: item.remark || null,
              declinedRemarks: getDeclinedRemarks(item, statusLabel),
            });
          } else {
            setErrorMessage('No record was found for this ticket code.');
          }
      } catch (error) {
        console.error('Error tracking item:', error);
        setErrorMessage('Unable to find this ticket. Please try again.');
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    }
  }

  return (
    <View className="flex-1 bg-white dark:bg-slate-950">
      <StatusBar style="light" backgroundColor="#1b2061" translucent={false} />

      {/* Header */}
      <SafeAreaView edges={['top']} className="rounded-b-3xl bg-[#1b2061]">
        <View className="flex-row items-center justify-between px-4 pb-6 pt-2">
          <View>
            <Text className="text-[12px] font-bold tracking-widest text-white/60">
              SEEK AND BALIK
            </Text>
            <Text className="text-2xl font-bold text-white">Track Item</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        className="flex-1"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 20,
          paddingBottom: insets.bottom + 24,
        }}
      >
        {/* Search bar */}
        <View
          className="relative mb-3 flex-row items-center overflow-hidden rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900"
          style={{ height: 44 }}
        >
          <Search size={15} color={mutedIcon} />
           <TextInput
              className="ml-2 h-11 flex-1 text-sm"
              style={{ color: isDark ? '#F1F5F9' : NAVY }}
              placeholder="TKT-XXX-XXXX"
              placeholderTextColor={isDark ? '#64748B' : '#9AA3B5'}
              value={query}
              onChangeText={(value) => {
                setQuery(value);
                setTicket(null);
              }}
              autoCapitalize="characters"
              onSubmitEditing={handleTrack}
            />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setQuery('');
                setTicket(null);
                setErrorMessage('');
              }}
            >
              <X size={16} color={mutedIcon} />
            </TouchableOpacity>
          )}
        </View>

        {/* Track button */}
        <TouchableOpacity
          className="mb-6 items-center justify-center rounded-xl"
          style={{ backgroundColor: isDark ? INDIGO : NAVY, height: 48 }}
          onPress={handleTrack}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={WHITE} />
          ) : (
            <Text className="text-sm font-semibold" style={{ color: WHITE }}>
              Track
            </Text>
          )}
        </TouchableOpacity>

        {!ticket && (
          <View className="rounded-2xl border border-[#DCE6FF] bg-[#EEF3FF] p-5 dark:border-slate-800 dark:bg-slate-900">
            <View className="flex-row items-center">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-[#1b2061] dark:bg-indigo-600">
                <Info size={20} color="#FFFFFF" />
              </View>

              <View className="ml-3 flex-1">
                <Text className="text-base font-bold text-[#1b2061] dark:text-slate-100">
                  Track your item
                </Text>
                <Text className="mt-0.5 text-xs leading-5 text-[#5B647A] dark:text-slate-400">
                  Use the ticket code assigned when your lost or surrendered item was
                  reported.
                </Text>
              </View>
            </View>

            <View className="mt-5 border-t border-[#D7E2FA] pt-4 dark:border-slate-800">
              <View className="mb-4 flex-row">
                <View className={STEP_BADGE}>
                  <Text className={STEP_NUMBER}>1</Text>
                </View>
                <Text className={STEP_TEXT}>
                  Enter your code in this format:{" "}
                  <Text className={STEP_STRONG}>TKT-XXX-XXXX</Text>.
                </Text>
              </View>

              <View className="mb-4 flex-row">
                <View className={STEP_BADGE}>
                  <Text className={STEP_NUMBER}>2</Text>
                </View>
                <Text className={STEP_TEXT}>
                  Tap <Text className={STEP_STRONG}>Track</Text> to view
                  your item’s latest status and information.
                </Text>
              </View>

              <View className="flex-row">
                <View className={STEP_BADGE}>
                  <Text className={STEP_NUMBER}>3</Text>
                </View>
                <Text className={STEP_TEXT}>
                  Keep your ticket code private. It is your reference for this report.
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Real Ticket Voucher Card Layout */}
        {ticket && (
          <View className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
            {/* Ticket Header Banner */}
            <View className="flex-row items-center justify-between bg-[#1b2061] px-5 py-4">
              <View>
                <Text className="text-[10px] font-bold uppercase tracking-widest text-white/60">
                  OFFICIAL TICKET PASS
                </Text>
                <Text className="mt-0.5 text-lg font-black text-white">
                  {ticket.code}
                </Text>
              </View>

              {/* Status Badge */}
              <View
                className="flex-row items-center gap-1.5 rounded-full px-3 py-1"
                style={{ backgroundColor: TONE[ticket.statusTone].bg }}
              >
                <Text
                  className="text-xs font-extrabold uppercase tracking-wide"
                >
                  {ticket.statusLabel}
                </Text>
              </View>
            </View>

            {/* Top Section: Main Info */}
            <View className="p-5">
              <Text className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                ITEM TITLE
              </Text>
              <Text className="mt-0.5 text-xl font-bold text-[#16233F] dark:text-slate-100">
                {ticket.title}
              </Text>

              {/* Grid Metadata */}
              <View className="mt-4 flex-row flex-wrap justify-between gap-y-4">
                <View className="w-[48%]">
                  <View className="mb-1 flex-row items-center gap-1.5">
                    <Package size={13} color={mutedIcon} />
                    <Text className={META_LABEL}>
                      Category
                    </Text>
                  </View>
                  <Text className={META_VALUE} numberOfLines={1}>
                    {ticket.category}
                  </Text>
                </View>

                <View className="w-[48%]">
                  <View className="mb-1 flex-row items-center gap-1.5">
                    <MapPin size={13} color={mutedIcon} />
                    <Text className={META_LABEL}>
                      Location
                    </Text>
                  </View>
                  <Text className={META_VALUE} numberOfLines={1}>
                    {ticket.location}
                  </Text>
                </View>

                <View className="w-[48%]">
                  <View className="mb-1 flex-row items-center gap-1.5">
                    <Tag size={13} color={mutedIcon} />
                    <Text className={META_LABEL}>
                      Type
                    </Text>
                  </View>
                  <Text className={META_VALUE} numberOfLines={1}>
                    {ticket.type}
                  </Text>
                </View>

                <View className="w-[48%]">
                  <View className="mb-1 flex-row items-center gap-1.5">
                    <Calendar size={13} color={mutedIcon} />
                    <Text className={META_LABEL}>
                      Date Logged
                    </Text>
                  </View>
                  {/* Up to two lines, so a "From – To" date range is not cut off. */}
                  <Text className={META_VALUE} numberOfLines={2}>
                    {ticket.dateLabel}
                  </Text>
                </View>
              </View>
            </View>

            {/* Ticket Tear Perforated Line Divider */}
            <View className="relative my-1 flex-row items-center justify-between px-2">
              <View className="-ml-2 h-6 w-3 rounded-r-full border-y border-r border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-950" />
              <View className="mx-2 flex-1 border-b border-dashed border-slate-300 dark:border-slate-700" />
              <View className="-mr-2 h-6 w-3 rounded-l-full border-y border-l border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-950" />
            </View>

            {/* Bottom Stub Section */}
            <View className="px-5 pb-5 pt-2">
              <View className="mb-3 flex-row items-center justify-between">
                <View className="flex-row items-center gap-1.5">
                  <Clock size={13} color={mutedIcon} />
                  <Text className={META_LABEL}>
                    Time Recorded:
                  </Text>
                </View>
                <Text className="text-xs font-extrabold text-[#1b2061] dark:text-indigo-200">
                  {ticket.timeLabel}
                </Text>
              </View>

              {/* Decline Remarks Box - only on Declined reports that have a reason */}
              {ticket.declinedRemarks && (
                <View className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950">
                  <View className="mb-1 flex-row items-center gap-1.5">
                    <FileMinus size={13} color={isDark ? '#FB7185' : '#B3261E'} />
                    <Text className="text-[10px] font-extrabold uppercase tracking-wider text-[#B3261E] dark:text-rose-400">
                      DECLINE REMARKS
                    </Text>
                  </View>
                  <Text className="text-xs font-medium leading-5 text-[#7A1C16] dark:text-rose-200">
                    {ticket.declinedRemarks}
                  </Text>
                </View>
              )}

              {/* Admin Remark Box */}
              {ticket.remark && (() => {
                const remarkTone = TONE[ticket.remark.tone] || TONE.info;
                return (
                  <View
                    className="mb-4 rounded-xl p-3"
                    style={{ backgroundColor: remarkTone.bg }}
                  >
                    <Text
                      className="mb-1 text-[10px] font-extrabold uppercase tracking-wider"
                      style={{ color: remarkTone.fg }}
                    >
                      ADMIN REMARK
                    </Text>
                    <View className="flex-row items-start gap-2">
                      {React.createElement(remarkTone.Icon, {
                        size: 14,
                        color: remarkTone.fg,
                        style: { marginTop: 2 },
                      })}
                      <Text
                        className="flex-1 text-xs font-medium leading-4"
                        style={{ color: remarkTone.fg }}
                      >
                        {ticket.remark.text}
                      </Text>
                    </View>
                  </View>
                );
              })()}

              {/* Inside TrackItemScreen.js ticket render block */}
                <SecurityHashGraphic
                  code={ticket.code}
                  status={ticket.statusLabel}
                  date={ticket.date}
                  time={ticket.time}
                />
            </View>
          </View>
        )}
      </ScrollView>
      {Boolean(errorMessage) && (
        <Pressable
          className="absolute inset-0 items-center justify-center bg-black/40 px-6 dark:bg-black/60"
          onPress={() => setErrorMessage('')}
        >
          <Pressable
            className="w-full rounded-2xl bg-white p-6 dark:bg-slate-900"
            onPress={() => undefined}
          >
            <View className="items-center">
              <View className="h-12 w-12 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950">
                <AlertTriangle size={24} color={isDark ? '#FB7185' : '#B3261E'} />
              </View>
              <Text className="mt-4 text-lg font-bold text-[#16233F] dark:text-slate-100">
                Unable to Track Item
              </Text>
              <Text className="mt-2 text-center text-sm leading-5 text-slate-600 dark:text-slate-400">
                {errorMessage}
              </Text>
            </View>

            <TouchableOpacity
              className="mt-6 items-center rounded-xl bg-[#1b2061] py-3.5 dark:bg-indigo-600"
              onPress={() => setErrorMessage('')}
            >
              <Text className="text-xs font-bold text-white">OKAY</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      )}

      {/* Tracking Loading Overlay */}
      <LoadingModal
        visible={loading}
        title="Tracking your item..."
        subtitle="Please wait while we look up your ticket."
      />
    </View>
  );
}