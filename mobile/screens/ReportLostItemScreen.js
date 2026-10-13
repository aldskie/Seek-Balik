import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle,
  ChevronDown,
  Clock,
  ImagePlus,
  Mail,
  X,
} from 'lucide-react-native';

import { createLostItem, getCurrentUser } from '../api/api';
import { useTabBarVisibility } from '../hooks/TabBarVisibility';
import { useAppearance } from '../hooks/Appearance';
import PhotoPickerModal from '../components/PhotoPickerModal';
import LoadingModal from '../components/LoadingModal';

const NAVY = '#1b2061';
const MUTED = '#5B647A';
// Icon colors used in dark mode, where navy and the darker grey are unreadable.
const NAVY_ON_DARK = '#C7D2FE';
const MUTED_ON_DARK = '#94A3B8';

// Class strings reused across the form, each with its light and dark colors.
const SECTION_BAR = 'mr-2 h-4 w-1 rounded-full bg-[#1b2061] dark:bg-indigo-500';
const SECTION_TITLE = 'text-sm font-bold text-[#16233F] dark:text-slate-100';
const FIELD_LABEL = 'mb-1 text-sm font-semibold tracking-wide text-slate-500 dark:text-slate-400';
const SUB_LABEL = 'mb-1 text-xs font-semibold text-slate-400 dark:text-slate-500';
const FIELD_TEXT = 'text-[#16233F] dark:text-slate-100';
const PLACEHOLDER_TEXT = 'text-[#9AA3B5] dark:text-slate-500';
const DROPDOWN_BUTTON =
  'h-11 flex-row items-center justify-between rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900';
const DROPDOWN_LIST =
  'mt-1 overflow-hidden rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900';
const DROPDOWN_ROW = 'border-b border-slate-100 px-3 py-3 dark:border-slate-800';
const READ_ONLY_BOX =
  'relative flex-row items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 px-3 dark:border-slate-800 dark:bg-slate-800';
const READ_ONLY_TEXT = 'text-[#16233F] dark:text-slate-300';
const MODAL_CARD = 'bg-white dark:bg-slate-900';
const MODAL_TITLE = 'text-[#16233F] dark:text-slate-100';
const PRIMARY_BUTTON = 'bg-[#1b2061] dark:bg-indigo-600';
const SECONDARY_BUTTON =
  'border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800';
const SOFT_TILE = 'bg-[#EEF1F7] dark:bg-slate-800';
const NAVY_TEXT = 'text-[#1b2061] dark:text-indigo-200';

const CATEGORIES = ['Accessories', 'ID', 'Academic Materials', 'Bags & Wallets', 'Clothing', 'Electronic', 'Keys'];
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
const LOCATIONS = [
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
const MAX_PHOTOS = 3;

// Space kept under the Clear/Submit buttons, added on top of the bottom safe-area inset.
const ACTION_BUTTONS_BOTTOM_RESERVE = 12;

// Window after the keyboard opens/closes during which onScroll is ignored so the tab bar doesn't pop back in.
const KEYBOARD_SCROLL_SUPPRESS_MS = 400;
// Distance from the content bottom (px) that counts as "at the bottom", which forces the tab bar hidden.
const BOTTOM_THRESHOLD = 40;

// How long after the last change the unfinished report is saved to the device.
const DRAFT_SAVE_DELAY_MS = 300;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 11 }, (_, i) => CURRENT_YEAR - 5 + i);

