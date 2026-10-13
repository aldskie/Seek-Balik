import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronDown, X, Check, CircleAlert, CheckCircle2, ImagePlus } from 'lucide-react-native';

import PhotoPickerModal from '../../components/PhotoPickerModal';
import LoadingModal from '../../components/LoadingModal';
import { createLostItem, getQuestionBank, getUsers } from '../../api/api';
import { useTabBarVisibility } from '../../hooks/TabBarVisibility';

const INSET_SHADOW_COLORS = ['rgba(15,23,42,0.14)', 'rgba(15,23,42,0)'];

const CATEGORIES = ['Accessories', 'ID', 'Academic Materials', 'Bags & Wallets', 'Clothing', 'Electronic', 'Keys'];

const COLORS = [
  'Black', 'White', 'Gray', 'Silver', 'Gold', 'Rose Gold', 'Brown', 'Beige', 'Red',
  'Orange', 'Yellow', 'Green', 'Blue', 'Navy', 'Purple', 'Pink', 'Maroon', 'Brass',
  'Bronze', 'Copper', 'Clear',
];

const DESIGN_FEATURES = [
  'Sticker', 'Keychain', 'Charm', 'Pin', 'Patch', 'Embroidery', 'Logo', 'Name Label',
  'Initials', 'Engraving', 'Lanyard', 'Strap', 'Case/Cover', 'Skin', 'PopSocket',
  'Photo', 'Character', 'Plush', 'Acrylic', 'Metal', 'Rubber', 'Ribbon', 'Bow',
  'Scarf', 'Tag', 'Clip', 'Beads', 'Gemstones', 'Custom Print', 'Custom Drawing',
  'Other', 'None',
];

const FALLBACK_PRESETS = [
  { text: 'What color of the item?', category: 'General', options: COLORS },
  { text: 'What brand of the item?', category: 'General', options: [] },
  { text: 'What size of the item?', category: 'General', options: [] },
  { text: 'What design or distinctive features does the item have?', category: 'General', options: DESIGN_FEATURES },
];

const ITEM_NAME_OPTIONS = {
  Accessories: ['Watch', 'Bracelet', 'Necklace', 'Ring', 'Earrings', 'Hair Clip', 'Hair Tie', 'Sunglasses', 'Eyeglasses', 'Cap/Hat', 'Keychain', 'ID Lace', 'Brooch/Pin', 'Belt'],
  ID: ['Student ID', 'School ID', "Driver's License", 'Passport', 'Government ID', 'Company/Employee ID', 'PhilHealth ID', 'UMID', 'ATM/Debit Card', 'Library Card', 'Other Identification Card'],
  'Academic Materials': ['Notebook', 'Binder', 'Folder', 'Envelope', 'Textbook', 'Reference Book', 'Module', 'Reviewer', 'Printed Document', 'Assignment', 'Examination Paper', 'Index Card', 'Yellow Pad', 'Calculator', 'Ruler', 'Pencil', 'Ballpen', 'Marker/Highlighter', 'Eraser', 'Pencil Case', 'Art Materials', 'USB/Flash Drive'],
  'Bags & Wallets': ['Backpack', 'School Bag', 'Shoulder Bag', 'Tote Bag', 'Sling Bag', 'Laptop Bag', 'Handbag', 'Purse', 'Wallet', 'Coin Purse', 'Pouch', 'Pencil Case', 'Drawstring Bag', 'Travel Bag'],
  Clothing: ['T-Shirt', 'Polo Shirt', 'Uniform', 'Jacket', 'Hoodie', 'Sweater', 'Pants', 'Jeans', 'Shorts', 'Skirt', 'Dress', 'Socks', 'Shoes', 'Slippers', 'Sneakers', 'Underwear', 'Scarf', 'Gloves', 'Raincoat'],
  Electronic: ['Mobile Phone', 'Laptop', 'Tablet', 'iPad', 'Smartwatch', 'Digital Camera', 'Calculator', 'Power Bank', 'Charger', 'Charging Cable', 'Earphones', 'Earbuds', 'Headphones', 'Bluetooth Speaker', 'USB Flash Drive', 'External Hard Drive', 'Mouse', 'Keyboard', 'Adapter', 'Power Supply', 'HDMI Cable'],
  Keys: ['House Key', 'Room Key', 'Classroom Key', 'Office Key', 'Cabinet Key', 'Locker Key', 'Padlock Key', 'Motorcycle Key', 'Car Key', 'Key Set', 'Duplicate Key', 'Keychain with Keys'],
};

// Every place on the campus map, one choice per polygon, plus "Others".
// These are exactly the stored values of ItemDetails.LOCATIONS on the
// backend (items/models.py), minus "All", which is a filter option and not
// a place. The website's dropdowns save the same strings, and the campus
// map (components/CampusMap) matches on them exactly, so the spelling here
// must not drift: a value that differs by even one word is not counted on
// the map.
//
// "Criminology Building" is not a choice: it is the same building as the
// Verbist Building, so "Verbist Building" covers both.
const AREAS = [
  'Grandstand',
  'Verbist Building',
  'Chapel',
  'Administrative Building (Main Building)',
  'Library',
  'Gymnasium',
  'ICT Center',
  'New Building (CEA Building)',
  'New Elementary Building',
  'SLC Canteen',
  'Old Elementary Building',
  'Conrado Dela Cruz Sports Center (CDC)',
  'Senior High School Department Building',
  'HM Laboratory Building',
  'Student Affairs Office Lobby',
  'Parking Area',
  'Junior High School',
  'High School Library & ICT',
  'Others',
];

const MAX_IMAGES = 3;

const MAX_LOST_LOCATIONS = 3;

const SCHOOL_EMAIL_DOMAIN = '@slc-sflu.edu.ph';
const ID_NUMBER_MAX_LENGTH = 8;

const ACTION_BUTTONS_BOTTOM_RESERVE = 12;

const KEYBOARD_SCROLL_SUPPRESS_MS = 400;

const BOTTOM_THRESHOLD = 40;
// Breathing room kept above and below an open preset / answer list when it
// is scrolled into view.
const DROPDOWN_SCROLL_MARGIN = 16;
// Delay before measuring a freshly opened list, so it has mounted and any
// keyboard that was closing has finished resizing the form.
const DROPDOWN_MEASURE_DELAY_MS = 150;

const DROPDOWN_LIST_MAX_HEIGHT = 176;

// Tallest the Area list can get (about 5 rows) before it scrolls inside
// itself — the full campus list is too long to show all at once.
const AREA_LIST_MAX_HEIGHT = 224;

const PRESET_POLL_INTERVAL_MS = 10000;

// ─── Question Bank categories ──────────────────────────────────────────────
// A Question Bank question can be tagged with several categories (the
// `categories` list, e.g. ["ID", "Bags & Wallets", "Electronic"]). The
// single `category` field only holds the FIRST of them and is kept for
// older data, so it must not be used to decide where a question applies.
// Older questions without `categories` fall back to `category`, where an
// empty value or "General" meant every category.

// Every category a question applies to.
function questionCategories(q) {
  if (Array.isArray(q?.categories) && q.categories.length) return q.categories;
  const one = String(q?.category || '').trim();
  if (!one || ['general', 'all'].includes(one.toLowerCase())) return CATEGORIES;
  return [one];
}

// Shared questions (Default questions, or ones tagged for every category)
// are offered for any item, even before a Category is picked.
function isSharedQuestion(q) {
  if (typeof q !== 'object' || !q) return true;
  if (q.is_default) return true;
  const cats = questionCategories(q);
  return CATEGORIES.every((cat) => cats.includes(cat));
}

// True when a question applies to the selected item category.
function questionFitsCategory(q, category) {
  if (typeof q !== 'object' || !q) return true;
  if (isSharedQuestion(q)) return true;
  return Boolean(category) && questionCategories(q).includes(category);
}

// Every Surrendered item must have all of these question/answer slots filled.
const VERIFICATION_SLOTS = [1, 2, 3, 4];

// Readable names for the fields the server may reject, shown in front of
// its message when saving fails.
const FIELD_LABELS = {
  title: 'Item name',
  category: 'Category',
  location: 'Area',
  student_id: 'ID number',
  start_date: 'Start date',
  start_time: 'Start time',
  end_date: 'End date',
  end_time: 'End time',
  description: 'Description',
  image: 'Photo',
};

// Pulls the first readable message out of the server's error response,
// whichever field it is attached to.
const getServerErrorMessage = (data) => {
  if (!data || typeof data !== 'object') return '';

  if (typeof data.detail === 'string') return data.detail;
  if (typeof data.error === 'string') return data.error;

  for (const [field, value] of Object.entries(data)) {
    const text = Array.isArray(value)
      ? value.find((entry) => typeof entry === 'string')
      : typeof value === 'string'
      ? value
      : '';

    if (text) {
      if (field === 'non_field_errors') return text;
      return `${FIELD_LABELS[field] || field}: ${text}`;
    }
  }

  return '';
};

const today = () => new Date().toISOString().slice(0, 10);
const currentTime = () => new Date().toTimeString().slice(0, 5);

const isValidDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  const [year, month, day] = value.split('-').map(Number);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
};

const isValidTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const formatPickerTime = (value) =>
  `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;

const pickerValueFromString = (value, mode) => {
  const pickerValue = new Date();
  if (mode === 'date') {
    const [year, month, day] = value.split('-').map(Number);
    pickerValue.setFullYear(year, month - 1, day);
  } else {
    const [hours, minutes] = value.split(':').map(Number);
    pickerValue.setHours(hours, minutes, 0, 0);
  }
  return pickerValue;
};

// Local-date helpers for the 'YYYY-MM-DD' values this form stores — kept in local time (not UTC) so a picked date never shifts a day in time zones ahead of UTC (e.g. the Philippines, UTC+8), the way `new Date("YYYY-MM-DD")`/`toISOString()` would.
const parseDateOnly = (value) => {
  if (!value || typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const formatDateOnly = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const isSameDay = (first, second) =>
  first.getFullYear() === second.getFullYear() &&
  first.getMonth() === second.getMonth() &&
  first.getDate() === second.getDate();

const getCalendarDays = (month) => {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return Array.from({ length: firstDay + daysInMonth }, (_, index) =>
    index < firstDay ? null : new Date(month.getFullYear(), month.getMonth(), index - firstDay + 1)
  );
};

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: currentYear - 2020 + 1 }, (_, i) => 2020 + i);

// Normalizes a getUsers()-style API response into a plain array, whether the
// backend returns a bare array or a DRF paginated `{ results: [...] }`
// envelope, and whether or not it is wrapped in an axios `{ data }` response.
const toArray = (response) => {
  const payload = response?.data ?? response;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  return [];
};

// True when an account is an Admin or Moderator. Staff can't be entered as
// the reporter of an item. The role is read from whichever field the
// backend sends (role, user_role, account_type, user_type), plus Django's
// is_superuser / is_staff flags and group names.
const STAFF_ROLES = ['admin', 'administrator', 'moderator', 'superadmin', 'super admin'];

const isStaffAccount = (user) => {
  if (!user) return false;
  if (user.is_superuser === true || user.is_staff === true) return true;

  const roles = [user.role, user.user_role, user.account_type, user.user_type]
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim().toLowerCase());
  if (roles.some((value) => STAFF_ROLES.includes(value))) return true;

  const groups = Array.isArray(user.groups) ? user.groups : [];
  return groups.some((group) =>
    STAFF_ROLES.includes(
      String(typeof group === 'string' ? group : group?.name || '').trim().toLowerCase()
    )
  );
};

export default function AddItems({ onClose }) {
  const insets = useSafeAreaInsets();
  const { handleScroll, hideTabBar } = useTabBarVisibility();
  const formScrollRef = useRef(null);
  const itemNameOtherInputRef = useRef(null);
  const otherLocationInputRef = useRef(null);
  const firstNameInputRef = useRef(null);
  const lastNameInputRef = useRef(null);
  const idNumberInputRef = useRef(null);
  const descriptionInputRef = useRef(null);
  const questionInputRefs = useRef([null, null, null, null]);
  const answerInputRefs = useRef([null, null, null, null]);

  const [reportType, setReportType] = useState('Lost');
  const [itemName, setItemName] = useState('');
  const [itemNameOther, setItemNameOther] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [category, setCategory] = useState('');

  // ID number lookup against registered accounts (User Management).
  // 'idle' | 'loading' | 'found' | 'notfound' | 'staff' | 'error'
  // 'staff' = the ID belongs to an Admin or Moderator account, which can't
  // be entered: the name is NOT filled in and the item can't be submitted.
  const [lookupStatus, setLookupStatus] = useState('idle');
  // True when the name currently in the form was put there by the lookup
  // (not typed by staff), so changing the ID only ever wipes OUR auto-fill.
  const autoFilledRef = useRef(false);

  // Multi-select for Lost (1–3 locations); Surrendered keeps a single
  // selected location. Always an array so both flows share one dropdown
  // implementation — see handleToggleArea below.
  const [selectedAreas, setSelectedAreas] = useState([]);
  const [otherLocation, setOtherLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [itemNameOpen, setItemNameOpen] = useState(false);
  const [areaOpen, setAreaOpen] = useState(false);

  // Ownership verification questions — only used/shown for Surrendered
  // items, where all four question+answer pairs are required. Staff can
  // either type a question+answer manually or pick a preset from the
  // Question Bank; if that preset has predefined answer choices, the answer
  // field becomes a picker of those choices instead of free text (see
  // ClaimModal.jsx / FoundItems.jsx on the web admin panel for the matching
  // behavior).
  const [verificationQuestion1, setVerificationQuestion1] = useState('');
  const [verificationAnswer1, setVerificationAnswer1] = useState('');
  const [verificationQuestion2, setVerificationQuestion2] = useState('');
  const [verificationAnswer2, setVerificationAnswer2] = useState('');
  const [verificationQuestion3, setVerificationQuestion3] = useState('');
  const [verificationAnswer3, setVerificationAnswer3] = useState('');
  const [verificationQuestion4, setVerificationQuestion4] = useState('');
  const [verificationAnswer4, setVerificationAnswer4] = useState('');

  // Set to true once staff try to add a Surrendered item with empty
  // question/answer fields, so those fields get a red border and a
  // "required" note until they are filled in.
  const [showVerificationErrors, setShowVerificationErrors] = useState(false);

  // Question Bank presets, loaded from GET /questions/ (see the effect below).
  const [presetQuestions, setPresetQuestions] = useState([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [presetsError, setPresetsError] = useState(false);
  const [presetOpenIndex, setPresetOpenIndex] = useState(null);
  const [answerOpenIndex, setAnswerOpenIndex] = useState(null);

  const [picker, setPicker] = useState(null);
  const [pickerValue, setPickerValue] = useState(new Date());
  const [pickerMonth, setPickerMonth] = useState(new Date());

  const [monthYearPickerVisible, setMonthYearPickerVisible] = useState(false);
  const [selectedTempMonth, setSelectedTempMonth] = useState(new Date().getMonth());
  const [selectedTempYear, setSelectedTempYear] = useState(new Date().getFullYear());

  const [feedback, setFeedback] = useState(null);
  const [preserveHiddenTab, setPreserveHiddenTab] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const closeDropdowns = () => {
    setCategoryOpen(false);
    setItemNameOpen(false);
    setAreaOpen(false);
    setPresetOpenIndex(null);
    setAnswerOpenIndex(null);
  };

  const showFeedback = (title, message, tone = 'error', onCloseCallback) => {
    setFeedback({ title, message, tone, onClose: onCloseCallback });
  };

  const closeFeedback = () => {
    const afterClose = feedback?.onClose;
    setFeedback(null);
    afterClose?.();
  };

  // ─── ID number lookup ─────────────────────────────────────────────────────
  // As soon as the ID number reaches 8 digits, look the account up in User
  // Management (keyed by <digits>@slc-sflu.edu.ph — same convention as the
  // web admin's FoundItems.jsx).
  //   • Registered   → ID border turns green, first/last name are filled from
  //                    the account and locked (not editable).
  //   • Not found    → ID border turns red, and first/last name show a notice
  //                    that they must be entered manually.
  //   • Admin / Moderator → ID border turns red with a warning, the name is
  //                    NOT filled in, the name fields stay locked and empty,
  //                    and the item can't be submitted with this ID.
  //   • Lookup fails → no colors; names stay editable so staff are never
  //                    blocked behind fields we couldn't fill.
  useEffect(() => {
    if (idNumber.length !== ID_NUMBER_MAX_LENGTH) {
      setLookupStatus('idle');
      if (autoFilledRef.current) {
        autoFilledRef.current = false;
        setFirstName('');
        setLastName('');
      }
      return;
    }

    let cancelled = false;
    setLookupStatus('loading');

    const timer = setTimeout(async () => {
      try {
        const users = toArray(await getUsers());
        if (cancelled) return;

        const email = `${idNumber}${SCHOOL_EMAIL_DOMAIN}`.toLowerCase();
        const match = users.find((u) => (u.email || '').toLowerCase() === email);

        if (match && isStaffAccount(match)) {
          // Never show or fill a staff account's name.
          autoFilledRef.current = false;
          setFirstName('');
          setLastName('');
          setLookupStatus('staff');
        } else if (match) {
          autoFilledRef.current = true;
          setFirstName(match.first_name || '');
          setLastName(match.last_name || '');
          setLookupStatus('found');
        } else {
          if (autoFilledRef.current) {
            autoFilledRef.current = false;
            setFirstName('');
            setLastName('');
          }
          setLookupStatus('notfound');
        }
      } catch (error) {
        if (cancelled) return;
        console.error('ID lookup failed:', error?.response?.data || error?.message);
        setLookupStatus('error');
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [idNumber]);

  // ─── Question Bank: "real-time" loading ───────────────────────────────────
  // The Question Bank is fetched (the same call the web admin's
  // QuestionBank.jsx makes) and then kept fresh three ways, so questions
  // added in the web admin appear here almost immediately:
  //   1. right away when staff switch to Surrendered,
  //   2. every PRESET_POLL_INTERVAL_MS while the Surrendered form is open,
  //   3. whenever the app returns to the foreground, and every time the
  //      "Use preset" list is opened (see the button's onPress below).
  // Category filtering happens client-side in visiblePresetQuestions.
  const mountedRef = useRef(true);
  const presetsFetchingRef = useRef(false);
  const presetsLoadedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // silent = true refreshes in the background: no spinner, and a failed
  // refresh keeps showing the last good list instead of flipping to the
  // offline fallback.
  const fetchPresetQuestions = useCallback(async ({ silent = false } = {}) => {
    if (presetsFetchingRef.current) return; // a request is already in flight
    presetsFetchingRef.current = true;
    if (!silent) setPresetsLoading(true);

    try {
      const res = await getQuestionBank();
      const payload = res?.data ?? res;
      // Handles both a plain array and DRF pagination's {results: [...]}
      const list = Array.isArray(payload) ? payload : payload?.results;
      if (!Array.isArray(list)) throw new Error('Unexpected question bank response');

      if (!mountedRef.current) return;

      const next = list
        .map((q) => ({ ...q, options: Array.isArray(q.options) ? q.options : [] }))
        // Shared (Default / every-category) questions first, then the
        // category-specific ones.
        .sort((a, b) => (isSharedQuestion(a) ? 0 : 1) - (isSharedQuestion(b) ? 0 : 1));

      // Keep the same array reference when nothing changed, so background
      // polls don't cause needless re-renders or re-run the stale-answer
      // effect below.
      setPresetQuestions((prev) =>
        JSON.stringify(prev) === JSON.stringify(next) ? prev : next
      );
      presetsLoadedRef.current = true;
      setPresetsError(false);
    } catch (error) {
      console.error('Failed to load question bank:', error);
      if (!mountedRef.current) return;
      // Only fall back to the offline set if we've never loaded the real
      // list. After a successful load, keep the last good list.
      if (!presetsLoadedRef.current) {
        setPresetsError(true);
        setPresetQuestions(FALLBACK_PRESETS);
      }
    } finally {
      presetsFetchingRef.current = false;
      if (mountedRef.current && !silent) setPresetsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (reportType !== 'Surrendered') return;

    // Show the spinner only on the very first load; later loads are silent.
    fetchPresetQuestions({ silent: presetsLoadedRef.current });

    const interval = setInterval(
      () => fetchPresetQuestions({ silent: true }),
      PRESET_POLL_INTERVAL_MS
    );
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchPresetQuestions({ silent: true });
    });

    return () => {
      clearInterval(interval);
      appStateSub.remove();
    };
  }, [reportType, fetchPresetQuestions]);

  // Small lookup maps so the 4 verification question/answer slots can be
  // rendered and updated in a loop below instead of 4 near-identical blocks.
  const verificationQuestionValues = {
    1: verificationQuestion1,
    2: verificationQuestion2,
    3: verificationQuestion3,
    4: verificationQuestion4,
  };
  const setVerificationQuestionValue = {
    1: setVerificationQuestion1,
    2: setVerificationQuestion2,
    3: setVerificationQuestion3,
    4: setVerificationQuestion4,
  };
  const verificationAnswerValues = {
    1: verificationAnswer1,
    2: verificationAnswer2,
    3: verificationAnswer3,
    4: verificationAnswer4,
  };
  const setVerificationAnswerValue = {
    1: setVerificationAnswer1,
    2: setVerificationAnswer2,
    3: setVerificationAnswer3,
    4: setVerificationAnswer4,
  };

  // Only shared presets plus ones tagged for the currently selected
  // Category are offered — same visibility rule as the web admin panel.
  // A question tagged with several categories shows for each of them.
  const visiblePresetQuestions = presetQuestions.filter((qObj) =>
    questionFitsCategory(qObj, category)
  );

  // If the given question text exactly matches a Question Bank preset that
  // has its own predefined answer choices, return that list; otherwise null
  // (meaning the answer should be free text). The entry for the selected
  // Category wins over a General entry with the same text, since the server
  // doesn't guarantee ordering.
  const getAnswerOptionsForQuestion = (questionText) => {
    const trimmed = (questionText || '').trim();
    if (!trimmed) return null;

    const candidates = presetQuestions.filter(
      (qObj) =>
        typeof qObj === 'object' &&
        typeof qObj.text === 'string' &&
        qObj.text.trim().toLowerCase() === trimmed.toLowerCase()
    );
    const match =
      candidates.find(
        (qObj) => !isSharedQuestion(qObj) && questionFitsCategory(qObj, category)
      ) ||
      candidates.find((qObj) => isSharedQuestion(qObj)) ||
      candidates[0];

    if (match && Array.isArray(match.options) && match.options.length > 0) {
      return match.options;
    }
    return null;
  };

  // Verification questions only apply to Surrendered items — clear them out
  // if the staff switches the toggle back to Lost so stale data never gets
  // submitted with a Lost report.
  useEffect(() => {
    if (reportType !== 'Surrendered') {
      setVerificationQuestion1('');
      setVerificationAnswer1('');
      setVerificationQuestion2('');
      setVerificationAnswer2('');
      setVerificationQuestion3('');
      setVerificationAnswer3('');
      setVerificationQuestion4('');
      setVerificationAnswer4('');
      setShowVerificationErrors(false);
    }
  }, [reportType]);

  // If Category, a question's text, or the loaded presets change, the
  // predefined answer list for that question can change (or disappear).
  // Clear a previously chosen answer if it's no longer one of the valid
  // choices, instead of silently submitting a stale answer.
  useEffect(() => {
    if (reportType !== 'Surrendered') return;
    VERIFICATION_SLOTS.forEach((n) => {
      const options = getAnswerOptionsForQuestion(verificationQuestionValues[n]);
      const currentAnswer = verificationAnswerValues[n];
      if (options && currentAnswer && !options.includes(currentAnswer)) {
        setVerificationAnswerValue[n]('');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    reportType,
    category,
    presetQuestions,
    verificationQuestion1,
    verificationQuestion2,
    verificationQuestion3,
    verificationQuestion4,
  ]);

  // "Date lost (To)" can only start the day after "Date lost (From)" — returns null until a From date has been chosen.
  const getMinEndDate = () => {
    const from = parseDateOnly(startDate);
    if (!from) return null;
    from.setDate(from.getDate() + 1);
    return from;
  };

  // A calendar day is unavailable when it's in the future, or — for the End date field — on or before the selected Start date.
  const isPickerDateDisabled = (date, field) => {
    const day = startOfDay(date);
    if (day > startOfDay(new Date())) return true;
    if (field === 'endDate') {
      const minEnd = getMinEndDate();
      if (minEnd && day < minEnd) return true;
    }
    return false;
  };

  const openPicker = (field, mode, value) => {
    Keyboard.dismiss();
    closeDropdowns();

    if (field === 'endDate') {
      if (!startDate) {
        showFeedback('Notice', 'Please select the start date first.', 'error');
        return;
      }
      // "To" must be after "From" and can't be in the future, so a From date of today leaves no valid To date at all.
      const minEnd = getMinEndDate();
      if (minEnd && minEnd > startOfDay(new Date())) {
        showFeedback(
          'Notice',
          'The end date must be after the start date and cannot be in the future. Choose an earlier start date.',
          'error'
        );
        return;
      }
    }
    if (field === 'endTime' && !startTime) {
      showFeedback('Notice', 'Please select the start time first.', 'error');
      return;
    }
    // The time range is one window within a single day, so "To" must be
    // later than "From" on the same clock — nothing is left after 23:59.
    if (field === 'endTime' && startTime >= '23:59') {
      showFeedback(
        'Notice',
        'There is no later time on the same day. Choose an earlier start time.',
        'error'
      );
      return;
    }

    let initialValue;
    if (mode === 'date') {
      if (value) {
        initialValue = parseDateOnly(value) || new Date();
      } else if (field === 'endDate') {
        initialValue = getMinEndDate() || new Date();
      } else {
        initialValue = new Date();
      }
    } else {
      initialValue = pickerValueFromString(value || currentTime(), 'time');
      if (!value && field === 'endTime' && startTime) {
        // Suggest one hour after "From", but never past 23:59 (the range
        // stays inside one day).
        const [hours, minutes] = startTime.split(':').map(Number);
        if (hours >= 23) initialValue.setHours(23, 59);
        else initialValue.setHours(hours + 1, minutes);
      }
    }

    setPickerValue(initialValue);
    if (mode === 'date') {
      setPickerMonth(new Date(initialValue.getFullYear(), initialValue.getMonth(), 1));
    }
    setPicker({ field, mode });
  };

  const changePickerMonth = (amount) => {
    setPickerMonth((current) => {
      const next = new Date(current.getFullYear(), current.getMonth() + amount, 1);
      return next > new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        ? current
        : next;
    });
  };

  const selectPickerDate = (date) => {
    setPickerValue((current) => {
      const next = new Date(current);
      next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
      return next;
    });
  };

  const applyPickerValue = () => {
    if (!picker) return;
    const { field, mode } = picker;

    if (mode === 'date') {
      // Never accept a day the calendar shows as unavailable.
      if (isPickerDateDisabled(pickerValue, field)) return;

      const formatted = formatDateOnly(pickerValue);
      if (field === 'startDate') {
        setStartDate(formatted);
        if (endDate && endDate <= formatted) {
          setEndDate('');
        }
      } else if (field === 'endDate') {
        setEndDate(formatted);
      }
    } else {
      const formatted = formatPickerTime(pickerValue);
      // TIME RANGE RULE: the From–To times are one window within a single
      // day, whatever dates were picked. Oct 11–12 with 11:00–15:00 means
      // "around 11 AM to 3 PM on Oct 11 or Oct 12", so "To" must always be
      // later than "From", even when the dates differ.
      if (field === 'startTime') {
        setStartTime(formatted);
        // A "To" time that is no longer after the new "From" is cleared.
        if (endTime && endTime <= formatted) {
          setEndTime('');
        }
      } else if (field === 'endTime') {
        if (startTime && formatted <= startTime) {
          setPicker(null);
          showFeedback(
            'Invalid time',
            `"Time lost (To)" must be later than "Time lost (From)" (${startTime}). The time range is within a single day.`,
            'error'
          );
          return;
        }
        setEndTime(formatted);
      }
    }

    setPicker(null);
  };

  const openMonthYearPicker = () => {
    setSelectedTempMonth(pickerMonth.getMonth());
    setSelectedTempYear(pickerMonth.getFullYear());
    setMonthYearPickerVisible(true);
  };

  // For the End date picker, don't land on a month that is entirely before the first selectable day.
  const applyMonthYearSelection = () => {
    const next = new Date(selectedTempYear, selectedTempMonth, 1);
    setPickerMonth(minPickerMonth && next < minPickerMonth ? minPickerMonth : next);
    setMonthYearPickerVisible(false);
  };

  // Toggles a location in/out of selectedAreas. Lost items may pick up to
  // MAX_LOST_LOCATIONS; Surrendered items stay single-select (picking a new
  // area replaces whatever was selected and closes the dropdown), matching
  // the prior single-select behavior for that flow.
  const handleToggleArea = (loc) => {
    if (reportType === 'Lost') {
      setSelectedAreas((prev) => {
        let next;
        if (prev.includes(loc)) {
          next = prev.filter((item) => item !== loc);
        } else {
          if (prev.length >= MAX_LOST_LOCATIONS) {
            showFeedback('Limit reached', `You can select up to ${MAX_LOST_LOCATIONS} locations.`, 'error');
            return prev;
          }
          next = [...prev, loc];
        }
        if (next.length === MAX_LOST_LOCATIONS) {
          setAreaOpen(false);
        }
        return next;
      });
    } else {
      setSelectedAreas([loc]);
      setAreaOpen(false);
    }
  };

  const saveSelectedPhotos = (assets) => {
    setPhotos((current) =>
      [...current, ...assets.map((asset) => asset.uri)].slice(0, 3)
    );
    requestAnimationFrame(() => {
      formScrollRef.current?.scrollToEnd({ animated: true });
      setTimeout(() => setPreserveHiddenTab(false), 350);
    });
  };

  // Ref to whichever text field is currently focused, plus a mirror of
  // keyboardHeight (refs read synchronously inside listener callbacks,
  // avoiding stale-state issues that state alone would have here).
  const focusedInputRef = useRef(null);
  const keyboardHeightRef = useRef(0);
  const suppressTabBarScrollUntilRef = useRef(0);

  // Live-measured ScrollView viewport height and total content height, kept
  // in refs (not state) since they're only read inside the scroll-handling
  // callback below and don't need to trigger re-renders.
  const scrollViewHeightRef = useRef(0);
  const contentHeightRef = useRef(0);
  // Current scroll position of the form, so an opened list can tell whether
  // it is already fully on screen.
  const scrollYRef = useRef(0);
  // Wrappers around each question's "Use preset" row + preset list, and
  // around each answer dropdown + its list (one per verification slot).
  const presetBlockRefs = useRef([null, null, null, null]);
  const answerBlockRefs = useRef([null, null, null, null]);

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
        // the Clear/Add buttons. Check directly against the measured
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

  // ─── Preset / answer lists: keep the opened list on screen ────────────────
  // When "Use preset" (or an answer dropdown) is opened, the form scrolls
  // just enough to show the button together with its whole list, so the
  // questions can be browsed without the list hiding below the screen or
  // behind the tab bar. Nothing moves if the list is already fully visible,
  // and the button itself is never pushed off the top.
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
          targetY = Math.min(bottomEdge - viewportHeight, topEdge);
        }
        targetY = Math.max(targetY, 0);
        if (targetY === currentY) return;

        scrollNode.scrollTo({ y: targetY, animated: true });

        // Landing near the end of the form: keep the tab bar from covering
        // the list (same rule as the keyboard handling below).
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

  // A preset list was opened -> bring it into view.
  useEffect(() => {
    if (presetOpenIndex === null) return undefined;
    const timer = setTimeout(
      () => scrollDropdownIntoView(presetBlockRefs.current[presetOpenIndex - 1]),
      DROPDOWN_MEASURE_DELAY_MS
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetOpenIndex]);

  // An answer list was opened -> bring it into view.
  useEffect(() => {
    if (answerOpenIndex === null) return undefined;
    const timer = setTimeout(
      () => scrollDropdownIntoView(answerBlockRefs.current[answerOpenIndex - 1]),
      DROPDOWN_MEASURE_DELAY_MS
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerOpenIndex]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      const height = event?.endCoordinates?.height ?? 0;
      keyboardHeightRef.current = height;
      setKeyboardHeight(height);
      suppressTabBarScrollUntilRef.current = Date.now() + KEYBOARD_SCROLL_SUPPRESS_MS;
      requestAnimationFrame(scrollFocusedInputAboveKeyboard);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      keyboardHeightRef.current = 0;
      setKeyboardHeight(0);
      suppressTabBarScrollUntilRef.current = Date.now() + KEYBOARD_SCROLL_SUPPRESS_MS;
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // inputRef is a React ref pointing at the TextInput being focused (see
  // itemNameOtherInputRef / otherLocationInputRef / firstNameInputRef /
  // lastNameInputRef / descriptionInputRef below). Registering it here lets
  // keyboardDidShow re-scroll to it once the keyboard has actually finished
  // animating in, and also lets us scroll immediately if the keyboard is
  // already open (e.g. jumping straight from one field to another).
  const scrollFocusedInputIntoView = (inputRef) => {
    focusedInputRef.current = inputRef.current;
    if (keyboardHeightRef.current > 0) {
      requestAnimationFrame(scrollFocusedInputAboveKeyboard);
    }
  };

  const selectFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showFeedback(
        'Permission required',
        'Allow photo-library access to select photos.',
        'error',
        () => setPreserveHiddenTab(false)
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 3 - photos.length,
      quality: 0.8,
    });
    if (!result.canceled) saveSelectedPhotos(result.assets);
  };

  const captureWithCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showFeedback(
        'Permission required',
        'Allow camera access to capture photo.',
        'error',
        () => setPreserveHiddenTab(false)
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled) saveSelectedPhotos(result.assets);
  };

  const reset = () => {
    setItemName('');
    setItemNameOther(false);
    autoFilledRef.current = false;
    setLookupStatus('idle');
    setFirstName('');
    setLastName('');
    setIdNumber('');
    setCategory('');
    setSelectedAreas([]);
    setOtherLocation('');
    setStartDate('');
    setEndDate('');
    setStartTime('');
    setEndTime('');
    setDescription('');
    setPhotos([]);
    setVerificationQuestion1('');
    setVerificationAnswer1('');
    setVerificationQuestion2('');
    setVerificationAnswer2('');
    setVerificationQuestion3('');
    setVerificationAnswer3('');
    setVerificationQuestion4('');
    setVerificationAnswer4('');
    setShowVerificationErrors(false);
    setPreserveHiddenTab(false);
    closeDropdowns();
    setPicker(null);
    // Bring the form back to the very top, so after a successful add (or a
    // manual Clear) the next report starts from a clean, fully-visible
    // state instead of leaving the user scrolled down wherever they were.
    formScrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  // When the user leaves this tab, wipe the form and return the toggle to the
  // default ("Lost"), whichever report type was active. The cleanup below runs
  // when the screen loses focus.
  useFocusEffect(
    useCallback(() => {
      return () => {
        Keyboard.dismiss();
        setReportType('Lost');
        reset();
        setFeedback(null);
        setPhotoModalVisible(false);
        setMonthYearPickerVisible(false);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const submit = async () => {
    // Don't submit while the ID lookup is still in flight — the name fields
    // may be about to be auto-filled/locked.
    if (lookupStatus === 'loading') {
      showFeedback('Please wait', 'Still checking this ID number. Try again in a moment.', 'error');
      return;
    }

    // Admin and Moderator ID numbers can't be entered as the reporter.
    if (lookupStatus === 'staff') {
      showFeedback(
        'ID number not allowed',
        'This ID number belongs to an Admin or Moderator account. Admins and moderators are not valid reporters. Please enter the ID number of a student or employee.',
        'error'
      );
      return;
    }

    const formattedLocations = selectedAreas
      .map((loc) => (loc === 'Others' ? otherLocation.trim() : loc))
      .filter(Boolean)
      .join(', ');

    // Lost: 1–3 locations. Surrendered: exactly 1 (matches prior
    // single-select behavior for that flow).
    const hasValidAreaCount =
      reportType === 'Lost'
        ? selectedAreas.length >= 1 && selectedAreas.length <= MAX_LOST_LOCATIONS
        : selectedAreas.length === 1;

    // The start time is required too: the backend's start_time has no
    // blank value, so an item without one is rejected.
    if (
      !itemName.trim() ||
      !category ||
      !firstName.trim() ||
      !lastName.trim() ||
      !/^\d+$/.test(idNumber) ||
      !hasValidAreaCount ||
      (selectedAreas.includes('Others') && !otherLocation.trim()) ||
      !startDate.trim() ||
      !startTime.trim()
    ) {
      showFeedback(
        'Missing information',
        reportType === 'Lost'
          ? `Category, item name, first name, last name, ID number, 1–${MAX_LOST_LOCATIONS} locations, a date (From), and a time (From) are required.`
          : 'Category, item name, first name, last name, ID number, location, a date (From), and a time (From) are required.',
        'error'
      );
      return;
    }

    // The backend only accepts an ID number of exactly 8 digits on an item
    // (student_id in items/models.py).
    if (idNumber.length !== ID_NUMBER_MAX_LENGTH) {
      showFeedback(
        'Invalid ID number',
        `The ID number must be exactly ${ID_NUMBER_MAX_LENGTH} digits.`,
        'error'
      );
      return;
    }

    if (
      !isValidDate(startDate) ||
      startDate > today() ||
      (endDate && !isValidDate(endDate)) ||
      (endDate && startDate > endDate) ||
      (endDate && endDate > today())
    ) {
      showFeedback(
        'Invalid date',
        'Use YYYY-MM-DD. Dates cannot be in the future, and the start date must be on or before the end date (if provided).',
        'error'
      );
      return;
    }

    if (!isValidTime(startTime) || (endTime && !isValidTime(endTime))) {
      showFeedback('Invalid time', 'Use HH:MM in 24-hour format.', 'error');
      return;
    }

    // The time range is one window within a single day (see applyPickerValue).
    if (endTime && endTime <= startTime) {
      showFeedback(
        'Invalid time',
        '"Time lost (To)" must be later than "Time lost (From)". The time range is within a single day.',
        'error'
      );
      return;
    }

    // Surrendered items must have ALL ownership verification questions
    // filled in — every slot needs both a question and its correct answer.
    if (reportType === 'Surrendered') {
      const incompleteSlots = VERIFICATION_SLOTS.filter(
        (n) =>
          !(verificationQuestionValues[n] || '').trim() ||
          !(verificationAnswerValues[n] || '').trim()
      );

      if (incompleteSlots.length > 0) {
        setShowVerificationErrors(true);
        showFeedback(
          'Verification questions required',
          `All ${VERIFICATION_SLOTS.length} ownership verification questions and their correct answers are required. Please complete Question ${incompleteSlots.join(', ')}.`,
          'error'
        );
        return;
      }
    }

    const formData = new FormData();
    formData.append('title', itemName.trim());
    formData.append('first_name', firstName.trim());
    formData.append('last_name', lastName.trim());
    formData.append('poster_name', `${firstName.trim()} ${lastName.trim()}`);
    formData.append('student_id', idNumber);
    formData.append('poster_email', `${idNumber}${SCHOOL_EMAIL_DOMAIN}`);
    formData.append('category', category);
    formData.append('location', formattedLocations);

    // When the item was lost or found, as a range. The backend model stores
    // this as start_date / start_time ("From") and the optional end_date /
    // end_time ("To"), so the "To" values are only sent when filled in.
    formData.append('start_date', startDate);
    formData.append('start_time', startTime);
    // The backend needs an end date whenever an end time is sent. With no
    // "To" date the time range is on the "From" day itself, so that day is
    // sent as the end date (a single day: 11:00-15:00 on that date).
    const sentEndDate = endDate || (endTime ? startDate : '');
    if (sentEndDate) formData.append('end_date', sentEndDate);
    if (endTime) formData.append('end_time', endTime);

    // The same values under the older created_* names, in case the server
    // still reads those. A backend that only knows the new names ignores these.
    formData.append('created_date', startDate);
    formData.append('created_time', startTime);
    if (sentEndDate) formData.append('created_date_to', sentEndDate);
    if (endTime) formData.append('created_time_to', endTime);

    formData.append('description', description.trim());
    formData.append('type', reportType);
    formData.append('status', 'Approved');

    // Ownership verification questions only apply to Surrendered items.
    // verification_options_N carries the linked predefined answer choices
    // (if any) as a JSON string, so the claim flow can render them as a
    // dropdown for the claimant — same convention used by the web admin
    // panel's ItemModal / ClaimModal.
    if (reportType === 'Surrendered') {
      VERIFICATION_SLOTS.forEach((n) => {
        const questionText = (verificationQuestionValues[n] || '').trim();
        const answerText = (verificationAnswerValues[n] || '').trim();
        const options = getAnswerOptionsForQuestion(questionText);
        formData.append(`verification_question_${n}`, questionText);
        formData.append(`verification_answer_${n}`, answerText);
        formData.append(
          `verification_options_${n}`,
          options && options.length > 0 ? JSON.stringify(options) : ''
        );
      });
    }

    photos.forEach((uri, index) => {
      formData.append('image', {
        uri,
        name: `item-${index + 1}.jpg`,
        type: 'image/jpeg',
      });
    });

    setSaving(true);

    try {
      await createLostItem(formData);

      // Close the loading overlay before the result modal opens, since iOS can drop a second modal.
      setSaving(false);
      showFeedback(
        'Saved',
        `${reportType} item added successfully.`,
        'success',
        () => {
          reset();
        }
      );
    } catch (error) {
      console.error(
        'Create item failed:',
        error.response?.data,
        JSON.stringify(error.response?.data, null, 2) || error
      );
      setSaving(false);
      // Shows the server's own reason (which field it rejected and why)
      // when there is one, instead of only a generic message.
      showFeedback(
        'Save failed',
        getServerErrorMessage(error.response?.data) ||
          'Please check the form and try again.',
        'error'
      );
    } finally {
      setSaving(false);
    }
  };

  const inputContainerClass =
    'relative flex-row items-center overflow-hidden rounded-lg border border-slate-300 bg-white px-3';

  // ID lookup visuals: green border when the ID belongs to a registered
  // account, red when it doesn't, default otherwise.
  // Also locked (and left empty) for an Admin / Moderator ID.
  const nameLocked = lookupStatus === 'found' || lookupStatus === 'staff';

  const idContainerClass = inputContainerClass.replace(
    'border-slate-300',
    lookupStatus === 'found'
      ? 'border-emerald-500'
      : lookupStatus === 'notfound' || lookupStatus === 'staff'
      ? 'border-rose-500'
      : 'border-slate-300'
  );

  // Name fields: greyed out when locked to a registered account; red border
  // while the ID is unregistered and the field is still empty.
  const nameContainerClass = (value) =>
    inputContainerClass
      .replace('bg-white', nameLocked ? 'bg-slate-100' : 'bg-white')
      .replace(
        'border-slate-300',
        lookupStatus === 'notfound' && !value.trim() ? 'border-rose-400' : 'border-slate-300'
      );

  // Calendar limits for the picker currently open.
  const isEndDatePicker = picker?.mode === 'date' && picker.field === 'endDate';
  const minEndDateForPicker = isEndDatePicker ? getMinEndDate() : null;
  // First month that has any selectable day (null = no lower limit).
  const minPickerMonth = minEndDateForPicker
    ? new Date(minEndDateForPicker.getFullYear(), minEndDateForPicker.getMonth(), 1)
    : null;
  const canGoPrevMonth = !minPickerMonth || pickerMonth > minPickerMonth;
  const yearOptions = minPickerMonth
    ? YEARS.filter((year) => year >= minPickerMonth.getFullYear())
    : YEARS;
  // "Done" stays disabled while the highlighted day isn't selectable.
  const doneDisabled =
    picker?.mode === 'date' && isPickerDateDisabled(pickerValue, picker.field);

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-white"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
      <StatusBar style="light" backgroundColor="#1b2061" />

      {/* Header */}
      <SafeAreaView edges={['top']} className="rounded-b-3xl bg-[#1b2061]">
        <View className="px-4 pb-6 pt-2">
          <Text className="text-xs font-bold tracking-widest text-white/60">
            ADMIN
          </Text>
          <Text className="text-2xl font-bold text-white">Add Item</Text>
          <View className="mt-3 flex-row rounded-full bg-white/10 p-1">
            {['Lost', 'Surrendered'].map((type) => (
              <TouchableOpacity
                key={type}
                onPress={() => {
                  Keyboard.dismiss();
                  closeDropdowns();
                  setReportType(type);
                  // Switching flows changes location selection rules (multi
                  // vs single) — clear rather than carry over a selection
                  // that may no longer make sense for the new type.
                  setSelectedAreas([]);
                  setOtherLocation('');
                }}
                className={`flex-1 items-center rounded-full py-2 ${
                  reportType === type ? 'bg-white' : ''
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    reportType === type ? 'text-[#1b2061]' : 'text-white'
                  }`}
                >
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </SafeAreaView>

      {/* Form Content */}
      <ScrollView
        ref={formScrollRef}
        onLayout={(e) => {
          scrollViewHeightRef.current = e.nativeEvent.layout.height;
        }}
        onContentSizeChange={(w, h) => {
          contentHeightRef.current = h;
        }}
        onScroll={(event) => {
          // Always track the real position, so opened lists can tell
          // whether they're already on screen.
          scrollYRef.current = event.nativeEvent.contentOffset.y;
          if (preserveHiddenTab) return;
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
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Reporter Information */}
        <View className="mb-3 flex-row items-center">
          <View className="mr-2 h-4 w-1 rounded-full bg-[#1b2061]" />
          <Text className="text-sm font-bold text-[#16233F]">
            Reporter Details
          </Text>
        </View>

        {/* ID number — school email is the ID number + a fixed domain.
            Once 8 digits are entered, the account is looked up: green border
            if registered, red border if not. */}
        <View className="mb-4">
          <Text className="mb-1 text-sm font-semibold tracking-wide text-slate-500">
            ID number *
          </Text>
          <View className={idContainerClass}>
            <TextInput
              ref={idNumberInputRef}
              value={idNumber}
              onChangeText={(value) =>
                setIdNumber(value.replace(/\D/g, '').slice(0, ID_NUMBER_MAX_LENGTH))
              }
              onFocus={() => {
                closeDropdowns();
                scrollFocusedInputIntoView(idNumberInputRef);
              }}
              placeholder="12345678"
              placeholderTextColor="#9AA3B5"
              keyboardType="number-pad"
              maxLength={ID_NUMBER_MAX_LENGTH}
              className="h-11 flex-1 text-sm text-[#16233F]"
            />
            <Text className="ml-1 text-sm font-medium text-slate-500" numberOfLines={1}>
              {SCHOOL_EMAIL_DOMAIN}
            </Text>
          </View>

          {lookupStatus === 'loading' && (
            <Text className="mt-1 text-xs font-semibold text-slate-400">
              Checking this ID number…
            </Text>
          )}
          {lookupStatus === 'found' && (
            <View className="mt-1 flex-row items-center">
              <Text className="ml-1 flex-1 text-xs font-semibold text-emerald-700">
                Registered user found — name filled in from the account.
              </Text>
            </View>
          )}
          {lookupStatus === 'notfound' && (
            <View className="mt-1 flex-row items-center">
              <Text className="ml-1 flex-1 text-xs font-semibold text-rose-600">
                This ID number is not registered.
              </Text>
            </View>
          )}
          {lookupStatus === 'staff' && (
            <View className="mt-1.5 flex-row items-start rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2">
              <CircleAlert size={14} color="#E11D48" style={{ marginTop: 1 }} />
              <Text className="ml-1.5 flex-1 text-xs font-semibold leading-4 text-rose-700">
                This ID number belongs to an Admin or Moderator account. Admins and
                moderators are not valid to be entered — use the ID number of a
                student or employee.
              </Text>
            </View>
          )}
          {lookupStatus === 'error' && (
            <Text className="mt-1 text-xs font-medium text-amber-600">
              Couldn't check registration — enter the name manually.
            </Text>
          )}
        </View>

        <View className="mb-4 flex-row gap-3">
          <View className="flex-1">
            <Text className="mb-1 text-sm font-semibold tracking-wide text-slate-500">
              First name *
            </Text>
            <View
              className={nameContainerClass(firstName)}
              pointerEvents={nameLocked ? 'none' : 'auto'}
            >
              <TextInput
                ref={firstNameInputRef}
                value={firstName}
                onChangeText={setFirstName}
                editable={!nameLocked}
                selectTextOnFocus={false}
                onFocus={() => {
                  closeDropdowns();
                  scrollFocusedInputIntoView(firstNameInputRef);
                }}
                placeholder={
                  lookupStatus === 'loading'
                    ? 'Checking…'
                    : lookupStatus === 'staff'
                    ? 'Not allowed'
                    : 'Juan'
                }
                placeholderTextColor="#9AA3B5"
                className={`h-11 flex-1 text-sm ${
                  nameLocked ? 'text-slate-500' : 'text-[#16233F]'
                }`}
              />
            </View>
            {lookupStatus === 'notfound' && (
              <Text className="mt-1 text-xs font-semibold text-rose-600">
                Not registered — please enter the first name.
              </Text>
            )}
          </View>
          <View className="flex-1">
            <Text className="mb-1 text-sm font-semibold tracking-wide text-slate-500">
              Last name *
            </Text>
            <View
              className={nameContainerClass(lastName)}
              pointerEvents={nameLocked ? 'none' : 'auto'}
            >
              <TextInput
                ref={lastNameInputRef}
                value={lastName}
                onChangeText={setLastName}
                editable={!nameLocked}
                selectTextOnFocus={false}
                onFocus={() => {
                  closeDropdowns();
                  scrollFocusedInputIntoView(lastNameInputRef);
                }}
                placeholder={
                  lookupStatus === 'loading'
                    ? 'Checking…'
                    : lookupStatus === 'staff'
                    ? 'Not allowed'
                    : 'Dela Cruz'
                }
                placeholderTextColor="#9AA3B5"
                className={`h-11 flex-1 text-sm ${
                  nameLocked ? 'text-slate-500' : 'text-[#16233F]'
                }`}
              />
            </View>
            {lookupStatus === 'notfound' && (
              <Text className="mt-1 text-xs font-semibold text-rose-600">
                Not registered — please enter the last name.
              </Text>
            )}
          </View>
        </View>

        {/* Item Information */}
        <View className="mb-3 flex-row items-center">
          <View className="mr-2 h-4 w-1 rounded-full bg-[#1b2061]" />
          <Text className="text-sm font-bold text-[#16233F]">
            Item Details
          </Text>
        </View>

        {/* Category Dropdown */}
        <View className="mb-4">
          <Text className="mb-1 text-sm font-semibold tracking-wide text-slate-500">
            Category *
          </Text>
          <TouchableOpacity
            onPress={() => {
              Keyboard.dismiss();
              setCategoryOpen((open) => !open);
              setItemNameOpen(false);
              setAreaOpen(false);
            }}
            className="h-11 flex-row items-center justify-between rounded-lg border border-slate-300 bg-white px-3"
          >
            <Text
              className={`text-sm ${category ? 'text-[#16233F]' : 'text-slate-400'}`}
            >
              {category || 'Select category'}
            </Text>
            <ChevronDown size={18} color="#5B647A" />
          </TouchableOpacity>
          {categoryOpen && (
            <View className="mt-1 overflow-hidden rounded-lg border border-slate-300 bg-white">
              {CATEGORIES.map((item) => (
                <TouchableOpacity
                  key={item}
                  onPress={() => {
                    setCategory(item);
                    setItemName('');
                    setItemNameOther(false);
                    setCategoryOpen(false);
                  }}
                  className="border-b border-slate-100 px-3 py-3 last:border-b-0"
                >
                  <Text className="text-sm text-[#16233F]">{item}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Item Name Dropdown (depends on Category) */}
        <View className="mb-4">
          <Text className="mb-1 text-sm font-semibold tracking-wide text-slate-500">
            Item name *
          </Text>
          <TouchableOpacity
            disabled={!category}
            onPress={() => {
              Keyboard.dismiss();
              setItemNameOpen((open) => !open);
              setCategoryOpen(false);
              setAreaOpen(false);
            }}
            className={`relative h-11 flex-row items-center justify-between overflow-hidden rounded-lg border border-slate-300 px-3 ${
              category ? 'bg-white' : 'bg-slate-100'
            }`}
          >
            <Text
              className={`text-sm ${
                itemName && !itemNameOther ? 'text-[#16233F]' : 'text-slate-400'
              }`}
            >
              {itemName && !itemNameOther
                ? itemName
                : category
                ? 'Select item name'
                : 'Select a category first'}
            </Text>
            <ChevronDown size={18} color="#5B647A" />
          </TouchableOpacity>
          {itemNameOpen && (
            <View className="mt-1 max-h-56 overflow-hidden rounded-lg border border-slate-300 bg-white">
              <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
                {(ITEM_NAME_OPTIONS[category] || []).map((option) => (
                  <TouchableOpacity
                    key={option}
                    onPress={() => {
                      setItemName(option);
                      setItemNameOther(false);
                      setItemNameOpen(false);
                    }}
                    className="border-b border-slate-100 px-3 py-3"
                  >
                    <Text className="text-sm text-[#16233F]">{option}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  onPress={() => {
                    setItemName('');
                    setItemNameOther(true);
                    setItemNameOpen(false);
                  }}
                  className="px-3 py-3"
                >
                  <Text className="text-sm font-semibold text-[#1b2061]">
                    Others (please specify)
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}
          {itemNameOther && (
            <View className={`${inputContainerClass} mt-2`}>
              <TextInput
                ref={itemNameOtherInputRef}
                value={itemName}
                onChangeText={setItemName}
                onFocus={() => {
                  closeDropdowns();
                  scrollFocusedInputIntoView(itemNameOtherInputRef);
                }}
                placeholder="Please specify the item name"
                placeholderTextColor="#9AA3B5"
                className="h-11 flex-1 text-sm text-[#16233F]"
              />
            </View>
          )}
        </View>

        {/* Area Dropdown */}
        <View className="mb-4">
          <View className="mb-1 flex-row items-center justify-between">
            <Text className="text-sm font-semibold tracking-wide text-slate-500">
              {reportType === 'Lost' ? 'Area lost' : 'Area found'} *
            </Text>
            {reportType === 'Lost' && (
              <Text className="text-xs font-semibold text-slate-400">
                {selectedAreas.length}/{MAX_LOST_LOCATIONS} selected
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={() => {
              Keyboard.dismiss();
              setAreaOpen((open) => !open);
              setCategoryOpen(false);
              setItemNameOpen(false);
            }}
            className="h-11 flex-row items-center justify-between rounded-lg border border-slate-300 bg-white px-3"
          >
            {/* Before: <Text className="flex-1 text-sm text-[#16233F]" numberOfLines={1}> */}
            <Text
              className={`flex-1 text-sm ${
                selectedAreas.length > 0 ? 'text-black' : 'text-slate-400'
              }`}
              numberOfLines={1}
            >
              {selectedAreas.length > 0 ? selectedAreas.join(', ') : 'Select area'}
            </Text>
            <ChevronDown size={18} color="#5B647A" />
          </TouchableOpacity>

          {areaOpen && (
            // The full campus list is long, so it is capped in height and
            // scrolls inside itself. maxHeight sits on the ScrollView itself
            // (a wrapping View's maxHeight doesn't constrain a ScrollView
            // child), and nestedScrollEnabled lets it scroll on Android
            // inside the outer form ScrollView.
            <View className="mt-1 overflow-hidden rounded-lg border border-slate-300 bg-white">
              <ScrollView
                style={{ maxHeight: AREA_LIST_MAX_HEIGHT }}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
              >
                {AREAS.map((item) => {
                  const isSelected = selectedAreas.includes(item);
                  return (
                    <TouchableOpacity
                      key={item}
                      onPress={() => handleToggleArea(item)}
                      className="flex-row items-center justify-between border-b border-slate-100 px-3 py-3 last:border-b-0"
                    >
                      <Text
                        className={`mr-2 flex-1 text-sm ${
                          isSelected
                            ? 'font-bold text-[#1b2061]'
                            : 'text-[#16233F]'
                        }`}
                      >
                        {item}
                      </Text>
                      {isSelected && <Check size={16} color="#1b2061" />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {reportType === 'Lost' && selectedAreas.length >= MAX_LOST_LOCATIONS && (
            <Text className="mt-1.5 text-xs font-medium text-amber-600">
              Maximum limit of {MAX_LOST_LOCATIONS} locations reached.
            </Text>
          )}
        </View>

        {selectedAreas.includes('Others') && (
          <View className="mb-4">
            <Text className="mb-1 text-sm font-semibold tracking-wide text-slate-500">
              Other area *
            </Text>
            <View className={inputContainerClass}>
              <TextInput
                ref={otherLocationInputRef}
                value={otherLocation}
                onChangeText={setOtherLocation}
                onFocus={() => {
                  closeDropdowns();
                  scrollFocusedInputIntoView(otherLocationInputRef);
                }}
                placeholder="Enter the area"
                placeholderTextColor="#9AA3B5"
                className="h-11 flex-1 text-sm text-[#16233F]"
              />
            </View>
          </View>
        )}

        {/* Incident Details Section */}
        <View className="mb-3 flex-row items-center">
          <View className="mr-2 h-4 w-1 rounded-full bg-[#1b2061]" />
          <Text className="text-sm font-bold text-[#16233F]">
            Date and Time Details
          </Text>
        </View>

        {/* Date Row */}
        <View className="mb-4">
          <Text className="mb-2 text-sm font-semibold tracking-wide text-slate-500">
            Date lost <Text className="text-rose-600">*</Text>
          </Text>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="mb-1 text-xs font-medium text-slate-500">From *</Text>
              <TouchableOpacity
                onPress={() => openPicker('startDate', 'date', startDate)}
                className="h-11 flex-row items-center justify-between rounded-lg border border-slate-300 bg-white px-3"
              >
                <Text
                  className={`text-sm ${
                    startDate ? 'text-[#16233F]' : 'text-slate-400'
                  }`}
                >
                  {startDate || 'YYYY-MM-DD'}
                </Text>
                <ChevronDown size={18} color="#5B647A" />
              </TouchableOpacity>
            </View>

            <View className="flex-1">
              <Text className="mb-1 text-xs font-medium text-slate-500">To (optional)</Text>
              {/* The picker opens from the field; the × clears a "To" date
                  picked by mistake (it's optional). */}
              <View className="h-11 flex-row items-center rounded-lg border border-slate-300 bg-white">
                <TouchableOpacity
                  onPress={() => openPicker('endDate', 'date', endDate)}
                  className="h-11 flex-1 flex-row items-center justify-between pl-3 pr-2"
                >
                  <Text
                    className={`text-sm ${
                      endDate ? 'text-[#16233F]' : 'text-slate-400'
                    }`}
                  >
                    {endDate || 'YYYY-MM-DD'}
                  </Text>
                  {!endDate ? <ChevronDown size={18} color="#5B647A" /> : null}
                </TouchableOpacity>
                {endDate ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Clear the To date"
                    onPress={() => setEndDate('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    className="mr-2 h-7 w-7 items-center justify-center rounded-full bg-slate-100"
                  >
                    <X size={14} color="#5B647A" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>
        </View>

        {/* Time Row */}
        <View className="mb-4">
          <Text className="mb-2 text-sm font-semibold tracking-wide text-slate-500">
            Time lost <Text className="text-rose-600">*</Text>
          </Text>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Text className="mb-1 text-xs font-medium text-slate-500">From *</Text>
              <TouchableOpacity
                onPress={() => openPicker('startTime', 'time', startTime)}
                className="h-11 flex-row items-center justify-between rounded-lg border border-slate-300 bg-white px-3"
              >
                <Text
                  className={`text-sm ${
                    startTime ? 'text-[#16233F]' : 'text-slate-400'
                  }`}
                >
                  {startTime || 'HH:MM'}
                </Text>
                <ChevronDown size={18} color="#5B647A" />
              </TouchableOpacity>
            </View>

            <View className="flex-1">
              <Text className="mb-1 text-xs font-medium text-slate-500">To (optional)</Text>
              {/* The picker opens from the field; the × clears a "To" time
                  picked by mistake (it's optional). */}
              <View className="h-11 flex-row items-center rounded-lg border border-slate-300 bg-white">
                <TouchableOpacity
                  onPress={() => openPicker('endTime', 'time', endTime)}
                  className="h-11 flex-1 flex-row items-center justify-between pl-3 pr-2"
                >
                  <Text
                    className={`text-sm ${
                      endTime ? 'text-[#16233F]' : 'text-slate-400'
                    }`}
                  >
                    {endTime || 'HH:MM'}
                  </Text>
                  {!endTime ? <ChevronDown size={18} color="#5B647A" /> : null}
                </TouchableOpacity>
                {endTime ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Clear the To time"
                    onPress={() => setEndTime('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    className="mr-2 h-7 w-7 items-center justify-center rounded-full bg-slate-100"
                  >
                    <X size={14} color="#5B647A" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>
          <Text className="mt-1.5 text-[11px] text-slate-400">
            The time range is within one day and applies to every date above (e.g. 11:00–15:00 on
            either day). "To" must be later than "From".
          </Text>
        </View>

        <View className="mb-4">
          <Text className="mb-1 text-sm font-semibold tracking-wide text-slate-500">
            Description
          </Text>
          <View className="relative overflow-hidden rounded-lg border border-slate-300 bg-white px-3 py-2">
            <TextInput
              ref={descriptionInputRef}
              value={description}
              onChangeText={setDescription}
              onFocus={() => {
                closeDropdowns();
                scrollFocusedInputIntoView(descriptionInputRef);
              }}
              placeholder="Describe the item..."
              placeholderTextColor="#9AA3B5"
              multiline
              textAlignVertical="top"
              className="min-h-[100px] text-sm text-[#16233F]"
            />
          </View>
        </View>

        {/* Ownership Verification Questions — Surrendered items only */}
        {reportType === 'Surrendered' && (
          <View className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <Text className="mb-1 text-sm font-bold uppercase text-amber-800">
              Ownership Verification Questions * (all {VERIFICATION_SLOTS.length} required)
            </Text>
            <Text className="mb-3 text-xs text-amber-700">
              Every question needs both a question and its correct answer. Type them manually, or
              tap "Use preset" to pull one from the Question Bank. Presets with predefined answer
              choices turn the answer field into a picker of those same choices — the claimant
              will pick from that same list.
            </Text>

            {VERIFICATION_SLOTS.map((n) => {
              const questionValue = verificationQuestionValues[n];
              const setQuestionValue = setVerificationQuestionValue[n];
              const answerValue = verificationAnswerValues[n];
              const setAnswerValue = setVerificationAnswerValue[n];
              const answerOptions = getAnswerOptionsForQuestion(questionValue);

              // Red borders + "required" notes only appear after a failed
              // attempt to add the item, and clear as each field is filled.
              const questionMissing =
                showVerificationErrors && !(questionValue || '').trim();
              const answerMissing =
                showVerificationErrors && !(answerValue || '').trim();

              // Questions already filled in on the OTHER slots. A preset
              // with the same text can't be picked again here, so the same
              // question is never asked twice on one item.
              const questionsUsedElsewhere = VERIFICATION_SLOTS.filter((slot) => slot !== n)
                .map((slot) => (verificationQuestionValues[slot] || '').trim().toLowerCase())
                .filter(Boolean);

              return (
                <View
                  key={n}
                  className="mb-3 rounded-lg border border-amber-200 bg-white p-3 last:mb-0"
                >
                  {/* collapsable={false} keeps this wrapper a real native view
                      on Android, so it can be measured and scrolled into view
                      together with its open preset list. */}
                  <View
                    ref={(el) => {
                      presetBlockRefs.current[n - 1] = el;
                    }}
                    collapsable={false}
                  >
                  <View className="mb-2 flex-row items-center justify-between">
                    <Text className="text-xs font-bold uppercase text-amber-800">
                      Question {n} <Text className="text-rose-600">*</Text>
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        Keyboard.dismiss();
                        setAnswerOpenIndex(null);
                        // Opening the list: pull the latest questions right
                        // now so anything just added in the web admin shows.
                        if (presetOpenIndex !== n) fetchPresetQuestions({ silent: true });
                        setPresetOpenIndex((current) => (current === n ? null : n));
                      }}
                      className="rounded-md border border-amber-300 bg-amber-100 px-2 py-1"
                    >
                      <Text className="text-[11px] font-bold uppercase text-amber-800">
                        Use preset
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {presetOpenIndex === n && (
                    // maxHeight lives on the ScrollView itself via `style`
                    // (a wrapping View's maxHeight doesn't constrain a
                    // ScrollView child), plus nestedScrollEnabled since this
                    // sits inside the outer form ScrollView.
                    <View className="mb-2 overflow-hidden rounded-lg border border-amber-200 bg-white">
                      <ScrollView
                        style={{ maxHeight: DROPDOWN_LIST_MAX_HEIGHT }}
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                      >
                        <Text className="border-b border-amber-100 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-700">
                          {category
                            ? `Showing default + ${category} questions`
                            : 'Showing default questions — select a Category above for more'}
                        </Text>

                        {presetsError && (
                          <Text className="px-3 py-2 text-[11px] text-rose-600">
                            Couldn't reach the Question Bank — showing offline defaults.
                          </Text>
                        )}

                        {presetsLoading ? (
                          <View className="items-center py-4">
                            <ActivityIndicator color="#B45309" />
                          </View>
                        ) : (
                          <>
                            {visiblePresetQuestions.length === 0 && (
                              <Text className="px-3 py-2 text-xs text-slate-400">
                                No presets available.
                              </Text>
                            )}
                            {visiblePresetQuestions.map((qObj, idx) => {
                              const qText = typeof qObj === 'string' ? qObj : qObj.text;
                              // Label: [Default] for shared questions,
                              // otherwise the selected category (the
                              // question may also belong to others).
                              const qCat =
                                typeof qObj !== 'object'
                                  ? ''
                                  : isSharedQuestion(qObj)
                                  ? '[Default] '
                                  : `[${category}] `;
                              const hasChoices =
                                typeof qObj === 'object' &&
                                Array.isArray(qObj.options) &&
                                qObj.options.length > 0;
                              // Already chosen on another question slot:
                              // shown greyed out and can't be tapped.
                              const alreadyUsed = questionsUsedElsewhere.includes(
                                (qText || '').trim().toLowerCase()
                              );
                              return (
                                <TouchableOpacity
                                  key={qObj.id ?? idx}
                                  disabled={alreadyUsed}
                                  onPress={() => {
                                    setQuestionValue(qText);
                                    setPresetOpenIndex(null);
                                  }}
                                  className={`border-b border-amber-100 px-3 py-2 last:border-b-0 ${
                                    alreadyUsed ? 'bg-slate-50' : ''
                                  }`}
                                >
                                  <Text
                                    className={`text-xs ${
                                      alreadyUsed ? 'text-slate-400' : 'text-[#16233F]'
                                    }`}
                                  >
                                    {qCat}
                                    {qText}
                                    {hasChoices ? ' ✓' : ''}
                                    {alreadyUsed ? ' (already used)' : ''}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </>
                        )}
                      </ScrollView>
                    </View>
                  )}
                  </View>

                  <TextInput
                    ref={(el) => {
                      questionInputRefs.current[n - 1] = el;
                    }}
                    value={questionValue}
                    onChangeText={setQuestionValue}
                    onFocus={() => {
                      closeDropdowns();
                      scrollFocusedInputIntoView({ current: questionInputRefs.current[n - 1] });
                    }}
                    placeholder={`Question ${n} (or use preset above)`}
                    placeholderTextColor="#9AA3B5"
                    maxLength={150}
                    className={`h-11 rounded-lg border bg-white px-3 text-sm text-[#16233F] ${
                      questionMissing ? 'mb-1 border-rose-500' : 'mb-2 border-amber-300'
                    }`}
                  />
                  {questionMissing && (
                    <Text className="mb-2 text-[11px] font-semibold text-rose-600">
                      Question {n} is required.
                    </Text>
                  )}

                  {answerOptions ? (
                    <>
                      <View
                        ref={(el) => {
                          answerBlockRefs.current[n - 1] = el;
                        }}
                        collapsable={false}
                      >
                      <TouchableOpacity
                        onPress={() => {
                          Keyboard.dismiss();
                          setPresetOpenIndex(null);
                          setAnswerOpenIndex((current) => (current === n ? null : n));
                        }}
                        className={`h-11 flex-row items-center justify-between rounded-lg border bg-white px-3 ${
                          answerMissing ? 'border-rose-500' : 'border-amber-300'
                        }`}
                      >
                        <Text
                          className={`text-sm ${
                            answerValue ? 'text-[#16233F]' : 'text-slate-400'
                          }`}
                        >
                          {answerValue || 'Select correct answer'}
                        </Text>
                        <ChevronDown size={16} color="#B45309" />
                      </TouchableOpacity>

                      {answerOpenIndex === n && (
                        <View className="mt-1 max-h-40 overflow-hidden rounded-lg border border-amber-200 bg-white">
                          <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                            {answerOptions.map((opt) => (
                              <TouchableOpacity
                                key={opt}
                                onPress={() => {
                                  setAnswerValue(opt);
                                  setAnswerOpenIndex(null);
                                }}
                                className="border-b border-amber-100 px-3 py-2 last:border-b-0"
                              >
                                <Text className="text-xs text-[#16233F]">{opt}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      )}
                      </View>

                      <Text className="mt-1 text-[11px] font-semibold text-emerald-700">
                        🔗 {answerOptions.length} predefined choices linked.
                      </Text>
                    </>
                  ) : (
                    <TextInput
                      ref={(el) => {
                        answerInputRefs.current[n - 1] = el;
                      }}
                      value={answerValue}
                      onChangeText={setAnswerValue}
                      onFocus={() => {
                        closeDropdowns();
                        scrollFocusedInputIntoView({ current: answerInputRefs.current[n - 1] });
                      }}
                      placeholder={`Correct answer ${n}`}
                      placeholderTextColor="#9AA3B5"
                      maxLength={150}
                      className={`h-11 rounded-lg border bg-white px-3 text-sm text-[#16233F] ${
                        answerMissing ? 'border-rose-500' : 'border-amber-300'
                      }`}
                    />
                  )}
                  {answerMissing && (
                    <Text className="mt-1 text-[11px] font-semibold text-rose-600">
                      Correct answer {n} is required.
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Photo Upload Section */}
        <View className="mb-2 flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View className="mr-2 h-4 w-1 rounded-full bg-[#1b2061]" />
            <Text className="text-sm font-bold text-[#16233F]">
              Photos (optional)
            </Text>
          </View>
          <Text className="text-xs font-semibold text-[#5B647A]">
            {photos.length}/3
          </Text>
        </View>

        <View className="mb-6 flex-row gap-3">
          {[0, 1, 2].map((slotIndex) => {
            const photoUri = photos[slotIndex];
            const isAddButton = slotIndex === photos.length && photos.length < 3;

            if (photoUri) {
              return (
                <View
                  key={photoUri}
                  className="relative aspect-square flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                >
                  <Image
                    source={{ uri: photoUri }}
                    className="h-full w-full"
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    onPress={() =>
                      setPhotos((current) =>
                        current.filter((_, index) => index !== slotIndex)
                      )
                    }
                    className="absolute right-2 top-2 h-7 w-7 items-center justify-center rounded-full bg-black/60"
                  >
                    <X size={14} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              );
            }

            if (isAddButton) {
              return (
                <TouchableOpacity
                  key="add-photo"
                  onPress={() => {
                    Keyboard.dismiss();
                    closeDropdowns();
                    setPreserveHiddenTab(true);
                    setPhotoModalVisible(true);
                  }}
                  className="aspect-square flex-1 items-center justify-center rounded-xl border-2 border-dashed border-slate-300"
                >
                  <ImagePlus size={22} color="#5B647A" />
                  <Text className="mt-1 text-[10px] font-bold text-[#5B647A]">
                    Add Photo
                  </Text>
                </TouchableOpacity>
              );
            }

            return (
              <View
                key={`empty-slot-${slotIndex}`}
                className="aspect-square flex-1"
              />
            );
          })}
        </View>

        {/* Form Actions */}
        <View className="flex-row gap-3">
          <TouchableOpacity
            onPress={() => {
              Keyboard.dismiss();
              reset();
              onClose?.();
            }}
            className="h-12 flex-1 items-center justify-center rounded-lg border border-slate-300 bg-slate-50"
          >
            <Text className="font-semibold text-[#16233F]">Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={saving}
            onPress={() => {
              Keyboard.dismiss();
              closeDropdowns();
              submit();
            }}
            className="h-12 flex-1 items-center justify-center rounded-lg bg-[#1b2061]"
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="font-semibold text-white">
                Add {reportType} Item
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Custom Alert/Feedback Modal matching Report Lost Item */}
      <Modal
        visible={Boolean(feedback)}
        transparent
        animationType="fade"
        onRequestClose={closeFeedback}
      >
        <View className="flex-1 items-center justify-center bg-black/50 px-6">
          <View className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl">
            {/* Centered Icon Badge */}
            <View className="mb-4 items-center">
              <View
                className={`h-16 w-16 items-center justify-center rounded-full ${
                  feedback?.tone === 'success' ? 'bg-emerald-100' : 'bg-rose-100'
                }`}
              >
                {feedback?.tone === 'success' ? (
                  <CheckCircle2 size={32} color="#059669" />
                ) : (
                  <CircleAlert size={32} color="#E11D48" />
                )}
              </View>
            </View>

            {/* Modal Text Header & Message */}
            <Text className="text-center text-xl font-bold text-[#16233F]">
              {feedback?.title}
            </Text>

            <Text className="mt-2 text-center text-sm leading-6 text-slate-500">
              {feedback?.message}
            </Text>

            {/* Action Button */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={closeFeedback}
              className={`mt-6 h-12 w-full items-center justify-center rounded-xl ${
                feedback?.tone === 'success' ? 'bg-emerald-600' : 'bg-[#1b2061]'
              }`}
            >
              <Text className="text-sm font-semibold text-white">Okay</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Date and Time Picker Modal */}
      <Modal
        visible={Boolean(picker)}
        transparent
        animationType="fade"
        onRequestClose={() => setPicker(null)}
      >
        <View className="flex-1 items-center justify-center bg-black/40 px-5">
          <View className="w-full overflow-hidden rounded-2xl bg-white">
            <View className="bg-[#1b2061] px-5 py-4">
              <Text className="text-lg font-bold text-white">
                Select {picker?.mode === 'date' ? 'date' : 'time'}
              </Text>
            </View>
            <View className="items-center p-4">
              {picker && (
                <View className="self-stretch">
                  {picker.mode === 'date' ? (
                    <>
                      <View className="mb-4 flex-row items-center justify-between">
                        <TouchableOpacity
                          disabled={!canGoPrevMonth}
                          onPress={() => changePickerMonth(-1)}
                          className={`h-9 w-9 items-center justify-center rounded-full bg-[#EEF1F7] ${
                            canGoPrevMonth ? '' : 'opacity-40'
                          }`}
                        >
                          <Text className="text-2xl leading-none text-[#1b2061]">
                            ‹
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={openMonthYearPicker}
                          className="flex-row items-center rounded-lg bg-[#EEF1F7] px-3 py-1.5"
                        >
                          <Text className="text-base font-bold text-[#16233F]">
                            {MONTH_NAMES[pickerMonth.getMonth()]}{' '}
                            {pickerMonth.getFullYear()}
                          </Text>
                          <ChevronDown
                            size={16}
                            color="#1b2061"
                            className="ml-1"
                          />
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => changePickerMonth(1)}
                          className="h-9 w-9 items-center justify-center rounded-full bg-[#EEF1F7]"
                        >
                          <Text className="text-2xl leading-none text-[#1b2061]">
                            ›
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <View className="flex-row flex-wrap">
                        {WEEK_DAYS.map((day) => (
                          <Text
                            key={day}
                            className="mb-1 w-[14.28%] text-center text-xs font-semibold text-slate-400"
                          >
                            {day}
                          </Text>
                        ))}
                        {getCalendarDays(pickerMonth).map((date, index) => {
                          if (!date)
                            return (
                              <View
                                key={`empty-${index}`}
                                className="mb-1 h-10 w-[14.28%]"
                              />
                            );
                          const selected = isSameDay(date, pickerValue);
                          const disabled = isPickerDateDisabled(date, picker.field);
                          return (
                            <TouchableOpacity
                              key={date.toISOString()}
                              disabled={disabled}
                              onPress={() => selectPickerDate(date)}
                              className={`mb-1 h-10 w-[14.28%] items-center justify-center ${
                                selected ? 'rounded-full bg-[#1b2061]' : ''
                              }`}
                            >
                              <Text
                                className={`text-sm ${
                                  selected
                                    ? 'font-bold text-white'
                                    : disabled
                                    ? 'text-slate-300'
                                    : 'text-[#16233F]'
                                }`}
                              >
                                {date.getDate()}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  ) : (
                    <View className="self-stretch">
                      <View className="mb-5 items-center rounded-2xl bg-[#EEF1F7] py-5">
                        <Text className="text-[11px] font-bold tracking-widest text-slate-500">
                          SELECTED TIME
                        </Text>
                        <Text className="mt-2 text-4xl font-bold text-[#1B2061]">
                          {String(
                            pickerValue.getHours() % 12 || 12
                          ).padStart(2, '0')}
                          :
                          {String(pickerValue.getMinutes()).padStart(
                            2,
                            '0'
                          )}{' '}
                          {pickerValue.getHours() >= 12 ? 'PM' : 'AM'}
                        </Text>
                        <Text className="mt-1 text-xs text-slate-500">
                          Scroll to select an hour and minute.
                        </Text>
                      </View>

                      <View className="mb-4 flex-row rounded-xl bg-slate-100 p-1">
                        {['AM', 'PM'].map((period) => {
                          const selected =
                            period === 'AM'
                              ? pickerValue.getHours() < 12
                              : pickerValue.getHours() >= 12;

                          return (
                            <TouchableOpacity
                              key={period}
                              onPress={() => {
                                setPickerValue((current) => {
                                  const next = new Date(current);
                                  const hour12 = next.getHours() % 12 || 12;

                                  next.setHours(
                                    period === 'AM'
                                      ? hour12 === 12
                                        ? 0
                                        : hour12
                                      : hour12 === 12
                                      ? 12
                                      : hour12 + 12
                                  );

                                  return next;
                                });
                              }}
                              className={`flex-1 items-center rounded-lg py-3 ${
                                selected ? 'bg-[#1B2061]' : ''
                              }`}
                            >
                              <Text
                                className={`text-sm font-bold ${
                                  selected ? 'text-white' : 'text-slate-500'
                                }`}
                              >
                                {period}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      <View className="flex-row gap-3">
                        <View className="flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                          <View className="border-b border-slate-200 bg-white px-3 py-3">
                            <Text className="text-center text-xs font-bold tracking-wide text-[#1B2061]">
                              HOUR
                            </Text>
                          </View>

                          <ScrollView
                            className="h-64"
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={{ paddingVertical: 8 }}
                          >
                            {Array.from(
                              { length: 12 },
                              (_, index) => index + 1
                            ).map((hour) => {
                              const selected =
                                (pickerValue.getHours() % 12 || 12) === hour;

                              return (
                                <TouchableOpacity
                                  key={hour}
                                  onPress={() => {
                                    setPickerValue((current) => {
                                      const next = new Date(current);
                                      const isPm = next.getHours() >= 12;

                                      next.setHours(
                                        isPm
                                          ? hour === 12
                                            ? 12
                                            : hour + 12
                                          : hour === 12
                                          ? 0
                                          : hour
                                      );

                                      return next;
                                    });
                                  }}
                                  className={`mx-3 mb-1 items-center rounded-lg py-2.5 ${
                                    selected ? 'bg-[#1B2061]' : ''
                                  }`}
                                >
                                  <Text
                                    className={`text-sm font-bold ${
                                      selected
                                        ? 'text-white'
                                        : 'text-[#16233F]'
                                    }`}
                                  >
                                    {String(hour).padStart(2, '0')}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                        </View>

                        <View className="flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                          <View className="border-b border-slate-200 bg-white px-3 py-3">
                            <Text className="text-center text-xs font-bold tracking-wide text-[#1B2061]">
                              MINUTE
                            </Text>
                          </View>

                          <ScrollView
                            className="h-64"
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={{ paddingVertical: 8 }}
                          >
                            {Array.from({ length: 60 }, (_, value) => {
                              const selected =
                                pickerValue.getMinutes() === value;

                              return (
                                <TouchableOpacity
                                  key={value}
                                  onPress={() => {
                                    setPickerValue((current) => {
                                      const next = new Date(current);
                                      next.setMinutes(value);
                                      return next;
                                    });
                                  }}
                                  className={`mx-3 mb-1 items-center rounded-lg py-2.5 ${
                                    selected ? 'bg-[#1B2061]' : ''
                                  }`}
                                >
                                  <Text
                                    className={`text-sm font-bold ${
                                      selected
                                        ? 'text-white'
                                        : 'text-[#16233F]'
                                    }`}
                                  >
                                    {String(value).padStart(2, '0')}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                        </View>
                      </View>
                    </View>
                  )}
                </View>
              )}
              <View className="mt-3 flex-row gap-3 self-stretch">
                <TouchableOpacity
                  onPress={() => setPicker(null)}
                  className="h-11 flex-1 items-center justify-center rounded-xl border border-slate-300"
                >
                  <Text className="text-sm font-semibold text-[#16233F]">
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={doneDisabled}
                  onPress={applyPickerValue}
                  className={`h-11 flex-1 items-center justify-center rounded-xl bg-[#1b2061] ${
                    doneDisabled ? 'opacity-50' : ''
                  }`}
                >
                  <Text className="text-sm font-semibold text-white">Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Month & Year Picker Modal */}
      <Modal
        visible={monthYearPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMonthYearPickerVisible(false)}
      >
        <View className="flex-1 items-center justify-center bg-black/50 px-5">
          <View className="w-full rounded-2xl bg-white p-5">
            <Text className="mb-4 text-center text-lg font-bold text-[#16233F]">
              Select Month & Year
            </Text>

            <View className="h-52 flex-row gap-4">
              <ScrollView className="flex-1 border-r border-slate-200 pr-2" showsVerticalScrollIndicator={false}>
                {MONTH_NAMES.map((month, index) => {
                  const selected = selectedTempMonth === index;
                  return (
                    <TouchableOpacity
                      key={month}
                      onPress={() => setSelectedTempMonth(index)}
                      className={`mb-1.5 rounded-lg p-2.5 ${
                        selected ? 'bg-[#1b2061]' : 'bg-slate-50'
                      }`}
                    >
                      <Text
                        className={`text-center text-sm font-semibold ${
                          selected ? 'text-white' : 'text-[#16233F]'
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
                  const selected = selectedTempYear === year;
                  return (
                    <TouchableOpacity
                      key={year}
                      onPress={() => setSelectedTempYear(year)}
                      className={`mb-1.5 rounded-lg p-2.5 ${
                        selected ? 'bg-[#1b2061]' : 'bg-slate-50'
                      }`}
                    >
                      <Text
                        className={`text-center text-sm font-semibold ${
                          selected ? 'text-white' : 'text-[#16233F]'
                        }`}
                      >
                        {year}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View className="mt-5 flex-row gap-3">
              <TouchableOpacity
                onPress={() => setMonthYearPickerVisible(false)}
                className="h-11 flex-1 items-center justify-center rounded-xl border border-slate-300"
              >
                <Text className="text-sm font-semibold text-[#16233F]">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={applyMonthYearSelection}
                className="h-11 flex-1 items-center justify-center rounded-xl bg-[#1b2061]"
              >
                <Text className="text-sm font-semibold text-white">Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Photo Picker Modal */}
      <PhotoPickerModal
        visible={photoModalVisible}
        maxImages={MAX_IMAGES}
        onClose={() => setPhotoModalVisible(false)}
        onCamera={async () => {
          setPhotoModalVisible(false);
          await captureWithCamera();
        }}
        onLibrary={async () => {
          setPhotoModalVisible(false);
          await selectFromLibrary();
        }}
      />

      {/* Submitting Loading Overlay */}
      <LoadingModal
        visible={saving}
        title={`Adding ${reportType.toLowerCase()} item...`}
        subtitle="Please wait while we save the item."
      />
    </KeyboardAvoidingView>
  );
}