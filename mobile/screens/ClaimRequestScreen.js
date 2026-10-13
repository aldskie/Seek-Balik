import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Clock,
  HelpCircle,
  MapPin,
  ShieldCheck,
  Tag,
} from "lucide-react-native";

import {
  createClaim,
  getAvailableSchedules,
  getBlockedSlots,
  getCurrentUser,
} from "../api/api";
import { useTabBarVisibility } from "../hooks/TabBarVisibility";
import { useAppearance } from "../hooks/Appearance";
import { useConfirmationModal } from "../components/ConfirmationModal";

// Constants & Theme Tokens
const NAVY = "#1B2061";
const EMPTY_CLAIMANT = Object.freeze({});
// No disabled slots: { wholeDay: block | null, slots: { [time_slot]: block } }
const EMPTY_DAY_BLOCKS = Object.freeze({ wholeDay: null, slots: Object.freeze({}) });
const INPUT_CONTAINER_CLASS =
  "relative flex-row items-center overflow-hidden rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-800";

// Class strings reused across the screen, each with its light and dark colors.
const CARD = "rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900 dark:shadow-none";
const CARD_TITLE = "text-sm font-bold text-[#334155] dark:text-slate-100";
const STRONG_TEXT = "text-[#16233F] dark:text-slate-100";
const BODY_TEXT = "text-slate-500 dark:text-slate-400";
const HINT_TEXT = "text-slate-400 dark:text-slate-500";
const NAVY_TEXT = "text-[#1B2061] dark:text-indigo-200";
const DROPDOWN_BUTTON =
  "h-11 flex-row items-center justify-between rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-800";
const DROPDOWN_LIST =
  "mt-1 overflow-hidden rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800";
const DROPDOWN_ROW = "border-b border-slate-100 px-3 py-3 last:border-b-0 dark:border-slate-700";
const SOFT_TILE = "bg-[#EEF1F7] dark:bg-slate-800";
const PRIMARY_BUTTON = "bg-[#1b2061] dark:bg-indigo-600";
const SECONDARY_BUTTON =
  "border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800";
const MODAL_CARD = "bg-white dark:bg-slate-900";

// Colors for icons and spinners, which take a color value instead of a class.
function useIconColors() {
  const { isDark } = useAppearance();
  return {
    isDark,
    navy: isDark ? "#C7D2FE" : NAVY,
    muted: isDark ? "#94A3B8" : "#5B647A",
    slate: isDark ? "#94A3B8" : "#64748B",
    placeholder: isDark ? "#64748B" : "#9AA3B5",
  };
}

// How long to ignore onScroll events right after the keyboard opens/closes.
// The content's paddingBottom changing size fires a scroll event on its own,
// which otherwise fools the tab bar's scroll-direction detection into
// popping back into view while the keyboard is still up.
const KEYBOARD_SCROLL_SUPPRESS_MS = 400;
// How close (in px) the focused-input scroll target has to be to the very
// bottom of the content before we treat it as "at the bottom" and force
// the tab bar hidden — see scrollFocusedInputAboveKeyboard below.
const BOTTOM_THRESHOLD = 40;
// Breathing room under the Cancel/Submit buttons at the end of the form
// (added on top of the bottom safe-area inset).
const ACTION_BUTTONS_BOTTOM_RESERVE = 12;
// Breathing room kept around an open dropdown when it's scrolled into view.
const DROPDOWN_SCROLL_MARGIN = 16;
// Delay before measuring a freshly opened dropdown, so its list has mounted
// and any keyboard that was closing has finished resizing the layout.
const DROPDOWN_MEASURE_DELAY_MS = 150;
// Tallest an open answer-choices list can get (about 5 rows) before it
// scrolls inside itself instead of growing down the page.
const DROPDOWN_LIST_MAX_HEIGHT = 220;

// Fallback time slots shown when staff hasn't configured any
// AvailableSchedule slots for the selected date. Same list as
// ClaimModal.jsx / ClaimRequests.jsx on the web. Only used when the
// schedules request SUCCEEDS but returns nothing for that date — never
// on a fetch error, since then we genuinely don't know what's available.
const DEFAULT_TIME_OPTIONS = [
  "8:00 AM - 9:00 AM",
  "9:00 AM - 10:00 AM",
  "10:00 AM - 11:00 AM",
  "11:00 AM - 12:00 PM",
  "1:00 PM - 2:00 PM",
  "2:00 PM - 3:00 PM",
  "3:00 PM - 4:00 PM",
  "4:00 PM - 5:00 PM",
];

// Saturday is a half day: only slots inside 8:00 AM - 11:00 AM are offered.
// Values are minutes from midnight.
const SATURDAY_OPEN_MINUTES = 8 * 60;
const SATURDAY_CLOSE_MINUTES = 11 * 60;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Readable names for the fields the server may reject, used in front of its
// message (e.g. "Contact number: ...").
const FIELD_LABELS = {
  claimant_name: "Name",
  claimant_contact: "Contact number",
  claimant_email: "Email",
  proof_description: "Ownership details",
  meeting_date: "Meeting date",
  meeting_time: "Meeting time",
  meeting_location: "Meeting location",
  item: "Item",
};

// Helper Utility Functions
function parseOptions(value) {
  if (Array.isArray(value)) {
    return value.filter((option) => typeof option === "string" && option.trim());
  }
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((option) => typeof option === "string" && option.trim())
      : [];
  } catch {
    return [];
  }
}

function itemValue(item, ...keys) {
  return (
    keys
      .map((key) => item?.[key])
      .find((val) => val !== undefined && val !== null && val !== "") || ""
  );
}