// Parses 'YYYY-MM-DD' as a local date, since new Date("YYYY-MM-DD") is read as UTC and can shift the day in UTC+8.
function parseDateOnly(value) {
  if (!value || typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [y, m, d] = match.slice(1).map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

// Formats a Date as local 'YYYY-MM-DD' without going through toISOString(), which would convert to UTC.
function formatDateOnly(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Returns local midnight of the given date so days can be compared without time-of-day noise.
function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// The reporter's ID number, sent to the backend as `student_id`. Uses the
// account's own ID field when it has one, otherwise the digits before the
// "@" of the school email (23100094@slc-sflu.edu.ph -> 23100094). Returns ''
// when neither gives an ID number (e.g. a staff email that isn't numeric).
function getAccountStudentId(account) {
  const direct = account?.student_id ?? account?.studentId ?? account?.id_number;
  if (direct !== undefined && direct !== null && String(direct).trim()) {
    return String(direct).trim();
  }

  const localPart = String(account?.email || '').split('@')[0].trim();
  return /^\d{1,8}$/.test(localPart) ? localPart : '';
}

// Returns the value if it is a string, otherwise ''. Used when reading a saved draft.
function asString(value) {
  return typeof value === 'string' ? value : '';
}

export default function ReportLostItemScreen() {
  const insets = useSafeAreaInsets();
  const { handleScroll, hideTabBar } = useTabBarVisibility();

  // Icon and placeholder colors follow the app's Light / Dark appearance.
  const { isDark } = useAppearance();
  const mutedIcon = isDark ? MUTED_ON_DARK : MUTED;
  const navyIcon = isDark ? NAVY_ON_DARK : NAVY;
  const placeholderColor = isDark ? '#64748B' : '#9AA3B5';

  const formScrollRef = useRef(null);
  const itemNameOtherInputRef = useRef(null);
  const otherLocationInputRef = useRef(null);
  const descriptionInputRef = useRef(null);
  const scrollViewHeightRef = useRef(0);
  const contentHeightRef = useRef(0);

  // Form States
  const [itemName, setItemName] = useState('');
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  // ID number of the logged-in account, loaded with the name and email and
  // submitted as `student_id`. Not shown on the form.
  const [studentId, setStudentId] = useState('');
  const [loadingReporter, setLoadingReporter] = useState(true);
  const [category, setCategory] = useState('');
  const [itemNameOther, setItemNameOther] = useState(false);

  const [selectedAreas, setSelectedAreas] = useState([]);
  const [otherLocation, setOtherLocation] = useState('');

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // True once the saved draft (if any) has been loaded, so an empty form
  // never overwrites a draft that hasn't been restored yet.
  const [draftReady, setDraftReady] = useState(false);

  const [categoryOpen, setCategoryOpen] = useState(false);
  const [itemNameOpen, setItemNameOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [photoModalVisible, setPhotoModalVisible] = useState(false);

  // While true, the tab bar's scroll-direction logic is skipped so it stays hidden behind the photo picker and permission dialogs.
  const [preserveHiddenTab, setPreserveHiddenTab] = useState(false);

  // Success Ticket Modal State
  const [successTicketCode, setSuccessTicketCode] = useState(null);

  // Custom Date & Time Picker States
  const [picker, setPicker] = useState(null); // { mode: 'date' | 'time', field: 'start' | 'end' }
  const [pickerValue, setPickerValue] = useState(new Date());
  const [pickerMonth, setPickerMonth] = useState(new Date());

  // Month & Year Picker States
  const [monthYearPickerVisible, setMonthYearPickerVisible] = useState(false);
  const [selectedTempMonth, setSelectedTempMonth] = useState(new Date().getMonth());
  const [selectedTempYear, setSelectedTempYear] = useState(new Date().getFullYear());

  // Custom Alert Modal State
  const [alertModalConfig, setAlertModalConfig] = useState({
    visible: false,
    title: '',
    message: '',
  });

  const showAlert = (title, message) => {
    setAlertModalConfig({
      visible: true,
      title,
      message,
    });
  };

  const hideAlert = () => {
    setAlertModalConfig((prev) => ({ ...prev, visible: false }));
  };

  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then((account) => {
        if (cancelled || !account) return;
        setFirstName(account.first_name || account.firstName || '');
        setLastName(account.last_name || account.lastName || '');
        setEmail(account.email || '');
        setStudentId(getAccountStudentId(account));
      })
      .catch((err) => {
        // The session ended: the app is already going to the login screen.
        if (err?.sessionExpired) return;

        if (!cancelled) {
          showAlert(
            'Could not load account information',
            'Please check your connection and sign in again before reporting a lost item.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingReporter(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // ----- Draft: keeps an unfinished report on the device -----
  // If the session expires (or the app closes) mid-report, the form comes
  // back as it was the next time this account opens the screen. Each account
  // has its own draft, so another user on the same phone never sees it.
  const draftKey = email ? `lost_item_draft:${email}` : null;

  // Restore the saved draft once the account's email is known.
  useEffect(() => {
    if (!draftKey) return undefined;
    let cancelled = false;

    AsyncStorage.getItem(draftKey)
      .then((raw) => {
        if (cancelled || !raw) return;
        const draft = JSON.parse(raw);
        if (!draft || typeof draft !== 'object') return;

        const draftCategory = CATEGORIES.includes(draft.category) ? draft.category : '';
        setCategory(draftCategory);
        setItemName(draftCategory ? asString(draft.itemName) : '');
        setItemNameOther(Boolean(draftCategory && draft.itemNameOther));
        setSelectedAreas(
          Array.isArray(draft.selectedAreas)
            ? draft.selectedAreas.filter((loc) => LOCATIONS.includes(loc)).slice(0, 3)
            : []
        );
        setOtherLocation(asString(draft.otherLocation));
        setStartDate(asString(draft.startDate));
        setEndDate(asString(draft.endDate));
        setStartTime(asString(draft.startTime));
        setEndTime(asString(draft.endTime));
        setDescription(asString(draft.description));
        setPhotos(
          Array.isArray(draft.photos)
            ? draft.photos.filter((uri) => typeof uri === 'string' && uri).slice(0, MAX_PHOTOS)
            : []
        );
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDraftReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [draftKey]);

  // Save the draft shortly after any change. An empty form removes it, which
  // also covers Clear and a successful submit.
  useEffect(() => {
    if (!draftKey || !draftReady) return undefined;

    const timer = setTimeout(() => {
      const isEmpty =
        !itemName &&
        !category &&
        !itemNameOther &&
        selectedAreas.length === 0 &&
        !otherLocation &&
        !startDate &&
        !endDate &&
        !startTime &&
        !endTime &&
        !description &&
        photos.length === 0;

      if (isEmpty) {
        AsyncStorage.removeItem(draftKey).catch(() => {});
        return;
      }

      AsyncStorage.setItem(
        draftKey,
        JSON.stringify({
          itemName,
          category,
          itemNameOther,
          selectedAreas,
          otherLocation,
          startDate,
          endDate,
          startTime,
          endTime,
          description,
          photos,
        })
      ).catch((err) => console.error('Failed to save report draft:', err));
    }, DRAFT_SAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [
    draftKey,
    draftReady,
    itemName,
    category,
    itemNameOther,
    selectedAreas,
    otherLocation,
    startDate,
    endDate,
    startTime,
    endTime,
    description,
    photos,
  ]);

  const focusedInputRef = useRef(null);
  const keyboardHeightRef = useRef(0);
  const suppressTabBarScrollUntilRef = useRef(0);

  // Re-measures the focused input against the ScrollView on every call so it scrolls above the keyboard on any focus, not just the first.
  const scrollFocusedInputAboveKeyboard = () => {
    const target = focusedInputRef.current;
    const scrollNode = formScrollRef.current;
    if (!target || !scrollNode) return;

    target.measureLayout(
      scrollNode,
      (x, y) => {
        const targetY = Math.max(y - 24, 0);
        scrollNode.scrollTo({ y: targetY, animated: true });

        // Landing near the bottom may fire no scroll event, so check the measured height here and hide the tab bar directly.
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

  const closeDropdowns = () => {
    setCategoryOpen(false);
    setItemNameOpen(false);
    setLocationOpen(false);
  };

  const scrollFocusedInputIntoView = (inputRef) => {
    focusedInputRef.current = inputRef.current;
    if (keyboardHeightRef.current > 0) {
      requestAnimationFrame(scrollFocusedInputAboveKeyboard);
    }
  };

  // Forgets the tracked input only if it is the one blurring, so a newly focused input's ref isn't wiped by a late blur event.
  const handleInputBlur = (inputRef) => {
    if (focusedInputRef.current === inputRef.current) {
      focusedInputRef.current = null;
    }
  };

  // Drops the tracked input, blurs every text field, and closes the keyboard so no stale ref can scroll the form back down.
  const releaseFocus = () => {
    focusedInputRef.current = null;
    itemNameOtherInputRef.current?.blur();
    otherLocationInputRef.current?.blur();
    descriptionInputRef.current?.blur();
    Keyboard.dismiss();
  };

  const handleInputFocus = () => {
    closeDropdowns();
    scrollFocusedInputIntoView(otherLocationInputRef);
  };

  const handleClear = () => {
    setItemName('');
    setCategory('');
    setItemNameOther(false);
    setSelectedAreas([]);
    setOtherLocation('');
    setStartDate('');
    setEndDate('');
    setStartTime('');
    setEndTime('');
    setDescription('');
    setPhotos([]);
    setPreserveHiddenTab(false);
    closeDropdowns();
  };

  const handleToggleLocation = (loc) => {
    setSelectedAreas((prev) => {
      let nextAreas;
      if (prev.includes(loc)) {
        nextAreas = prev.filter((item) => item !== loc);
      } else {
        if (prev.length >= 3) {
          showAlert('Limit reached', 'You can select up to 3 locations.');
          return prev;
        }
        nextAreas = [...prev, loc];
      }

      if (nextAreas.length === 3) {
        setLocationOpen(false);
      }

      return nextAreas;
    });
  };

  const saveSelectedPhotos = (assets) => {
    setPhotos((current) =>
      [...current, ...assets.map((asset) => asset.uri)].slice(0, MAX_PHOTOS)
    );
    requestAnimationFrame(() => {
      formScrollRef.current?.scrollToEnd({ animated: true });
      setTimeout(() => setPreserveHiddenTab(false), 350);
    });
  };

  const selectFromLibrary = async () => {
    const remainingSlots = MAX_PHOTOS - photos.length;
    if (remainingSlots <= 0) {
      setPreserveHiddenTab(false);
      showAlert('Photo limit reached', 'You can upload a maximum of 3 photos.');
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setPreserveHiddenTab(false);
      showAlert('Permission required', 'Allow photo library access to select photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remainingSlots,
      quality: 0.8,
    });

    if (!result.canceled) {
      saveSelectedPhotos(result.assets);
    } else {
      setPreserveHiddenTab(false);
    }
  };

  const captureWithCamera = async () => {
    if (photos.length >= MAX_PHOTOS) {
      setPreserveHiddenTab(false);
      showAlert('Photo limit reached', 'You can upload a maximum of 3 photos.');
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setPreserveHiddenTab(false);
      showAlert('Permission required', 'Allow camera access to capture photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (!result.canceled) {
      saveSelectedPhotos(result.assets);
    } else {
      setPreserveHiddenTab(false);
    }
  };

  // Earliest allowed "Date lost (To)" is the day after "From"; returns null until a From date is chosen.
  const getMinEndDate = () => {
    const from = parseDateOnly(startDate);
    if (!from) return null;
    from.setDate(from.getDate() + 1);
    return from;
  };

  // A day is unavailable if it is in the future or, for the "To" field, on or before the selected "From" date.
  const isPickerDateDisabled = (date, field) => {
    const day = startOfDay(date);
    if (day > startOfDay(new Date())) return true;

    if (field === 'end') {
      const minEnd = getMinEndDate();
      if (minEnd && day < minEnd) return true;
    }
    return false;
  };

  const openPicker = (mode, field) => {
    Keyboard.dismiss();
    closeDropdowns();

    if (field === 'end') {
      if (mode === 'date' && !startDate) {
        showAlert('Notice', 'Please select "Date lost (From)" first.');
        return;
      }
      if (mode === 'time' && !startTime) {
        showAlert('Notice', 'Please select "Time lost (From)" first.');
        return;
      }
      // The time range is one window within a single day, so "To" must be
      // later than "From" on the same clock — nothing is left after 23:59.
      if (mode === 'time' && startTime >= '23:59') {
        showAlert(
          'Notice',
          'There is no later time on the same day. Choose an earlier "Time lost (From)".'
        );
        return;
      }

      // "To" must be after "From" and not in the future, so a From date of today leaves no valid To date.
      if (mode === 'date') {
        const minEnd = getMinEndDate();
        if (minEnd && minEnd > startOfDay(new Date())) {
          showAlert(
            'Notice',
            '"Date lost (To)" must be after the "From" date and cannot be in the future. Choose an earlier "From" date.'
          );
          return;
        }
      }
    }

    let initialDate = new Date();

    if (mode === 'date') {
      const val = field === 'start' ? startDate : endDate;
      if (val) {
        initialDate = parseDateOnly(val) || initialDate;
      } else if (field === 'end') {
        // Opens on the first selectable day, which is the day after "From".
        initialDate = getMinEndDate() || initialDate;
      }
    } else {
      const val = field === 'start' ? startTime : endTime;
      if (val) {
        const [h, m] = val.split(':');
        initialDate.setHours(parseInt(h, 10), parseInt(m, 10));
      } else if (field === 'end' && startTime) {
        // Suggest one hour after "From", but never past 23:59 (the range
        // stays inside one day).
        const [h, m] = startTime.split(':').map((part) => parseInt(part, 10));
        if (h >= 23) initialDate.setHours(23, 59);
        else initialDate.setHours(h + 1, m);
      }
    }

    setPickerValue(initialDate);
    setPickerMonth(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
    setPicker({ mode, field });
  };

  const applyPickerValue = () => {
    if (!picker) return;
    const { mode, field } = picker;

    if (mode === 'date') {
      // Rejects any day the calendar shows as unavailable.
      if (isPickerDateDisabled(pickerValue, field)) return;

      const formatted = formatDateOnly(pickerValue);
      if (field === 'start') {
        setStartDate(formatted);
        if (endDate && endDate <= formatted) {
          setEndDate('');
        }
      } else {
        setEndDate(formatted);
      }
    } else {
      const hours = String(pickerValue.getHours()).padStart(2, '0');
      const minutes = String(pickerValue.getMinutes()).padStart(2, '0');
      const formatted = `${hours}:${minutes}`;
      // TIME RANGE RULE: the From–To times are one window within a single
      // day, whatever dates were picked. Oct 11–12 with 11:00–15:00 means
      // "around 11 AM to 3 PM on Oct 11 or Oct 12", so "To" must always be
      // later than "From", even when the dates differ.
      if (field === 'start') {
        setStartTime(formatted);
        // A "To" time that is no longer after the new "From" is cleared.
        if (endTime && endTime <= formatted) {
          setEndTime('');
        }
      } else {
        if (startTime && formatted <= startTime) {
          setPicker(null);
          showAlert(
            'Invalid time',
            `"Time lost (To)" must be later than "Time lost (From)" (${startTime}). The time range is within a single day.`
          );
          return;
        }
        setEndTime(formatted);
      }
    }

    setPicker(null);
  };

  const changePickerMonth = (delta) => {
    setPickerMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const openMonthYearPicker = () => {
    setSelectedTempMonth(pickerMonth.getMonth());
    setSelectedTempYear(pickerMonth.getFullYear());
    setMonthYearPickerVisible(true);
  };

  const applyMonthYearSelection = () => {
    const next = new Date(selectedTempYear, selectedTempMonth, 1);
    // For "To", avoids landing on a month that is entirely before the first selectable day.
    setPickerMonth(minPickerMonth && next < minPickerMonth ? minPickerMonth : next);
    setMonthYearPickerVisible(false);
  };

  const selectPickerDate = (date) => {
    setPickerValue(date);
  };

  const isSameDay = (d1, d2) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  const getCalendarDays = (monthDate) => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();

    const days = [];
    for (let i = 0; i < firstDayIndex; i++) days.push(null);
    for (let d = 1; d <= totalDays; d++) days.push(new Date(year, month, d));
    return days;
  };

  async function handleSubmit() {
    if (saving) return;

    // Releases the focused input up front so its stale ref can't scroll the form back down after submit.
    releaseFocus();

    if (loadingReporter || !firstName.trim() || !lastName.trim() || !email.trim()) {
      showAlert(
        'Account information unavailable',
        'Your first name, last name, and GSuite email must load from your logged-in account before you can submit a report.'
      );
      return;
    }

    const formattedLocations = selectedAreas
      .map((loc) => (loc === 'Others' ? otherLocation.trim() : loc))
      .filter(Boolean)
      .join(', ');

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

    // "To" values are optional. When given, they must come after the "From" values.
    const dateRangeValid = !endDate || startDate < endDate;
    // The time range is one window within a single day, so the "To" time
    // must be later than "From" whether or not a "To" date was picked.
    const timeRangeValid = !endTime || startTime < endTime;

    if (
      !itemName.trim() ||
      !category ||
      selectedAreas.length < 1 ||
      selectedAreas.length > 3 ||
      (selectedAreas.includes('Others') && !otherLocation.trim()) ||
      !startDate ||
      !startTime
    ) {
      showAlert(
        'Missing Information',
        'Complete all required fields and select from 1 to 3 locations.'
      );
    } else if (
      !datePattern.test(startDate) ||
      (endDate && !datePattern.test(endDate)) ||
      !timePattern.test(startTime) ||
      (endTime && !timePattern.test(endTime)) ||
      !dateRangeValid ||
      !timeRangeValid
    ) {
      showAlert(
        'Invalid Date/Time Range',
        'The "To" date must be after the "From" date, and the "To" time must be later than the "From" time (the time range is within a single day).'
      );
    } else {
      const formData = new FormData();
      formData.append('title', itemName.trim());
      formData.append('first_name', firstName.trim());
      formData.append('last_name', lastName.trim());
      formData.append('poster_name', `${firstName.trim()} ${lastName.trim()}`);
      formData.append('email', email.trim());
      // The reporter's ID number, so the backend's student_id field is filled in.
      if (studentId) formData.append('student_id', studentId);
      formData.append('category', category);
      formData.append('location', formattedLocations);

      // When the item was lost, as a range. The backend model stores this as
      // start_date / start_time ("From") and end_date / end_time ("To").
      formData.append('start_date', startDate);
      formData.append('start_time', startTime);
      // "To" values and the description are optional, so they're only sent when filled in.
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

      if (description.trim()) formData.append('description', description.trim());
      formData.append('type', 'Lost');
      formData.append('status', 'Pending');

      photos.forEach((uri, index) => {
        formData.append('image', {
          uri,
          name: `lost-item-${index + 1}.jpg`,
          type: 'image/jpeg',
        });
      });

      setSaving(true);

      try {
        const response = await createLostItem(formData);
        const ticketCode = response?.ticket_code || response?.item?.ticket_code || 'N/A';

        // Hides the loading overlay first so it never overlaps the result modal (iOS can drop a second modal).
        setSaving(false);
        setSuccessTicketCode(ticketCode);
        // Clearing the form also removes the saved draft.
        handleClear();
        focusedInputRef.current = null;

        // Scrolls to the top after the keyboard has closed and the padding has shrunk, so nothing overrides or clamps it.
        setTimeout(() => {
          formScrollRef.current?.scrollTo({ y: 0, animated: true });
        }, KEYBOARD_SCROLL_SUPPRESS_MS);
      } catch (error) {
        setSaving(false);

        // The session ended: the app is going to the login screen, and the
        // report stays saved as a draft for when the user signs back in.
        if (error?.sessionExpired) return;

        // Timeout: the server may have saved the report but replied too late, so don't call it a failure.
        if (error?.code === 'ECONNABORTED') {
          showAlert(
            'Still processing',
            'The server took too long to respond. Your report may have been saved. Check your submissions before submitting again.'
          );
          return;
        }

        const responseData = error?.response?.data;
        const message =
          responseData?.detail ||
          (responseData && typeof responseData === 'object'
            ? Object.entries(responseData)
                .map(([field, errors]) => `${field}: ${Array.isArray(errors) ? errors.join(' ') : errors}`)
                .join('\n')
            : '') ||
          'Unable to submit your report. Please try again.';
        showAlert('Submission Failed', message);
      } finally {
        setSaving(false);
      }
    }
  }

  const inputContainerClass =
    'relative flex-row items-center overflow-hidden rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900';

  // Calendar limits for the picker that is currently open.
  const isEndDatePicker = picker?.mode === 'date' && picker.field === 'end';
  const minEndDate = isEndDatePicker ? getMinEndDate() : null;
  // First month with any selectable day; null means no lower limit.
  const minPickerMonth = minEndDate
    ? new Date(minEndDate.getFullYear(), minEndDate.getMonth(), 1)
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
      className="flex-1 bg-white dark:bg-slate-950"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
      <StatusBar style="light" backgroundColor={NAVY} translucent={false} />

      <SafeAreaView edges={['top']} className="rounded-b-3xl bg-[#1b2061]">
        <View className="px-4 pb-6 pt-2">
          <Text className="text-[12px] font-bold tracking-widest text-white/60">
            SEEK AND BALIK
          </Text>
          <Text className="text-2xl font-extrabold text-white">Report Lost Item</Text>
        </View>
      </SafeAreaView>

      <ScrollView
          showVerticalScrollIndicator={false}
          ref={formScrollRef}
          className="flex-1"
          onLayout={(e) => {
            scrollViewHeightRef.current = e.nativeEvent.layout.height;
          }}
          onContentSizeChange={(w, h) => {
            contentHeightRef.current = h;
          }}
          onScroll={(event) => {
            if (preserveHiddenTab) return;
            // Skips the synthetic scroll events from the keyboard resizing the content so the tab bar doesn't pop back in.
            if (Date.now() < suppressTabBarScrollUntilRef.current) return;
            handleScroll(event);
          }}
          scrollEventThrottle={16}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 20,
            paddingBottom:
              keyboardHeight > 0
                ? keyboardHeight + 24
                : insets.bottom + ACTION_BUTTONS_BOTTOM_RESERVE,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Item Information */}
          <View className="mb-3 flex-row items-center">
            <View className={SECTION_BAR} />
            <Text className={SECTION_TITLE}>Item Details</Text>
          </View>

          {/* Category Dropdown */}
          <View className="mb-4">
            <Text className={FIELD_LABEL}>
              Category <Text className="text-rose-600 dark:text-rose-400">*</Text>
            </Text>
            <TouchableOpacity
              onPress={() => {
                Keyboard.dismiss();
                setCategoryOpen((open) => !open);
                setItemNameOpen(false);
                setLocationOpen(false);
              }}
              className={DROPDOWN_BUTTON}
            >
              <Text className={`text-sm ${FIELD_TEXT}`}>{category || 'Select category'}</Text>
              <ChevronDown size={18} color={mutedIcon} />
            </TouchableOpacity>
            {categoryOpen && (
              <View className={DROPDOWN_LIST}>
                {CATEGORIES.map((item) => (
                  <TouchableOpacity
                    key={item}
                    onPress={() => {
                      setCategory(item);
                      setItemName('');
                      setItemNameOther(false);
                      setCategoryOpen(false);
                    }}
                    className={`${DROPDOWN_ROW} last:border-b-0`}
                  >
                    <Text className={`text-sm ${FIELD_TEXT}`}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View className="mb-4">
            <Text className={FIELD_LABEL}>
              Item name <Text className="text-rose-600 dark:text-rose-400">*</Text>
            </Text>
            <TouchableOpacity
              disabled={!category}
              onPress={() => {
                Keyboard.dismiss();
                setItemNameOpen((open) => !open);
                setCategoryOpen(false);
                setLocationOpen(false);
              }}
              className={`relative h-11 flex-row items-center justify-between overflow-hidden rounded-lg border border-slate-300 px-3 dark:border-slate-700 ${
                category ? 'bg-white dark:bg-slate-900' : 'bg-slate-100 dark:bg-slate-800'
              }`}
            >
              <Text className={`flex-1 text-sm ${itemName && !itemNameOther ? FIELD_TEXT : PLACEHOLDER_TEXT}`} numberOfLines={1}>
                {itemName && !itemNameOther ? itemName : category ? 'Select item name' : 'Select a category first'}
              </Text>
              <ChevronDown size={18} color={mutedIcon} />
            </TouchableOpacity>
            {itemNameOpen && (
              <View className={`max-h-56 ${DROPDOWN_LIST}`}>
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  {(ITEM_NAME_OPTIONS[category] || []).map((option) => (
                    <TouchableOpacity
                      key={option}
                      onPress={() => {
                        setItemName(option);
                        setItemNameOther(false);
                        setItemNameOpen(false);
                      }}
                      className={DROPDOWN_ROW}
                    >
                      <Text className={`text-sm ${FIELD_TEXT}`}>{option}</Text>
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
                    <Text className={`text-sm font-semibold ${NAVY_TEXT}`}>Others (please specify)</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            )}
            {itemNameOther && (
              <View className={`${inputContainerClass} mt-2`}>
                <TextInput
                  ref={itemNameOtherInputRef}
                  className={`h-11 flex-1 text-sm ${FIELD_TEXT}`}
                  placeholder="Please specify the item name"
                  placeholderTextColor={placeholderColor}
                  value={itemName}
                  onChangeText={setItemName}
                  onFocus={() => {
                    closeDropdowns();
                    scrollFocusedInputIntoView(itemNameOtherInputRef);
                  }}
                  onBlur={() => handleInputBlur(itemNameOtherInputRef)}
                />
              </View>
            )}
          </View>

          {/* Reporter Information */}
          <View className="mb-3 flex-row items-center">
            <View className={SECTION_BAR} />
            <Text className={SECTION_TITLE}>Reporter Details</Text>
          </View>

          <View className="mb-3 flex-row gap-3">
            <View className="flex-1">
              <Text className={FIELD_LABEL}>
                First name <Text className="text-rose-600 dark:text-rose-400">*</Text>
              </Text>
              <View className={READ_ONLY_BOX}>
                <TextInput
                  className={`h-11 flex-1 text-sm ${READ_ONLY_TEXT}`}
                  value={firstName}
                  editable={false}
                  placeholder="Loading account…"
                  placeholderTextColor={placeholderColor}
                />
              </View>
            </View>

            <View className="flex-1">
              <Text className={FIELD_LABEL}>
                Last name <Text className="text-rose-600 dark:text-rose-400">*</Text>
              </Text>
              <View className={READ_ONLY_BOX}>
                <TextInput
                  className={`h-11 flex-1 text-sm ${READ_ONLY_TEXT}`}
                  value={lastName}
                  editable={false}
                  placeholder="Loading account…"
                  placeholderTextColor={placeholderColor}
                />
              </View>
            </View>
          </View>

          <View className="mb-5">
            <Text className={FIELD_LABEL}>
              Email (Gsuite)
            </Text>
            <View className={READ_ONLY_BOX}>
              <Mail size={15} color={mutedIcon} />
                <TextInput
                  className={`ml-2 h-11 flex-1 text-sm ${READ_ONLY_TEXT}`}
                  value={email}
                  editable={false}
                  placeholder="Loading account…"
                  placeholderTextColor={placeholderColor}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
            </View>
          </View>

          {/* Incident Details */}
          <View className="mb-3 flex-row items-center">
            <View className={SECTION_BAR} />
            <Text className={SECTION_TITLE}>Incident details</Text>
          </View>

          {/* Multi-Location Dropdown */}
          <View className="mb-4">
            <View className="mb-1 flex-row items-center justify-between">
              <Text className="text-sm font-semibold tracking-wide text-slate-500 dark:text-slate-400">
                Location lost <Text className="text-rose-600 dark:text-rose-400">*</Text>
              </Text>
              <Text className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                {selectedAreas.length}/3 selected
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                Keyboard.dismiss();
                setLocationOpen((open) => !open);
                setCategoryOpen(false);
                setItemNameOpen(false);
              }}
              className={`${DROPDOWN_BUTTON} py-2`}
            >
              {/* Placeholder color while empty, normal text once at least one location is chosen. */}
              <Text
                className={`flex-1 text-sm ${
                  selectedAreas.length > 0 ? FIELD_TEXT : PLACEHOLDER_TEXT
                }`}
                numberOfLines={1}
              >
                {selectedAreas.length > 0 ? selectedAreas.join(', ') : 'Select location(s)'}
              </Text>
              <ChevronDown size={18} color={mutedIcon} />
            </TouchableOpacity>

            {locationOpen && (
              // Capped height with an inner ScrollView so the long location list scrolls instead of stretching the form.
              <View className={`max-h-56 ${DROPDOWN_LIST}`}>
                <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                  {LOCATIONS.map((item) => {
                    const isSelected = selectedAreas.includes(item);
                    return (
                      <TouchableOpacity
                        key={item}
                        onPress={() => handleToggleLocation(item)}
                        className={`flex-row items-center justify-between ${DROPDOWN_ROW} last:border-b-0`}
                      >
                        <Text
                          className={`mr-2 flex-1 text-sm ${isSelected ? `font-bold ${NAVY_TEXT}` : FIELD_TEXT}`}
                        >
                          {item}
                        </Text>
                        {isSelected && <Check size={16} color={navyIcon} />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {selectedAreas.length >= 3 && (
              <Text className="mt-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                Maximum limit of 3 locations reached.
              </Text>
            )}
          </View>

          {selectedAreas.includes('Others') && (
            <View className="mb-4">
              <Text className={FIELD_LABEL}>
                Other location <Text className="text-rose-600 dark:text-rose-400">*</Text>
              </Text>
              <View className={inputContainerClass}>
                <TextInput
                  ref={otherLocationInputRef}
                  value={otherLocation}
                  onChangeText={setOtherLocation}
                  onFocus={handleInputFocus}
                  onBlur={() => handleInputBlur(otherLocationInputRef)}
                  placeholder="Enter the location"
                  placeholderTextColor={placeholderColor}
                  className={`h-11 flex-1 text-sm ${FIELD_TEXT}`}
                />
              </View>
            </View>
          )}

          {/* Date and Time Pickers */}
          <View className="mb-2 flex-row items-center">
            <View className={SECTION_BAR} />
            <Text className={SECTION_TITLE}>Date and Time Details</Text>
          </View>

          <Text className={FIELD_LABEL}>
            Date lost <Text className="text-rose-600 dark:text-rose-400">*</Text>
          </Text>
          <View className="mb-4 flex-row gap-3">
            <View className="flex-1">
              <Text className={SUB_LABEL}>From</Text>
              <TouchableOpacity
                onPress={() => openPicker('date', 'start')}
                className={`${inputContainerClass} h-11`}
              >
                <Calendar size={14} color={mutedIcon} />
                <Text className={`ml-2 flex-1 text-sm ${startDate ? FIELD_TEXT : PLACEHOLDER_TEXT}`}>
                  {startDate || 'YYYY-MM-DD'}
                </Text>
              </TouchableOpacity>
            </View>
            <View className="flex-1">
              <Text className={SUB_LABEL}>To (optional)</Text>
              {/* The picker opens from the field; the × clears a "To" date
                  picked by mistake (it's optional). */}
              <View className={`${inputContainerClass} h-11 pr-1.5`}>
                <TouchableOpacity
                  onPress={() => openPicker('date', 'end')}
                  className="h-11 flex-1 flex-row items-center"
                >
                  <Calendar size={14} color={mutedIcon} />
                  <Text className={`ml-2 flex-1 text-sm ${endDate ? FIELD_TEXT : PLACEHOLDER_TEXT}`}>
                    {endDate || 'YYYY-MM-DD'}
                  </Text>
                </TouchableOpacity>
                {endDate ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Clear the To date"
                    onPress={() => setEndDate('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    className="h-7 w-7 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"
                  >
                    <X size={14} color={mutedIcon} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>

          <Text className={FIELD_LABEL}>
            Time lost <Text className="text-rose-600 dark:text-rose-400">*</Text>
          </Text>
          <View className="mb-1.5 flex-row gap-3">
            <View className="flex-1">
              <Text className={SUB_LABEL}>From</Text>
              <TouchableOpacity
                onPress={() => openPicker('time', 'start')}
                className={`${inputContainerClass} h-11`}
              >
                <Clock size={14} color={mutedIcon} />
                <Text className={`ml-2 flex-1 text-sm ${startTime ? FIELD_TEXT : PLACEHOLDER_TEXT}`}>
                  {startTime || 'HH:MM'}
                </Text>
              </TouchableOpacity>
            </View>
            <View className="flex-1">
              <Text className={SUB_LABEL}>To (optional)</Text>
              {/* The picker opens from the field; the × clears a "To" time
                  picked by mistake (it's optional). */}
              <View className={`${inputContainerClass} h-11 pr-1.5`}>
                <TouchableOpacity
                  onPress={() => openPicker('time', 'end')}
                  className="h-11 flex-1 flex-row items-center"
                >
                  <Clock size={14} color={mutedIcon} />
                  <Text className={`ml-2 flex-1 text-sm ${endTime ? FIELD_TEXT : PLACEHOLDER_TEXT}`}>
                    {endTime || 'HH:MM'}
                  </Text>
                </TouchableOpacity>
                {endTime ? (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityLabel="Clear the To time"
                    onPress={() => setEndTime('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    className="h-7 w-7 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"
                  >
                    <X size={14} color={mutedIcon} />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          </View>
          <Text className="mb-5 text-[11px] text-slate-400 dark:text-slate-500">
            The time range is within one day and applies to every date above (e.g. 11:00–15:00 on
            either day). "To" must be later than "From".
          </Text>

          {/* Detailed Description */}
          <View className="mb-3 flex-row items-center">
            <View className={SECTION_BAR} />
            <Text className={SECTION_TITLE}>Detailed description</Text>
          </View>

          <View className="mb-5">
            <Text className={FIELD_LABEL}>
              Description (optional)
            </Text>
            <View className="relative overflow-hidden rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
              <TextInput
                ref={descriptionInputRef}
                className={`min-h-[84px] text-sm ${FIELD_TEXT}`}
                value={description}
                onChangeText={setDescription}
                placeholder="Mention unique marks, brand, stickers..."
                placeholderTextColor={placeholderColor}
                multiline
                textAlignVertical="top"
                onFocus={() => {
                  closeDropdowns();
                  scrollFocusedInputIntoView(descriptionInputRef);
                }}
                onBlur={() => handleInputBlur(descriptionInputRef)}
              />
            </View>
          </View>

          {/* Photo Upload Section */}
          <View className="mb-2 flex-row items-center justify-between">
            <View className="flex-row items-center">
              <View className={SECTION_BAR} />
              <Text className={SECTION_TITLE}>Photos</Text>
            </View>
            <Text className="text-xs font-semibold text-[#5B647A] dark:text-slate-400">
              {photos.length}/3 · optional
            </Text>
          </View>

          <View className="mb-6 flex-row gap-3">
            {[0, 1, 2].map((slotIndex) => {
              const photoUri = photos[slotIndex];
              const isAddButton = slotIndex === photos.length && photos.length < MAX_PHOTOS;

              if (photoUri) {
                return (
                  <View
                    key={photoUri}
                    className="relative aspect-square flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <Image
                      source={{ uri: photoUri }}
                      className="h-full w-full"
                      resizeMode="cover"
                      // A photo restored from a draft may no longer exist on the device; drop it.
                      onError={() =>
                        setPhotos((current) => current.filter((uri) => uri !== photoUri))
                      }
                    />
                    <TouchableOpacity
                      onPress={() =>
                        setPhotos((current) => current.filter((_, index) => index !== slotIndex))
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
                    className="aspect-square flex-1 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700"
                  >
                    <ImagePlus size={22} color={mutedIcon} />
                    <Text className="mt-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">ADD PHOTO</Text>
                  </TouchableOpacity>
                );
              }

              return <View key={`empty-slot-${slotIndex}`} className="aspect-square flex-1" />;
            })}
          </View>

          <View className="flex-row items-center gap-3">
            <TouchableOpacity
              disabled={saving}
              className={`h-12 flex-1 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-800 ${
                saving ? 'opacity-50' : ''
              }`}
              onPress={handleClear}
            >
              <Text className="text-sm font-semibold text-slate-700 dark:text-slate-200">Clear</Text>
            </TouchableOpacity>

            <TouchableOpacity
              disabled={saving || loadingReporter}
              className={`h-12 flex-1 items-center justify-center rounded-lg ${PRIMARY_BUTTON} ${
                saving || loadingReporter ? 'opacity-50' : ''
              }`}
              onPress={handleSubmit}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="text-sm font-semibold text-white">Submit report</Text>
              )}
            </TouchableOpacity>
          </View>
      </ScrollView>

      {/* Primary Date and Time Picker Modal */}
      <Modal
        visible={Boolean(picker)}
        transparent
        animationType="fade"
        onRequestClose={() => setPicker(null)}
      >
        <View className="flex-1 items-center justify-center bg-black/40 px-5 dark:bg-black/60">
          <View className={`w-full overflow-hidden rounded-2xl ${MODAL_CARD}`}>
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
                          className={`h-9 w-9 items-center justify-center rounded-full ${SOFT_TILE} ${
                            canGoPrevMonth ? '' : 'opacity-40'
                          }`}
                        >
                          <Text className={`text-2xl leading-none ${NAVY_TEXT}`}>‹</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={openMonthYearPicker}
                          className={`flex-row items-center rounded-lg px-3 py-1.5 ${SOFT_TILE}`}
                        >
                          <Text className={`text-base font-bold ${MODAL_TITLE}`}>
                            {MONTH_NAMES[pickerMonth.getMonth()]} {pickerMonth.getFullYear()}
                          </Text>
                          <ChevronDown size={16} color={navyIcon} className="ml-1" />
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => changePickerMonth(1)}
                          className={`h-9 w-9 items-center justify-center rounded-full ${SOFT_TILE}`}
                        >
                          <Text className={`text-2xl leading-none ${NAVY_TEXT}`}>›</Text>
                        </TouchableOpacity>
                      </View>

                      <View className="flex-row flex-wrap">
                        {WEEK_DAYS.map((day) => (
                          <Text key={day} className="mb-1 w-[14.28%] text-center text-xs font-semibold text-slate-400">
                            {day}
                          </Text>
                        ))}
                        {getCalendarDays(pickerMonth).map((date, index) => {
                          if (!date) return <View key={`empty-${index}`} className="mb-1 h-10 w-[14.28%]" />;

                          const selected = isSameDay(date, pickerValue);
                          // Future days and, for "To", every day on or before "From" are unavailable.
                          const disabled = isPickerDateDisabled(date, picker.field);

                          return (
                            <TouchableOpacity
                              key={date.toISOString()}
                              disabled={disabled}
                              onPress={() => selectPickerDate(date)}
                              className={`mb-1 h-10 w-[14.28%] items-center justify-center ${selected ? `rounded-full ${PRIMARY_BUTTON}` : ''}`}
                            >
                              <Text
                                className={`text-sm ${
                                  selected
                                    ? 'font-bold text-white'
                                    : disabled
                                      ? 'text-slate-300 dark:text-slate-600'
                                      : FIELD_TEXT
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
                      <View className={`mb-5 items-center rounded-2xl py-5 ${SOFT_TILE}`}>
                        <Text className="text-[11px] font-bold tracking-widest text-slate-500 dark:text-slate-400">
                          SELECTED TIME
                        </Text>

                        <Text className={`mt-2 text-4xl font-bold ${NAVY_TEXT}`}>
                          {String(pickerValue.getHours() % 12 || 12).padStart(2, '0')}:
                          {String(pickerValue.getMinutes()).padStart(2, '0')}{' '}
                          {pickerValue.getHours() >= 12 ? 'PM' : 'AM'}
                        </Text>

                        <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Scroll to select an hour and minute.
                        </Text>
                      </View>

                      <View className="mb-4 flex-row rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
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
                                selected ? PRIMARY_BUTTON : ''
                              }`}
                            >
                              <Text
                                className={`text-sm font-bold ${
                                  selected ? 'text-white' : 'text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                {period}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      <View className="flex-row gap-3">
                        <View className="flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                          <View className="border-b border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-900">
                            <Text className={`text-center text-xs font-bold tracking-wide ${NAVY_TEXT}`}>
                              HOUR
                            </Text>
                          </View>

                          <ScrollView
                            className="h-64"
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={{ paddingVertical: 8 }}
                          >
                            {Array.from({ length: 12 }, (_, index) => index + 1).map((hour) => {
                              const selected = (pickerValue.getHours() % 12 || 12) === hour;

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
                                    selected ? PRIMARY_BUTTON : ''
                                  }`}
                                >
                                  <Text
                                    className={`text-sm font-bold ${
                                      selected ? 'text-white' : FIELD_TEXT
                                    }`}
                                  >
                                    {String(hour).padStart(2, '0')}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                        </View>

                        <View className="flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                          <View className="border-b border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-900">
                            <Text className={`text-center text-xs font-bold tracking-wide ${NAVY_TEXT}`}>
                              MINUTE
                            </Text>
                          </View>

                          <ScrollView
                            className="h-64"
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={{ paddingVertical: 8 }}
                          >
                            {Array.from({ length: 60 }, (_, value) => {
                              const selected = pickerValue.getMinutes() === value;

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
                                    selected ? PRIMARY_BUTTON : ''
                                  }`}
                                >
                                  <Text
                                    className={`text-sm font-bold ${
                                      selected ? 'text-white' : FIELD_TEXT
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

              <View className="mt-4 flex-row items-center gap-3 self-stretch">
                <TouchableOpacity
                  onPress={() => setPicker(null)}
                  className={`h-11 flex-1 items-center justify-center rounded-xl ${SECONDARY_BUTTON}`}
                >
                  <Text className={`text-sm font-semibold ${MODAL_TITLE}`}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={doneDisabled}
                  onPress={applyPickerValue}
                  className={`h-11 flex-1 items-center justify-center rounded-xl ${PRIMARY_BUTTON} ${
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

      {/* Secondary Scrollable Month & Year Picker Modal */}
      <Modal
        visible={monthYearPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMonthYearPickerVisible(false)}
      >
        <View className="flex-1 items-center justify-center bg-black/50 px-5 dark:bg-black/60">
          <View className={`w-full rounded-2xl p-5 ${MODAL_CARD}`}>
            <Text className={`mb-4 text-center text-lg font-bold ${MODAL_TITLE}`}>
              Select Month & Year
            </Text>

            <View className="flex-row h-52 gap-4">
              <ScrollView className="flex-1 border-r border-slate-200 pr-2 dark:border-slate-700" showsVerticalScrollIndicator={false}>
                {MONTH_NAMES.map((month, index) => {
                  const selected = selectedTempMonth === index;
                  return (
                    <TouchableOpacity
                      key={month}
                      onPress={() => setSelectedTempMonth(index)}
                      className={`mb-1.5 rounded-lg p-2.5 ${selected ? PRIMARY_BUTTON : 'bg-slate-50 dark:bg-slate-800'}`}
                    >
                      <Text className={`text-center text-sm font-semibold ${selected ? 'text-white' : FIELD_TEXT}`}>
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
                      className={`mb-1.5 rounded-lg p-2.5 ${selected ? PRIMARY_BUTTON : 'bg-slate-50 dark:bg-slate-800'}`}
                    >
                      <Text className={`text-center text-sm font-semibold ${selected ? 'text-white' : FIELD_TEXT}`}>
                        {year}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <View className="mt-5 flex-row items-center gap-3">
              <TouchableOpacity
                onPress={() => setMonthYearPickerVisible(false)}
                className={`h-11 flex-1 items-center justify-center rounded-xl ${SECONDARY_BUTTON}`}
              >
                <Text className={`text-sm font-semibold ${MODAL_TITLE}`}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={applyMonthYearSelection}
                className={`h-11 flex-1 items-center justify-center rounded-xl ${PRIMARY_BUTTON}`}
              >
                <Text className="text-sm font-semibold text-white">Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success Ticket Code Modal */}
      <Modal
        visible={Boolean(successTicketCode)}
        transparent
        animationType="fade"
        onRequestClose={() => setSuccessTicketCode(null)}
      >
        <View className="flex-1 items-center justify-center bg-black/50 px-6 dark:bg-black/60">
          <View className={`w-full items-center rounded-2xl p-6 shadow-xl ${MODAL_CARD}`}>
            <View className="mb-3 h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
              <CheckCircle size={32} color={isDark ? '#34D399' : '#059669'} />
            </View>

            <Text className={`text-xl font-bold ${MODAL_TITLE}`}>Report Submitted</Text>
            <Text className="mt-1 text-center text-sm text-slate-500 dark:text-slate-400">
              Your lost item report has been successfully recorded.
            </Text>

            <View className="my-5 w-full items-center rounded-xl border border-slate-200 bg-slate-50 py-3 dark:border-slate-700 dark:bg-slate-800">
              <Text className="text-xs font-semibold text-slate-400">TICKET CODE</Text>
              <Text className={`mt-1 text-2xl font-black tracking-widest ${NAVY_TEXT}`}>
                {successTicketCode}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => setSuccessTicketCode(null)}
              className={`h-12 w-full items-center justify-center rounded-xl ${PRIMARY_BUTTON}`}
            >
              <Text className="text-sm font-semibold text-white">Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* General Alert Dialog Modal */}
      <Modal
        visible={alertModalConfig.visible}
        transparent
        animationType="fade"
        onRequestClose={hideAlert}
      >
        <View className="flex-1 items-center justify-center bg-black/50 px-6 dark:bg-black/60">
          <View className={`w-full items-center rounded-2xl p-6 shadow-xl ${MODAL_CARD}`}>
            <View className="mb-3 h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950">
              <AlertCircle size={32} color={isDark ? '#FBBF24' : '#D97706'} />
            </View>

            <Text className={`text-xl font-bold ${MODAL_TITLE}`}>
              {alertModalConfig.title}
            </Text>

            <Text className="mt-2 text-center text-sm text-slate-600 dark:text-slate-400">
              {alertModalConfig.message}
            </Text>

            <TouchableOpacity
              onPress={hideAlert}
              className={`mt-6 h-12 w-full items-center justify-center rounded-xl ${PRIMARY_BUTTON}`}
            >
              <Text className="text-sm font-semibold text-white">OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Photo Picker Modal */}
      <PhotoPickerModal
        visible={photoModalVisible}
        maxImages={MAX_PHOTOS}
        onClose={() => {
          setPhotoModalVisible(false);
          setPreserveHiddenTab(false);
        }}
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
        title="Submitting your report..."
        subtitle="Please wait while we send your lost item report."
      />
    </KeyboardAvoidingView>
  );
}