// The account's contact number in the 11-digit local format the backend
// expects for a claim (09XXXXXXXXX). Accepts "+639171234567",
// "639171234567", "09171234567" or "9171234567". Returns "" when the account
// has no usable number: the contact number is optional on a claim, and a
// blank value is accepted where a partial one (like a bare "+63") is not.
function toLocalContactNumber(raw) {
  let digits = String(raw || "").replace(/\D/g, "");

  if (digits.startsWith("63")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = digits.slice(1);

  return digits.length === 10 ? `0${digits}` : "";
}

// Pulls the first readable message out of the server's error response,
// whichever field it is attached to. Rule-based refusals arrive as
// { detail: "..." }; validation errors arrive as { field: ["..."] }.
function getServerErrorMessage(data) {
  if (!data || typeof data !== "object") return "";

  if (typeof data.detail === "string") return data.detail;

  for (const [field, value] of Object.entries(data)) {
    const text = Array.isArray(value)
      ? value.find((entry) => typeof entry === "string")
      : typeof value === "string"
      ? value
      : "";

    if (text) {
      if (field === "non_field_errors") return text;
      return `${FIELD_LABELS[field] || field}: ${text}`;
    }
  }

  return "";
}

// Parses 'YYYY-MM-DD' (or an ISO string starting with one) into a local Date
// at midnight, avoiding the UTC shift `new Date("YYYY-MM-DD")` causes.
function parseDateOnly(value) {
  if (!value || typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [y, m, d] = match.slice(1).map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// Local-date 'YYYY-MM-DD' (the format the backend expects for meeting_date).
function formatDateOnly(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// e.g. "Sat, Sep 5, 2026"
function formatDisplayDate(value) {
  const date = parseDateOnly(value);
  if (!date) return value || "";
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

// True when a 'YYYY-MM-DD' date falls on a Saturday.
function isSaturdayDate(value) {
  const date = parseDateOnly(value);
  return Boolean(date) && date.getDay() === 6;
}

// Reads the clock times out of a slot label and returns them as minutes from
// midnight. Handles "8:00 AM - 9:00 AM" as well as 24-hour "08:00 - 09:00".
function parseSlotMinutes(slot) {
  if (typeof slot !== "string") return [];

  const matches = [...slot.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/gi)];

  return matches.map((match) => {
    let hours = Number(match[1]);
    const minutes = Number(match[2] || 0);
    const period = (match[3] || "").toUpperCase();

    if (period === "PM" && hours < 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;

    return hours * 60 + minutes;
  });
}

// A slot is allowed on Saturday when it starts at or after 8:00 AM and ends
// by 11:00 AM. Slots whose times can't be read are left out.
function isWithinSaturdayHours(slot) {
  const [start, end] = parseSlotMinutes(slot);
  if (start === undefined) return false;
  if (start < SATURDAY_OPEN_MINUTES) return false;

  return end === undefined
    ? start < SATURDAY_CLOSE_MINUTES
    : end <= SATURDAY_CLOSE_MINUTES;
}

// Tomorrow at local midnight.
function getTomorrow() {
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

// Earliest selectable meeting date: the day after the item was
// surrendered, and never today or in the past (at the earliest, tomorrow).
function getMinMeetingDate(createdDate) {
  const tomorrow = getTomorrow();

  const surrender = parseDateOnly(createdDate);
  if (!surrender) return tomorrow;

  surrender.setDate(surrender.getDate() + 1);
  return surrender > tomorrow ? surrender : tomorrow;
}

// The office is closed on Sundays, so they can't be picked for a meeting.
function isSunday(date) {
  return date.getDay() === 0;
}

// First date on or after the given one that isn't a Sunday.
function skipSunday(date) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (isSunday(next)) next.setDate(next.getDate() + 1);
  return next;
}

// The disabled entries (staff "Manage Slots") for one 'YYYY-MM-DD' date:
// { wholeDay: block | null, slots: { [time_slot]: block } }.
// A block with an empty time_slot disables the whole day.
function groupBlocksForDate(blocks, dateKey) {
  const result = { wholeDay: null, slots: {} };

  (Array.isArray(blocks) ? blocks : []).forEach((block) => {
    if (String(block?.date || "").slice(0, 10) !== dateKey) return;
    if (!block.time_slot) result.wholeDay = block;
    else result.slots[block.time_slot] = block;
  });

  return result;
}

// Whole-day disabled dates in a list of blocks: { 'YYYY-MM-DD': block }.
function wholeDayBlocksByDate(blocks) {
  const map = {};
  (Array.isArray(blocks) ? blocks : []).forEach((block) => {
    if (!block?.time_slot) {
      const key = String(block?.date || "").slice(0, 10);
      if (key) map[key] = block;
    }
  });
  return map;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Grid cells for a month: leading nulls for the empty weekday slots,
// then one local-midnight Date per day.
function getCalendarDays(monthDate) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  const days = [];
  for (let i = 0; i < firstDayIndex; i++) days.push(null);
  for (let d = 1; d <= totalDays; d++) days.push(new Date(year, month, d));
  return days;
}

// Sub-components
function ItemDetail({ icon: Icon, label, value }) {
  const colors = useIconColors();

  return (
    <View className="flex-1 flex-row items-center">
      <View className={`h-8 w-8 items-center justify-center rounded-lg ${SOFT_TILE}`}>
        <Icon size={15} color={colors.navy} />
      </View>
      <View className="ml-2 flex-1">
        <Text className="text-[9px] font-bold tracking-wide text-slate-400">
          {label}
        </Text>
        <Text numberOfLines={1} className="mt-0.5 text-xs font-semibold text-[#334155] dark:text-slate-200">
          {value || "Not specified"}
        </Text>
      </View>
    </View>
  );
}

function QuestionCard({
  index,
  question,
  placeholder,
  options,
  answer,
  isOpen,
  inputRef,
  dropdownRef,
  onToggleDropdown,
  onChangeAnswer,
  onFocusInput,
}) {
  const colors = useIconColors();
  const answered = answer.trim().length >= 2;

  return (
    <View className={`mt-4 ${CARD}`}>
      <View className="flex-row items-start">
        <View
          className={`h-7 w-7 items-center justify-center rounded-full ${
            answered ? "bg-emerald-500" : "bg-[#1B2061] dark:bg-indigo-600"
          }`}
        >
          {answered ? (
            <CheckCircle2 size={15} color="#FFFFFF" />
          ) : (
            <Text className="text-[11px] font-bold text-white">{index + 1}</Text>
          )}
        </View>
        <Text className="ml-2.5 flex-1 pt-0.5 text-sm font-semibold leading-5 text-[#334155] dark:text-slate-200">
          {question}
        </Text>
      </View>

      {options.length ? (
        // collapsable={false} keeps this wrapper as a real native view on
        // Android so the parent screen can measure it and scroll the open
        // list into view.
        <View ref={dropdownRef} collapsable={false} className="mt-3">
          <TouchableOpacity
            onPress={() => {
              Keyboard.dismiss();
              onToggleDropdown();
            }}
            className={`relative overflow-hidden ${DROPDOWN_BUTTON}`}
          >
            <Text
              numberOfLines={1}
              className={`flex-1 pr-2 text-sm ${
                answer ? STRONG_TEXT : HINT_TEXT
              }`}
            >
              {answer || "Select your answer"}
            </Text>
            <ChevronDown size={18} color={colors.muted} />
          </TouchableOpacity>

          {isOpen && (
            // The list is capped at DROPDOWN_LIST_MAX_HEIGHT and scrolls
            // inside itself. maxHeight lives on the ScrollView itself via
            // `style` (a wrapping View's maxHeight doesn't constrain a
            // ScrollView child), and nestedScrollEnabled lets it scroll on
            // Android while sitting inside the outer form ScrollView.
            <View className={DROPDOWN_LIST}>
              <ScrollView
                style={{ maxHeight: DROPDOWN_LIST_MAX_HEIGHT }}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {options.map((option, optionIndex) => (
                  <TouchableOpacity
                    key={`${index}-${optionIndex}-${option}`}
                    onPress={() => onChangeAnswer(option)}
                    className={DROPDOWN_ROW}
                  >
                    <Text className={`text-sm ${STRONG_TEXT}`}>{option}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      ) : (
        <View className={`${INPUT_CONTAINER_CLASS} mt-3 min-h-[72px] items-start`}>
          <TextInput
            ref={inputRef}
            value={answer}
            onChangeText={onChangeAnswer}
            onFocus={onFocusInput}
            placeholder={placeholder}
            placeholderTextColor={colors.placeholder}
            multiline
            textAlignVertical="top"
            className={`min-h-[72px] flex-1 py-3 text-sm ${STRONG_TEXT}`}
          />
        </View>
      )}
    </View>
  );
}

// Verification meeting date + time. Always rendered on the screen — it is
// a required part of the claim, not something that appears after the
// questions are answered. The time dropdown stays disabled until a date
// is picked, then fills from the staff-configured slots for that date.
// Slots staff disabled in Manage Slots stay in the list but can't be
// picked, and show "Unavailable" on the right.
function ScheduleCard({
  meetingDate,
  meetingTime,
  minDate,
  slots,
  loadingSlots,
  slotsLoadError,
  usingDefaultSlots,
  dayBlocks,
  loadBlockedSlots,
  timeOpen,
  timeDropdownRef,
  onInteract,
  onToggleTime,
  onChangeDate,
  onChangeTime,
}) {
  const colors = useIconColors();

  // Calendar modal state (same custom picker as the Report Lost Item screen)
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerValue, setPickerValue] = useState(minDate);
  const [pickerMonth, setPickerMonth] = useState(minDate);
  const [monthYearVisible, setMonthYearVisible] = useState(false);
  const [tempMonth, setTempMonth] = useState(minDate.getMonth());
  const [tempYear, setTempYear] = useState(minDate.getFullYear());
  // Whole days staff disabled in the month shown: { 'YYYY-MM-DD': block }
  const [closedDays, setClosedDays] = useState({});

  const selectedDate = parseDateOnly(meetingDate);
  const minMonth = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const canGoPrev = pickerMonth > minMonth;
  // Meetings are booked shortly ahead, so offer the earliest year plus two.
  const yearOptions = Array.from({ length: 3 }, (_, i) => minDate.getFullYear() + i);

  // Load the whole-day closures for the month the calendar is showing, so
  // those dates can't be tapped. If this fails the calendar still works:
  // the time list below re-checks the picked date, and the server rejects
  // a disabled slot anyway.
  const pickerMonthKey = `${pickerMonth.getFullYear()}-${pickerMonth.getMonth()}`;
  useEffect(() => {
    if (!pickerVisible || typeof loadBlockedSlots !== "function") return undefined;

    let cancelled = false;
    const start = formatDateOnly(
      new Date(pickerMonth.getFullYear(), pickerMonth.getMonth(), 1)
    );
    const end = formatDateOnly(
      new Date(pickerMonth.getFullYear(), pickerMonth.getMonth() + 1, 0)
    );

    Promise.resolve(loadBlockedSlots({ start, end }))
      .then((blocks) => {
        if (!cancelled) setClosedDays(wholeDayBlocksByDate(blocks));
      })
      .catch((err) => {
        console.error("Failed to load disabled days:", err?.message || err);
        if (!cancelled) setClosedDays({});
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerVisible, pickerMonthKey, loadBlockedSlots]);

  const isClosedDay = (date) => Boolean(closedDays[formatDateOnly(date)]);
  const monthHasClosedDays = Object.keys(closedDays).some((key) =>
    key.startsWith(
      `${pickerMonth.getFullYear()}-${String(pickerMonth.getMonth() + 1).padStart(2, "0")}`
    )
  );

  const isSaturday = isSaturdayDate(meetingDate);
  const settled = Boolean(meetingDate) && !loadingSlots && !slotsLoadError;
  const dayClosed = settled && Boolean(dayBlocks.wholeDay);
  // Slots that can still be picked (disabled ones stay in the list, marked
  // "Unavailable").
  const bookableCount = slots.filter((slot) => !slot.unavailable).length;
  // Loaded fine, but nothing is bookable on this date (e.g. a Saturday whose
  // configured slots are all outside 8:00 AM - 11:00 AM, or every slot was
  // disabled by staff).
  const noSlots = settled && bookableCount === 0;
  // The list can still be opened when every slot is disabled, so the
  // claimant sees them marked "Unavailable". It only stays shut when there
  // is nothing at all to show.
  const timeDisabled =
    !meetingDate || loadingSlots || slotsLoadError || slots.length === 0;

  const timePlaceholder = !meetingDate
    ? "Select date first"
    : loadingSlots
    ? "Checking availability..."
    : slotsLoadError
    ? "Couldn't load slots"
    : dayClosed
    ? "Closed on this date"
    : noSlots
    ? "No slots available"
    : "Select time slot";

  const openDatePicker = () => {
    onInteract();
    // Start on the first selectable day, so the highlight never sits on a
    // Sunday or on today.
    const initial = selectedDate && selectedDate >= minDate ? selectedDate : skipSunday(minDate);
    setPickerValue(initial);
    setPickerMonth(new Date(initial.getFullYear(), initial.getMonth(), 1));
    setPickerVisible(true);
  };

  const applyPickerValue = () => {
    // Today, Sundays, disabled days and dates before the earliest allowed
    // day can't be confirmed.
    if (isSunday(pickerValue) || pickerValue < minDate || isClosedDay(pickerValue)) return;

    const formatted = formatDateOnly(pickerValue);
    // Re-confirming the same date shouldn't wipe an already-picked time.
    if (formatted !== meetingDate) onChangeDate(formatted);
    setPickerVisible(false);
  };

  const changePickerMonth = (delta) => {
    setPickerMonth(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1)
    );
  };

  const openMonthYearPicker = () => {
    setTempMonth(pickerMonth.getMonth());
    setTempYear(pickerMonth.getFullYear());
    setMonthYearVisible(true);
  };

  const applyMonthYear = () => {
    const next = new Date(tempYear, tempMonth, 1);
    // Don't land on a month that is entirely before the earliest date.
    setPickerMonth(next < minMonth ? minMonth : next);
    setMonthYearVisible(false);
  };

  return (
    <View className={`mt-4 ${CARD}`}>
      <View className="flex-row items-center">
        <Calendar size={17} color={colors.slate} />
        <Text className={`ml-2 ${CARD_TITLE}`}>
          Verification schedule
        </Text>
        <Text className="ml-2 text-[10px] font-bold text-rose-500 dark:text-rose-400">REQUIRED</Text>
      </View>
      <Text className={`mt-1 text-xs ${BODY_TEXT}`}>
        Pick when you can come in to verify ownership.
      </Text>

      {/* Preferred date */}
      <Text className={`mt-4 text-xs font-semibold ${BODY_TEXT}`}>Preferred date *</Text>
      <TouchableOpacity
        onPress={openDatePicker}
        className={`mt-1.5 ${DROPDOWN_BUTTON}`}
      >
        <View className="flex-1 flex-row items-center pr-2">
          <Calendar size={16} color={colors.muted} />
          <Text
            numberOfLines={1}
            className={`ml-2 text-sm ${meetingDate ? STRONG_TEXT : HINT_TEXT}`}
          >
            {meetingDate ? formatDisplayDate(meetingDate) : "Select a date"}
          </Text>
        </View>
        <ChevronDown size={18} color={colors.muted} />
      </TouchableOpacity>
      <Text className={`mt-1 text-[11px] ${HINT_TEXT}`}>
        Must be after the date this item was surrendered. Today and Sundays are not available.
      </Text>

      {/* Preferred time */}
      <Text className={`mt-4 text-xs font-semibold ${BODY_TEXT}`}>Preferred time *</Text>
      {/* collapsable={false} keeps this wrapper as a real native view on
          Android so the parent screen can measure it and scroll the open
          list into view. */}
      <View ref={timeDropdownRef} collapsable={false}>
        <TouchableOpacity
          disabled={timeDisabled}
          onPress={() => {
            Keyboard.dismiss();
            onToggleTime();
          }}
          className={`mt-1.5 h-11 flex-row items-center justify-between rounded-lg border border-slate-300 px-3 dark:border-slate-700 ${
            timeDisabled
              ? "bg-slate-100 dark:bg-slate-800/50"
              : "bg-white dark:bg-slate-800"
          }`}
        >
          <View className="flex-1 flex-row items-center pr-2">
            {loadingSlots ? (
              <ActivityIndicator size="small" color={colors.navy} />
            ) : (
              <Clock size={16} color={colors.muted} />
            )}
            <Text
              numberOfLines={1}
              className={`ml-2 text-sm ${meetingTime ? STRONG_TEXT : HINT_TEXT}`}
            >
              {meetingTime || timePlaceholder}
            </Text>
          </View>
          <ChevronDown size={18} color={colors.muted} />
        </TouchableOpacity>

        {timeOpen && !timeDisabled && (
          <View className={DROPDOWN_LIST}>
            {slots.map(({ time, unavailable }, timeIndex) => (
              <TouchableOpacity
                key={`${timeIndex}-${time}`}
                disabled={unavailable}
                onPress={() => onChangeTime(time)}
                accessibilityState={{ disabled: unavailable }}
                accessibilityLabel={unavailable ? `${time}, unavailable` : time}
                className={`flex-row items-center justify-between ${DROPDOWN_ROW} ${
                  unavailable ? "bg-slate-50 dark:bg-slate-900/60" : ""
                }`}
              >
                <Text
                  numberOfLines={1}
                  className={`flex-1 pr-2 text-sm ${
                    unavailable ? "text-slate-400 dark:text-slate-500" : STRONG_TEXT
                  }`}
                >
                  {time}
                  {usingDefaultSlots ? " (Default)" : ""}
                </Text>
                {unavailable && (
                  <Text className="text-[11px] font-bold text-rose-500 dark:text-rose-400">
                    Unavailable
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {meetingDate && !loadingSlots && slotsLoadError && (
        <Text className="mt-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
          Couldn't check slot availability — pick the date again to retry.
        </Text>
      )}

      {noSlots && (
        <Text className="mt-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
          No time slots are available on this date. Please pick another date.
        </Text>
      )}

      {isSaturday && !loadingSlots && !slotsLoadError && !dayClosed && (
        <Text className={`mt-1 text-[11px] ${HINT_TEXT}`}>
          Saturday schedules are from 8:00 AM to 11:00 AM only.
        </Text>
      )}

      {settled && !dayClosed && usingDefaultSlots && (
        <Text className={`mt-1 text-[11px] ${HINT_TEXT}`}>
          No slots have been configured for this date yet — showing default time options.
        </Text>
      )}

      {meetingDate && meetingTime ? (
        <View className="mt-4 rounded-lg border border-[#DCE6FF] bg-[#EEF3FF] px-3 py-2.5 dark:border-indigo-900 dark:bg-indigo-950">
          <Text className={`text-[10px] font-bold tracking-widest ${NAVY_TEXT}`}>
            REQUESTED MEETING
          </Text>
          <Text className="mt-0.5 text-xs font-semibold text-[#334155] dark:text-slate-200">
            {formatDisplayDate(meetingDate)} · {meetingTime}
          </Text>
        </View>
      ) : null}

      {/* Calendar modal */}
      <Modal
        visible={pickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerVisible(false)}
      >
        <View className="flex-1 items-center justify-center bg-black/40 px-5 dark:bg-black/60">
          <View className={`w-full overflow-hidden rounded-2xl ${MODAL_CARD}`}>
            <View className="bg-[#1b2061] px-5 py-4">
              <Text className="text-lg font-bold text-white">Select date</Text>
            </View>

            <View className="p-4">
              <View className="mb-4 flex-row items-center justify-between">
                <TouchableOpacity
                  disabled={!canGoPrev}
                  onPress={() => changePickerMonth(-1)}
                  className={`h-9 w-9 items-center justify-center rounded-full ${SOFT_TILE} ${
                    canGoPrev ? "" : "opacity-40"
                  }`}
                >
                  <Text className={`text-2xl leading-none ${NAVY_TEXT}`}>‹</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={openMonthYearPicker}
                  className={`flex-row items-center rounded-lg px-3 py-1.5 ${SOFT_TILE}`}
                >
                  <Text className={`text-base font-bold ${STRONG_TEXT}`}>
                    {MONTH_NAMES[pickerMonth.getMonth()]} {pickerMonth.getFullYear()}
                  </Text>
                  <View className="ml-1">
                    <ChevronDown size={16} color={colors.navy} />
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => changePickerMonth(1)}
                  className={`h-9 w-9 items-center justify-center rounded-full ${SOFT_TILE}`}
                >
                  <Text className={`text-2xl leading-none ${NAVY_TEXT}`}>›</Text>
                </TouchableOpacity>
              </View>

              <View className="flex-row flex-wrap">
                {WEEKDAYS.map((day) => (
                  <Text
                    key={day}
                    className="mb-1 w-[14.28%] text-center text-xs font-semibold text-slate-400"
                  >
                    {day}
                  </Text>
                ))}

                {getCalendarDays(pickerMonth).map((date, index) => {
                  if (!date) {
                    return <View key={`empty-${index}`} className="mb-1 h-10 w-[14.28%]" />;
                  }

                  const selected = isSameDay(date, pickerValue);
                  // Disabled by the office in Manage Slots.
                  const closed = isClosedDay(date);
                  // Before the earliest allowed meeting date (surrender
                  // date + 1 day, and never today or in the past).
                  // Sundays are never selectable.
                  const disabled = date < minDate || isSunday(date) || closed;

                  return (
                    <TouchableOpacity
                      key={`${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`}
                      disabled={disabled}
                      onPress={() => setPickerValue(date)}
                      className={`mb-1 h-10 w-[14.28%] items-center justify-center ${
                        selected && !disabled ? `rounded-full ${PRIMARY_BUTTON}` : ""
                      }`}
                    >
                      <Text
                        className={`text-sm ${
                          selected && !disabled
                            ? "font-bold text-white"
                            : closed && date >= minDate
                            ? "text-rose-300 line-through dark:text-rose-800"
                            : disabled
                            ? "text-slate-300 dark:text-slate-600"
                            : STRONG_TEXT
                        }`}
                      >
                        {date.getDate()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {monthHasClosedDays && (
                <Text className="mt-2 text-center text-[11px] text-rose-500 dark:text-rose-400">
                  Crossed-out dates are closed for claiming.
                </Text>
              )}

              <View className="mt-4 flex-row items-center gap-3">
                <TouchableOpacity
                  onPress={() => setPickerVisible(false)}
                  className={`h-11 flex-1 items-center justify-center rounded-xl ${SECONDARY_BUTTON}`}
                >
                  <Text className={`text-sm font-semibold ${STRONG_TEXT}`}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={applyPickerValue}
                  className={`h-11 flex-1 items-center justify-center rounded-xl ${PRIMARY_BUTTON}`}
                >
                  <Text className="text-sm font-semibold text-white">Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* Month & year modal — nested inside the calendar modal so it can
            present on top of it on iOS. */}
        <Modal
          visible={monthYearVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setMonthYearVisible(false)}
        >
          <View className="flex-1 items-center justify-center bg-black/50 px-5 dark:bg-black/60">
            <View className={`w-full rounded-2xl p-5 ${MODAL_CARD}`}>
              <Text className={`mb-4 text-center text-lg font-bold ${STRONG_TEXT}`}>
                Select Month & Year
              </Text>

              <View className="h-52 flex-row gap-4">
                <ScrollView className="flex-1 border-r border-slate-200 pr-2 dark:border-slate-700" showsVerticalScrollIndicator={false}>
                  {MONTH_NAMES.map((month, index) => {
                    const selected = tempMonth === index;
                    return (
                      <TouchableOpacity
                        key={month}
                        onPress={() => setTempMonth(index)}
                        className={`mb-1.5 rounded-lg p-2.5 ${
                          selected ? PRIMARY_BUTTON : "bg-slate-50 dark:bg-slate-800"
                        }`}
                      >
                        <Text
                          className={`text-center text-sm font-semibold ${
                            selected ? "text-white" : STRONG_TEXT
                          }`}
                        >
                          {month}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <ScrollView className="flex-1 pl-2" showsVerticalScrollIndicator={false}>
                  {yearOptions.map((year) => {
                    const selected = tempYear === year;
                    return (
                      <TouchableOpacity
                        key={year}
                        onPress={() => setTempYear(year)}
                        className={`mb-1.5 rounded-lg p-2.5 ${
                          selected ? PRIMARY_BUTTON : "bg-slate-50 dark:bg-slate-800"
                        }`}
                      >
                        <Text
                          className={`text-center text-sm font-semibold ${
                            selected ? "text-white" : STRONG_TEXT
                          }`}
                        >
                          {year}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              <View className="mt-5 flex-row items-center gap-3">
                <TouchableOpacity
                  onPress={() => setMonthYearVisible(false)}
                  className={`h-11 flex-1 items-center justify-center rounded-xl ${SECONDARY_BUTTON}`}
                >
                  <Text className={`text-sm font-semibold ${STRONG_TEXT}`}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={applyMonthYear}
                  className={`h-11 flex-1 items-center justify-center rounded-xl ${PRIMARY_BUTTON}`}
                >
                  <Text className="text-sm font-semibold text-white">Apply</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </Modal>
    </View>
  );
}

// Main Component
export default function ClaimRequestScreen({
  route,
  navigation,
  item: propItem,
  claimant = EMPTY_CLAIMANT,
  fetchClaimant,
  fetchSchedules,
  fetchBlockedSlots,
  onBack: propOnBack,
}) {
  // Gracefully resolve item and back handlers from either props or route params
  const item = propItem || route?.params?.item;
  const insets = useSafeAreaInsets();
  const { handleScroll, hideTabBar } = useTabBarVisibility();
  const { confirmationModal, showFeedback } = useConfirmationModal();
  const colors = useIconColors();
  // Loader for the staff-disabled days / time slots (Manage Slots).
  const loadBlockedSlots = fetchBlockedSlots || getBlockedSlots;
  

  const handleBack = () => {
    if (propOnBack) {
      propOnBack();
    } else if (navigation?.canGoBack()) {
      navigation.goBack();
    }
  };

  // Safe fallback if screen is navigated to without valid item data
  useEffect(() => {
    if (!item) {
      showFeedback({
        title: "Item unavailable",
        message: "No item details found.",
        tone: "error",
        onClose: handleBack,
      });
    }
  }, [item]);

  // Component State
  const [answers, setAnswers] = useState([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [openQuestionIndex, setOpenQuestionIndex] = useState(null);
  const [profile, setProfile] = useState(claimant);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Verification meeting schedule
  const [meetingDate, setMeetingDate] = useState(""); // 'YYYY-MM-DD'
  const [meetingTime, setMeetingTime] = useState(""); // e.g. '9:00 AM - 10:00 AM'
  const [timeDropdownOpen, setTimeDropdownOpen] = useState(false);
  const [availableTimeSlots, setAvailableTimeSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsLoadError, setSlotsLoadError] = useState(false);
  const [usingDefaultSlots, setUsingDefaultSlots] = useState(false);
  // Staff-disabled slots for the picked date (Manage Slots).
  const [dayBlocks, setDayBlocks] = useState(EMPTY_DAY_BLOCKS);
  // Bumped to re-check availability (e.g. after the server refuses a slot).
  const [slotsReloadKey, setSlotsReloadKey] = useState(0);

  // Keyboard / Scroll Refs
  const formScrollRef = useRef(null);
  const notesInputRef = useRef(null);
  const answerInputRefs = useRef([]);
  const questionDropdownRefs = useRef([]);
  const timeDropdownRef = useRef(null);
  const scrollViewHeightRef = useRef(0);
  const contentHeightRef = useRef(0);
  const scrollYRef = useRef(0);
  const focusedInputRef = useRef(null);
  const keyboardHeightRef = useRef(0);
  const suppressTabBarScrollUntilRef = useRef(0);

  // Parse Verification Questions
  const questionPairs = useMemo(() => {
    if (!item) return [];
    return [1, 2, 3, 4]
      .map((num) => ({
        question: itemValue(item, `verification_question_${num}`),
        options: parseOptions(item?.[`verification_options_${num}`]),
      }))
      .filter(({ question }) => question.trim())
      .map(({ question, options }) => ({
        question,
        options,
        placeholder: "Type your answer here",
      }));
  }, [item]);

  // Earliest date the claimant can pick for the verification meeting: the
  // day after the item was surrendered, and never today or in the past (at
  // the earliest, tomorrow). The surrender date counts from the END of the
  // found date range (end_date) when there is one, otherwise from its start
  // (start_date). The older created_date / date_found names are kept as a
  // fallback.
  const minMeetingDate = useMemo(
    () =>
      getMinMeetingDate(
        itemValue(item, "end_date", "start_date", "created_date", "date_found", "date")
      ),
    [item]
  );

  // Load Logged-In User Profile
  useEffect(() => {
    let cancelled = false;
    const fetchAccount = fetchClaimant || getCurrentUser;

    setLoadingProfile(true);
    Promise.resolve(fetchAccount())
      .then((account) => {
        if (!cancelled && account) setProfile(account);
      })
      .catch(() => {
        if (!cancelled) {
          showFeedback({
            title: "Could not load account information",
            message:
              "Please check your connection and sign in again before submitting a claim.",
            tone: "error",
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingProfile(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchClaimant]);

  // Reset Answers + schedule on Item Swap
  useEffect(() => {
    setAnswers(questionPairs.map(() => ""));
    setNotes("");
    setOpenQuestionIndex(null);
    setMeetingDate("");
    setMeetingTime("");
    setTimeDropdownOpen(false);
    answerInputRefs.current = [];
    questionDropdownRefs.current = [];
  }, [item?.id, questionPairs]);

  // Load the available time slots for the picked date. Uses the same
  // staff-managed AvailableSchedule data as the web claim modal
  // (GET /claim/schedules/?date=YYYY-MM-DD). An empty-but-successful
  // response falls back to the default slots; a failed request fails
  // closed (no slots + error message) since availability is unknown.
  // On a Saturday, both the configured and the default slots are limited
  // to 8:00 AM - 11:00 AM.
  //
  // The slots staff disabled in Manage Slots (BlockedSlot) are loaded at
  // the same time and removed: a disabled whole day leaves no slots, and a
  // disabled time slot is left out of the list. If the disabled-slots
  // request fails, this also fails closed, like the schedules request.
  useEffect(() => {
    if (!meetingDate) {
      setAvailableTimeSlots([]);
      setSlotsLoadError(false);
      setUsingDefaultSlots(false);
      setDayBlocks(EMPTY_DAY_BLOCKS);
      return;
    }

    let cancelled = false;
    const loadSchedules = fetchSchedules || getAvailableSchedules;

    const run = async () => {
      setLoadingSlots(true);
      setSlotsLoadError(false);

      try {
        if (typeof loadSchedules !== "function") {
          throw new Error("No schedules loader available.");
        }
        if (typeof loadBlockedSlots !== "function") {
          throw new Error("No disabled-slots loader available.");
        }

        const [data, blocked] = await Promise.all([
          loadSchedules(meetingDate),
          loadBlockedSlots({ start: meetingDate, end: meetingDate }),
        ]);
        if (cancelled) return;

        const list = Array.isArray(data)
          ? data
          : Array.isArray(data?.results)
          ? data.results
          : [];
        const times = list.map((slot) => slot?.time_slot).filter(Boolean);

        const saturday = isSaturdayDate(meetingDate);
        const limitToSaturdayHours = (options) =>
          saturday ? options.filter(isWithinSaturdayHours) : options;

        const blocks = groupBlocksForDate(blocked, meetingDate);

        // Staff-configured slots for this date, otherwise the defaults. On a
        // Saturday this can end up empty if every slot is outside the
        // morning hours. Slots staff disabled stay in the list, marked
        // unavailable (all of them when the whole day is disabled).
        const configured = times.length > 0;
        const options = limitToSaturdayHours(
          configured ? times : DEFAULT_TIME_OPTIONS
        ).map((time) => ({
          time,
          unavailable: Boolean(blocks.wholeDay || blocks.slots[time]),
        }));

        setDayBlocks(blocks);
        setAvailableTimeSlots(options);
        setUsingDefaultSlots(!configured);
        // Drop a picked time that can no longer be booked (e.g. staff
        // disabled it since it was picked).
        setMeetingTime((prev) =>
          prev && options.some((slot) => slot.time === prev && !slot.unavailable)
            ? prev
            : ""
        );
      } catch (err) {
        console.error("Failed to load available time slots:", err?.message || err);
        if (!cancelled) {
          setAvailableTimeSlots([]);
          setSlotsLoadError(true);
          setUsingDefaultSlots(false);
          setDayBlocks(EMPTY_DAY_BLOCKS);
        }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [meetingDate, fetchSchedules, loadBlockedSlots, slotsReloadKey]);

  // Re-measures the currently focused field against the ScrollView and
  // scrolls it just above the keyboard. Doing a fresh measurement every
  // time (instead of a one-shot legacy helper) is what makes this work
  // reliably on the 2nd, 3rd, etc. focus, not just the first.
  const scrollFocusedInputAboveKeyboard = () => {
    const target = focusedInputRef.current;
    const scrollNode = formScrollRef.current;
    if (!target || !scrollNode) return;

    target.measureLayout(
      scrollNode,
      (x, y) => {
        const targetY = Math.max(y - 24, 0);
        scrollNode.scrollTo({ y: targetY, animated: true });

        // Tapping straight into a lower field can land the form at/near
        // the bottom without ever firing a real scroll gesture, so
        // handleScroll (and its direction/distance logic below) never
        // runs for it — the tab bar would then stay visible and cover
        // the Cancel/Submit buttons. Check directly against the measured
        // content height here and force the tab bar hidden if we've
        // landed near the bottom, instead of waiting on a scroll event
        // that may never come.
        const viewportHeight = scrollViewHeightRef.current;
        const contentHeight = contentHeightRef.current;
        const isNearBottom =
          contentHeight > 0 &&
          targetY + viewportHeight >= contentHeight - BOTTOM_THRESHOLD;

        if (isNearBottom) {
          hideTabBar();
        }
      },
      () => {}
    );
  };

  const scrollFocusedInputIntoView = (node) => {
    focusedInputRef.current = node;
    if (keyboardHeightRef.current > 0) {
      requestAnimationFrame(scrollFocusedInputAboveKeyboard);
    }
  };

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", (event) => {
      const height = event?.endCoordinates?.height ?? 0;
      keyboardHeightRef.current = height;
      setKeyboardHeight(height);
      suppressTabBarScrollUntilRef.current = Date.now() + KEYBOARD_SCROLL_SUPPRESS_MS;

      requestAnimationFrame(scrollFocusedInputAboveKeyboard);
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      keyboardHeightRef.current = 0;
      setKeyboardHeight(0);
      suppressTabBarScrollUntilRef.current = Date.now() + KEYBOARD_SCROLL_SUPPRESS_MS;
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // Scrolls just enough to show a dropdown's button together with its open
  // list. Does nothing if it's already fully visible. Without this, a list
  // that opens below the fold (or behind the tab bar) can't be seen.
  const scrollDropdownIntoView = (node) => {
    const scrollNode = formScrollRef.current;
    if (!node || !scrollNode) return;

    node.measureLayout(
      scrollNode,
      (x, y, width, height) => {
        const viewportHeight = scrollViewHeightRef.current;
        const currentY = scrollYRef.current;
        const topEdge = y - DROPDOWN_SCROLL_MARGIN;
        const bottomEdge = y + height + DROPDOWN_SCROLL_MARGIN;

        let targetY = currentY;
        if (topEdge < currentY) {
          targetY = topEdge;
        } else if (bottomEdge > currentY + viewportHeight) {
          // Reveal the whole list, but never push the button off the top.
          targetY = Math.min(bottomEdge - viewportHeight, topEdge);
        }
        targetY = Math.max(targetY, 0);
        if (targetY === currentY) return;

        scrollNode.scrollTo({ y: targetY, animated: true });

        // Same bottom check as the keyboard case: keep the tab bar from
        // covering the list once we've landed near the end of the form.
        const contentHeight = contentHeightRef.current;
        if (
          contentHeight > 0 &&
          targetY + viewportHeight >= contentHeight - BOTTOM_THRESHOLD
        ) {
          hideTabBar();
        }
      },
      () => {}
    );
  };

  // Question dropdown opened -> bring its list into view.
  useEffect(() => {
    if (openQuestionIndex === null) return undefined;
    const timer = setTimeout(
      () => scrollDropdownIntoView(questionDropdownRefs.current[openQuestionIndex]),
      DROPDOWN_MEASURE_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [openQuestionIndex]);

  // Time dropdown opened -> bring its list into view.
  useEffect(() => {
    if (!timeDropdownOpen) return undefined;
    const timer = setTimeout(
      () => scrollDropdownIntoView(timeDropdownRef.current),
      DROPDOWN_MEASURE_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [timeDropdownOpen]);

  if (!item) {
    // Nothing to show behind it, but the "Item unavailable" modal still
    // has to render so the user sees why the screen is closing.
    return (
      <View className="flex-1 bg-[#F7F8FC] dark:bg-slate-950">{confirmationModal}</View>
    );
  }

  // Derived Properties
  const completed = answers.filter((ans) => ans.trim().length >= 2).length;
  const answersComplete = questionPairs.length > 0 && completed === questionPairs.length;
  const scheduleComplete = Boolean(meetingDate && meetingTime);
  const canSubmit = answersComplete && scheduleComplete;
  const title = itemValue(item, "title", "item_name", "name");
  const category = itemValue(item, "category", "item_category");
  const firstName = profile.firstName || profile.first_name || "";
  const lastName = profile.lastName || profile.last_name || "";

  // When the item was found, shown as "From – To" when it has a date range.
  const itemDateFrom = itemValue(item, "start_date", "created_date", "date_found", "date");
  const itemDateTo = itemValue(item, "end_date", "created_date_to");
  const itemDateLabel =
    itemDateTo && itemDateTo !== itemDateFrom
      ? `${formatDisplayDate(itemDateFrom)} – ${formatDisplayDate(itemDateTo)}`
      : formatDisplayDate(itemDateFrom);

  const schoolId = String(
    profile.student_id ||
      profile.schoolId ||
      profile.school_id ||
      profile.id_number ||
      profile.username ||
      profile.email ||
      ""
  )
    .replace(/\D/g, "")
    .slice(0, 8);

  // The account's contact number in the 11-digit format the backend accepts
  // (09XXXXXXXXX), or "" when the account has none. It used to be sent as
  // "+63..." (and as a bare "+63" for accounts without a number), which the
  // backend's 11-digit rule rejected.
  const contact = toLocalContactNumber(
    profile.contact_number ||
      profile.contact ||
      profile.claimant_contact ||
      profile.phone ||
      profile.phone_number ||
      ""
  );

  // Handlers
  const changeAnswer = (index, text) => {
    setAnswers((prev) =>
      questionPairs.map((_, i) => (i === index ? text : prev[i] || ""))
    );
  };

  const closeDropdowns = () => {
    setOpenQuestionIndex(null);
    setTimeDropdownOpen(false);
  };

  const handleAnswerFocus = (index) => {
    closeDropdowns();
    scrollFocusedInputIntoView(answerInputRefs.current[index]);
  };

  const handleNotesFocus = () => {
    closeDropdowns();
    scrollFocusedInputIntoView(notesInputRef.current);
  };

  // Changing the date invalidates any previously picked time, since the
  // available slots are per-date.
  const changeMeetingDate = (dateString) => {
    setMeetingDate(dateString);
    setMeetingTime("");
    setTimeDropdownOpen(false);
  };

  const changeMeetingTime = (time) => {
    setMeetingTime(time);
    setTimeDropdownOpen(false);
  };

  const handleSubmit = async () => {
    if (!item?.id) {
      showFeedback({
        title: "Item unavailable",
        message:
          "This item is missing its server ID. Return to the item list and try again.",
        tone: "error",
      });
      return;
    }
    if (!questionPairs.length) {
      showFeedback({
        title: "Verification questions unavailable",
        message:
          "This item has no Question Bank verification questions yet. Please ask a moderator to add them before submitting a claim.",
        tone: "warning",
      });
      return;
    }
    if (!answersComplete) {
      showFeedback({
        title: "A few details are missing",
        message: "Please give a meaningful answer to every ownership question.",
        tone: "warning",
      });
      return;
    }
    if (!scheduleComplete) {
      showFeedback({
        title: "Verification schedule needed",
        message: "Please select a verification date and time.",
        tone: "warning",
      });
      return;
    }
    // Safety net for the "not today" rule: the screen may have stayed open
    // past midnight, so check against tomorrow at the moment of submitting.
    const pickedDate = parseDateOnly(meetingDate);
    if (!pickedDate || pickedDate < getTomorrow()) {
      setMeetingDate("");
      setMeetingTime("");
      showFeedback({
        title: "Date not available",
        message:
          "Verification meetings can't be scheduled for today. Please pick a date from tomorrow onward.",
        tone: "warning",
      });
      return;
    }
    // Safety net for the Saturday rule, in case a time outside the morning
    // hours is somehow still selected.
    if (isSaturdayDate(meetingDate) && !isWithinSaturdayHours(meetingTime)) {
      showFeedback({
        title: "Time not available",
        message:
          "Saturday schedules are from 8:00 AM to 11:00 AM only. Please pick another time.",
        tone: "warning",
      });
      return;
    }
    // Safety net for slots disabled by the office (Manage Slots).
    if (dayBlocks.wholeDay || dayBlocks.slots[meetingTime]) {
      showFeedback({
        title: "Time not available",
        message:
          "The Lost and Found Office has closed this schedule for claiming. Please pick another date or time.",
        tone: "warning",
      });
      return;
    }

    const structuredAnswers = questionPairs.map(({ question }, index) => ({
      question,
      answer: answers[index].trim(),
    }));

    const otherDescription = notes.trim();
    const proofDescription =
      structuredAnswers
        .map(
          ({ question, answer }, index) =>
            `${index + 1}. ${question}\nAnswer: ${answer}`
        )
        .join("\n\n") +
      (otherDescription ? `\n\nOther Unique Description:\n${otherDescription}` : "");

    const fullName =
      profile.name || profile.claimant_name || `${firstName} ${lastName}`.trim();

    setSubmitting(true);
    try {
      const createdClaim = await createClaim({
        item: item?.id,
        itemId: item?.id,
        claimant_name: fullName,
        claimant_contact: contact,
        claimant_email:
          profile.email || (schoolId ? `${schoolId}@slc-sflu.edu.ph` : ""),
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        school_id: schoolId,
        question_1: questionPairs[0]?.question || "",
        answer_1: answers[0]?.trim() || "",
        question_2: questionPairs[1]?.question || "",
        answer_2: answers[1]?.trim() || "",
        question_3: questionPairs[2]?.question || "",
        answer_3: answers[2]?.trim() || "",
        question_4: questionPairs[3]?.question || "",
        answer_4: answers[3]?.trim() || "",
        other_description: otherDescription,
        proof_description: proofDescription,

        // The claimant's requested verification slot. Staff still review
        // the answers first (needs_manual_review below) before treating
        // this slot as final.
        meeting_date: meetingDate,
        meeting_time: meetingTime,
        // Same as the web modal: sent blank in case the backend requires
        // the field; staff fill in the actual location when confirming.
        meeting_location: "",

        needs_manual_review: true,
      });

      if (!createdClaim) {
        throw new Error("The server did not return the created claim.");
      }

      // Close the loading modal before opening the result modal so the two
      // never overlap (iOS can drop the second one otherwise).
      setSubmitting(false);
      showFeedback({
        title: "Request submitted",
        message:
          "The Lost and Found Office will review your details and notify you once the meeting is confirmed.",
        tone: "success",
        detail: {
          label: "REQUESTED MEETING",
          value: `${formatDisplayDate(meetingDate)} · ${meetingTime}`,
        },
        onClose: handleBack,
      });
    } catch (error) {
      // Shows the server's own reason whichever field it is attached to
      // (contact number, meeting date, a disabled slot, an already-submitted
      // claim, ...), instead of a bare "Request failed with status code 400".
      const message =
        getServerErrorMessage(error?.response?.data) ||
        (error?.response
          ? "The server could not accept this request. Please try again in a moment."
          : error?.message || "Please try again in a moment.");

      setSubmitting(false);
      showFeedback({
        title: "Could not submit request",
        message,
        tone: "error",
      });

      // The server refused the request (for example the slot was disabled
      // while this screen was open): re-check what is still available. A
      // picked time that is no longer offered is cleared.
      if (error?.response) setSlotsReloadKey((key) => key + 1);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-[#F7F8FC] dark:bg-slate-950">
      <StatusBar style="light" backgroundColor={NAVY} />

      {/* Header Bar */}
      <SafeAreaView edges={["top"]} className="rounded-b-3xl bg-[#1B2061]">
        <View className="flex-row items-center px-4 pb-6 pt-2">
          <TouchableOpacity
            onPress={handleBack}
            className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-white/10"
            accessibilityLabel="Return to items"
          >
            <ChevronLeft size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-[12px] font-bold tracking-widest text-white/60">
              CLAIM CENTER
            </Text>
            <Text className="text-2xl font-bold text-white">Claim request</Text>
          </View>
          <View className="h-10 w-10 items-center justify-center rounded-full bg-white/10">
            <ShieldCheck size={21} color="#FFFFFF" />
          </View>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
      >
        <ScrollView
          ref={formScrollRef}
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onLayout={(e) => {
            scrollViewHeightRef.current = e.nativeEvent.layout.height;
          }}
          onContentSizeChange={(w, h) => {
            contentHeightRef.current = h;
          }}
          onScroll={(event) => {
            // Always track the real scroll position so dropdowns can tell
            // whether they're already visible.
            scrollYRef.current = event.nativeEvent.contentOffset.y;

            // Skip the synthetic scroll events fired by the content resizing
            // as the keyboard opens/closes, so the tab bar's own
            // scroll-direction logic doesn't mistake that for a real scroll
            // and pop itself back into view over the action buttons.
            if (Date.now() < suppressTabBarScrollUntilRef.current) return;
            handleScroll(event);
          }}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            padding: 16,
            paddingBottom:
              keyboardHeight > 0
                ? keyboardHeight + 24
                : insets.bottom + ACTION_BUTTONS_BOTTOM_RESERVE,
          }}
        >
          {/* Target Item Summary */}
          <View className={CARD}>
            <View className="flex-row items-start justify-between">
              <View className="flex-1 pr-3">
                <Text className="text-[10px] font-bold tracking-widest text-slate-400">
                  ITEM YOU WANT TO CLAIM
                </Text>
                <Text className={`mt-1 text-xl font-bold ${STRONG_TEXT}`}>
                  {title || "Selected item"}
                </Text>
              </View>
              <View className="rounded-full bg-emerald-100 px-3 py-1.5 dark:bg-emerald-950">
                <Text className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                  AVAILABLE
                </Text>
              </View>
            </View>

            <View className="mt-4 flex-row border-t border-slate-100 pt-4 dark:border-slate-800">
              <ItemDetail icon={Tag} label="CATEGORY" value={category} />
              <View className="mx-3 w-px bg-slate-100 dark:bg-slate-800" />
              <ItemDetail
                icon={MapPin}
                label="AREA FOUND"
                value={itemValue(item, "location", "location_found", "found_location")}
              />
            </View>

            <View className="mt-3 flex-row border-t border-slate-100 pt-3 dark:border-slate-800">
              <ItemDetail
                icon={Calendar}
                label="DATE REPORTED"
                value={itemDateLabel}
              />
            </View>
          </View>

          {/* Privacy Banner */}
          <View className="mt-5 rounded-2xl border border-[#DCE6FF] bg-[#EEF3FF] p-4 dark:border-indigo-900 dark:bg-indigo-950">
            <View className="flex-row items-center">
              <View className="h-8 w-8 items-center justify-center rounded-full bg-[#1B2061] dark:bg-indigo-600">
                <CheckCircle2 size={16} color="#FFFFFF" />
              </View>
              <View className="ml-3 flex-1">
                <Text className={`text-sm font-bold ${NAVY_TEXT}`}>
                  A fair and private review
                </Text>
                <Text className="mt-0.5 text-[11px] leading-4 text-[#596680] dark:text-slate-400">
                  Share details only the real owner is likely to know.
                </Text>
              </View>
            </View>
          </View>

          {/* Claimant Identity Card */}
          <View className={`mt-4 ${CARD}`}>
            <Text className="text-[10px] font-bold tracking-widest text-slate-400">
              CLAIMANT INFORMATION
            </Text>
            {loadingProfile ? (
              <View className="mt-3 flex-row items-center">
                <ActivityIndicator size="small" color={colors.navy} />
                <Text className={`ml-2 text-xs font-semibold ${BODY_TEXT}`}>
                  Loading your account information…
                </Text>
              </View>
            ) : (
              <>
                <Text className={`mt-2 text-sm font-bold ${STRONG_TEXT}`}>
                  {`${firstName} ${lastName}`.trim() || "Account profile incomplete"}
                </Text>
                <Text className={`mt-1 text-xs ${BODY_TEXT}`}>
                  ID Number: {schoolId || "Not available"}
                </Text>
                <Text className={`mt-1 text-xs ${BODY_TEXT}`}>
                  Contact: {contact || "Not provided"}
                </Text>
                <Text className={`mt-2 text-[10px] leading-4 ${HINT_TEXT}`}>
                  This information is pulled from your logged-in account and cannot be
                  edited in a claim request.
                </Text>
              </>
            )}
          </View>

          {/* Verification Questions List */}
          {!questionPairs.length && (
            <View className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
              <Text className="text-sm font-bold text-amber-900 dark:text-amber-200">
                Verification questions are not available
              </Text>
              <Text className="mt-1 text-xs leading-4 text-amber-800 dark:text-amber-300">
                A moderator must add Question Bank verification questions to this
                surrendered item before it can be claimed.
              </Text>
            </View>
          )}

          <View className="mt-6 flex-row items-end justify-between">
            <View>
              <Text className={`text-xs font-bold tracking-wide ${NAVY_TEXT}`}>
                OWNERSHIP CHECK
              </Text>
              <Text className={`mt-1 text-xs ${BODY_TEXT}`}>
                Answer the questions set for this item.
              </Text>
            </View>
            <Text className={`text-xs font-bold ${NAVY_TEXT}`}>
              {completed}/{questionPairs.length || 4}
            </Text>
          </View>

          {/* Progress Indicator */}
          <View className="mt-3 flex-row gap-1.5">
            {[0, 1, 2, 3].map((step) => (
              <View
                key={step}
                className={`h-1.5 flex-1 rounded-full ${
                  step < completed
                    ? "bg-[#1B2061] dark:bg-indigo-500"
                    : "bg-slate-200 dark:bg-slate-800"
                }`}
              />
            ))}
          </View>

          {/* Question Cards */}
          {questionPairs.map(({ question, placeholder, options }, index) => (
            <QuestionCard
              key={`${index}-${question}`}
              index={index}
              question={question}
              placeholder={placeholder}
              options={options}
              answer={answers[index] || ""}
              isOpen={openQuestionIndex === index}
              inputRef={(el) => {
                answerInputRefs.current[index] = el;
              }}
              dropdownRef={(el) => {
                questionDropdownRefs.current[index] = el;
              }}
              onToggleDropdown={() => {
                setTimeDropdownOpen(false);
                setOpenQuestionIndex((curr) => (curr === index ? null : index));
              }}
              onChangeAnswer={(val) => {
                changeAnswer(index, val);
                closeDropdowns();
              }}
              onFocusInput={() => handleAnswerFocus(index)}
            />
          ))}

          {/* Notes Input Field */}
          <View className={`mt-4 ${CARD}`}>
            <View className="flex-row items-center">
              <HelpCircle size={17} color={colors.slate} />
              <Text className={`ml-2 ${CARD_TITLE}`}>
                Other unique description
              </Text>
              <Text className="ml-2 text-[10px] font-bold text-slate-400">
                OPTIONAL
              </Text>
            </View>

            <View className={`${INPUT_CONTAINER_CLASS} mt-3 min-h-[110px] items-start`}>
              <TextInput
                ref={notesInputRef}
                value={notes}
                onChangeText={(text) => setNotes(text.slice(0, 300))}
                onFocus={handleNotesFocus}
                placeholder="Share anything else that may help confirm ownership."
                placeholderTextColor={colors.placeholder}
                multiline
                maxLength={300}
                textAlignVertical="top"
                className={`min-h-[110px] flex-1 py-3 text-sm ${STRONG_TEXT}`}
              />
            </View>
            <Text className={`mt-2 text-right text-[11px] ${HINT_TEXT}`}>
              {notes.length}/300
            </Text>
          </View>

          {/* Verification Schedule — always visible, required to submit */}
          <ScheduleCard
            meetingDate={meetingDate}
            meetingTime={meetingTime}
            minDate={minMeetingDate}
            slots={availableTimeSlots}
            loadingSlots={loadingSlots}
            slotsLoadError={slotsLoadError}
            usingDefaultSlots={usingDefaultSlots}
            dayBlocks={dayBlocks}
            loadBlockedSlots={loadBlockedSlots}
            timeOpen={timeDropdownOpen}
            timeDropdownRef={timeDropdownRef}
            onInteract={() => {
              Keyboard.dismiss();
              closeDropdowns();
            }}
            onToggleTime={() => {
              setOpenQuestionIndex(null);
              setTimeDropdownOpen((open) => !open);
            }}
            onChangeDate={changeMeetingDate}
            onChangeTime={changeMeetingTime}
          />

          <Text className={`mt-5 px-1 text-center text-[11px] leading-4 ${HINT_TEXT}`}>
            By submitting, you confirm that the information is accurate. False claims
            may be declined.
          </Text>

          {/* Action Buttons — the last item in the scrollable form, not
              pinned to the bottom of the screen (same layout as the
              Report Lost Item screen). */}
          <View className="mt-4 flex-row items-center gap-3">
            <TouchableOpacity
              disabled={submitting}
              onPress={handleBack}
              className={`h-12 flex-1 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-800 ${
                submitting ? "opacity-50" : ""
              }`}
            >
              <Text className="text-sm font-semibold text-slate-700 dark:text-slate-200">Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              disabled={submitting}
              onPress={handleSubmit}
              className={`h-12 flex-1 items-center justify-center rounded-lg ${
                canSubmit ? PRIMARY_BUTTON : "bg-[#8990B7] dark:bg-slate-700"
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  canSubmit ? "text-white" : "text-white dark:text-slate-400"
                }`}
              >
                Submit request
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Submitting overlay */}
      <Modal
        visible={submitting}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => {}}
      >
        <View className="flex-1 items-center justify-center bg-[#1b2061]/45 px-6 dark:bg-black/60">
          <View className={`w-[78%] items-center rounded-2xl px-6 py-7 shadow-lg ${MODAL_CARD}`}>
            <ActivityIndicator size="large" color={colors.navy} />
            <Text className={`mt-4 text-center text-base font-bold ${NAVY_TEXT}`}>
              Submitting your request...
            </Text>
            <Text className={`mt-1 text-center text-sm ${BODY_TEXT}`}>
              Please wait while we send your claim to the Lost and Found Office.
            </Text>
          </View>
        </View>
      </Modal>

      {confirmationModal}
    </View>
  );
}