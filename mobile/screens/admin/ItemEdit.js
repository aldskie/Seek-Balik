// screens/admin/ItemEdit.jsx
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
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import PhotoPickerModal from '../../components/PhotoPickerModal';
import { useConfirmationModal } from '../../components/ConfirmationModal';
import { useAppearance } from '../../hooks/Appearance';
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  Clock,
  ImagePlus,
  Save,
  X,
} from 'lucide-react-native';

import { API_URL, editLostItem, getItemById } from '../../api/api';

const MAX_IMAGES = 3;

// ItemDetails.poster_name is a CharField(max_length=30) on the backend.
const POSTER_NAME_MAX_LENGTH = 30;

// Small delay helper — keeps the loading overlay on screen long enough to be
// seen even on a fast connection.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The backend stores the reporter's name in ONE field, `poster_name`
// ("Juan Dela Cruz") — there are no first_name / last_name fields on the
// item. This splits it for the two inputs: first word = first name, the
// rest = last name. Only used for display; a saved name is never re-sent.
const splitPosterName = (fullName) => {
  const trimmed = (fullName || '').trim();
  if (!trimmed) return { first: '', last: '' };
  const spaceIndex = trimmed.indexOf(' ');
  if (spaceIndex === -1) return { first: trimmed, last: '' };
  return {
    first: trimmed.slice(0, spaceIndex),
    last: trimmed.slice(spaceIndex + 1).trim(),
  };
};

// Turns whatever the API returns for an item's photos into one consistent
// shape: [{ id, image, key }]. Handles an `images` array of objects
// ({ id, image }), an `images` array of plain URL strings, and a single
// `image` field. `key` is a stable identifier used for React keys and for
// removing a photo even when it has no id.
const normalizeImages = (source) => {
  if (!source) return [];

  const raw = Array.isArray(source.images)
    ? source.images
    : source.image
      ? [source.image]
      : [];

  return raw
    .filter(Boolean)
    .map((entry, index) => {
      if (typeof entry === 'string') {
        return { id: null, image: entry, key: `url-${index}-${entry}` };
      }

      return {
        ...entry,
        image: entry.image || entry.image_url || entry.url || '',
        key: `id-${entry.id ?? index}`,
      };
    })
    .filter((entry) => entry.image);
};

// FIX: this list previously didn't match ItemDetails.CATEGORIES on the
// backend ("Personal", "School Supply", "Other" aren't valid choices), so
// saving with most of these selected failed serializer validation with a
// 400. Now mirrors the real model choices exactly (minus "All", which is
// a filter-only option, not a real item category).
const CATEGORIES = [
  'Accessories',
  'ID',
  'Academic Materials',
  'Bags & Wallets',
  'Clothing',
  'Electronic',
  'Keys',
];

// The same place choices as Add Items and Report Lost Item: every building on
// the campus map, spelled exactly as ItemDetails.LOCATIONS stores it
// (items/models.py). There is no "Others" choice here.
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
];

// Lost reports can list up to 3 places (same as Add Items / Report Lost
// Item); a Surrendered item has exactly 1.
const MAX_LOST_AREAS = 3;

// Older saved names that now mean one of the AREAS choices.
const AREA_ALIASES = {
  'criminology building': 'Verbist Building',
};

// Splits a saved location ("Library, Gymnasium") into the places that are
// on the list and the parts that aren't (older custom "Others" text).
const parseSavedAreas = (value) => {
  const known = [];
  const unknown = [];
  String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const lower = part.toLowerCase();
      const match =
        AREAS.find((area) => area.toLowerCase() === lower) || AREA_ALIASES[lower];
      if (match) {
        if (!known.includes(match)) known.push(match);
      } else {
        unknown.push(part);
      }
    });
  return { known, unknown };
};

// "14:30:00" (how the backend returns a time) -> "14:30". Anything that is
// not a time is returned as an empty string.
const toHourMinute = (value) => {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
};

// The date and time range saved on an item. The backend fields are
// start_date / start_time ("From") and the optional end_date / end_time
// ("To"); the older created_* names are still read as a fallback.
const readDateTimeRange = (source) => ({
  startDate: String(source?.start_date || source?.created_date || '').slice(0, 10),
  startTime: toHourMinute(source?.start_time || source?.created_time),
  endDate: String(source?.end_date || source?.created_date_to || '').slice(0, 10),
  endTime: toHourMinute(source?.end_time || source?.created_time_to),
});

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 11 }, (_, i) => CURRENT_YEAR - 5 + i);

// Extra scrollable room kept below the form while the keyboard is up, so the
// last fields can still be pulled clear of it. ReportLostItemScreen reserves
// the full keyboard height because its action buttons scroll with the form;
// here the Cancel/Save bar is fixed and KeyboardAvoidingView already shrinks
// the screen, so a fixed reserve is enough and avoids a screen-tall gap.
const KEYBOARD_SCROLL_RESERVE = 140;

export default function ItemEdit() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isDark } = useAppearance();
  const { params } = useRoute();
  const item = params?.item;
  const { confirmationModal, showFeedback } = useConfirmationModal();

  // AREA LOST / FOUND: chosen from the list only (no "Others" text box).
  // The saved location is split into the places on the list (pre-selected)
  // and any older custom text that isn't on the list. That custom text is
  // kept as it is unless the area is changed here.
  const savedAreas = parseSavedAreas(item?.location);
  const isSurrenderedItem = item?.type === 'Surrendered';
  const maxAreas = isSurrenderedItem ? 1 : MAX_LOST_AREAS;

  const [title, setTitle] = useState(item?.title || '');
  const [category, setCategory] = useState(item?.category || '');
  const [selectedAreas, setSelectedAreas] = useState(
    savedAreas.known.slice(0, maxAreas)
  );
  // True once the area is changed here; until then the saved location is
  // sent back exactly as it was.
  const [areaTouched, setAreaTouched] = useState(false);
  // WHEN THE ITEM WAS LOST / FOUND — a date and time range.
  // createdDate / createdTime are the start ("From") and are saved as
  // start_date / start_time. endDate / endTime are the optional end ("To")
  // and are saved as end_date / end_time; left blank, the item was lost or
  // found at a single moment.
  const initialRange = readDateTimeRange(item);
  const [createdDate, setCreatedDate] = useState(initialRange.startDate);
  const [createdTime, setCreatedTime] = useState(initialRange.startTime);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [endTime, setEndTime] = useState(initialRange.endTime);
  // Set once the admin changes a date or time, so the fetch below can't
  // overwrite what was just picked.
  const datesTouchedRef = useRef(false);
  const [description, setDescription] = useState(item?.description || '');
  const [saving, setSaving] = useState(false);

  // FIX: the reporter's name lives in `poster_name` on the backend. This
  // screen used to read and save `first_name` / `last_name`, which don't
  // exist on the item — so the fields always loaded blank, and anything
  // typed into them was silently dropped on save.
  //
  // nameLocked: the item already has a reporter name, so the fields are
  // filled in and read-only. They're only editable when the name is blank.
  const initialName = splitPosterName(item?.poster_name);
  const [firstName, setFirstName] = useState(initialName.first);
  const [lastName, setLastName] = useState(initialName.last);
  const [nameLocked, setNameLocked] = useState(Boolean((item?.poster_name || '').trim()));

  // Only Surrendered items collect ownership verification questions
  // (mirrors ItemReview, which only shows these for Surrendered items).
  const isSurrendered = item?.type === 'Surrendered';

  // The reporter's ID number is loaded for EVERY item type (Lost and
  // Surrendered), because the decline-notice email is sent to
  // student_id + school domain. The backend field is `student_id` (renamed
  // from `id_number`); the old key is still read as a fallback.
  const [idNumber, setIdNumber] = useState(item?.student_id || item?.id_number || '');
  // True once the latest student_id has been fetched from the server. Used
  // on save so a failed fetch can't overwrite a saved ID with a blank.
  const [idNumberLoaded, setIdNumberLoaded] = useState(false);
  const [verificationQuestions, setVerificationQuestions] = useState(() =>
    [1, 2, 3, 4].map((n) => ({
      question: item?.[`verification_question_${n}`] || '',
      answer: item?.[`verification_answer_${n}`] || '',
    }))
  );

  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');

  const [categoryOpen, setCategoryOpen] = useState(false);
  const [areaOpen, setAreaOpen] = useState(false);

  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Custom Date & Time Picker States — same modal flow as
  // ReportLostItemScreen, so the date/time here are always picked, never
  // typed, and can't reach the serializer in a shape it rejects.
  const [picker, setPicker] = useState(null); // 'date' | 'time'
  // Which end of the range the open picker is editing.
  const [pickerTarget, setPickerTarget] = useState('start'); // 'start' | 'end'
  const [pickerValue, setPickerValue] = useState(new Date());
  const [pickerMonth, setPickerMonth] = useState(new Date());

  // Month & Year Picker States
  const [monthYearPickerVisible, setMonthYearPickerVisible] = useState(false);
  const [selectedTempMonth, setSelectedTempMonth] = useState(new Date().getMonth());
  const [selectedTempYear, setSelectedTempYear] = useState(new Date().getFullYear());

  // Photos already saved on the server. Seeded from the list payload, then
  // replaced with the freshly fetched copy below (the list payload often
  // doesn't include the photos at all).
  const [keptImages, setKeptImages] = useState(() => normalizeImages(item));

  // Set once the admin removes a saved photo, so a slow fetch can't bring
  // the removed photo back.
  const imagesTouchedRef = useRef(false);

  // New local photos chosen from the phone.
  const [newImages, setNewImages] = useState([]);

  const formScrollRef = useRef(null);
  const titleInputRef = useRef(null);
  const firstNameInputRef = useRef(null);
  const lastNameInputRef = useRef(null);
  const idNumberInputRef = useRef(null);
  const verificationInputRefs = useRef([]);
  const descriptionInputRef = useRef(null);

  const focusedInputRef = useRef(null);
  const keyboardHeightRef = useRef(0);

  // Picks / unpicks a place. Surrendered: one place (picking replaces it).
  // Lost: up to MAX_LOST_AREAS places.
  const toggleArea = (area) => {
    setAreaTouched(true);
    if (maxAreas === 1) {
      setSelectedAreas([area]);
      setAreaOpen(false);
      return;
    }
    setSelectedAreas((prev) => {
      if (prev.includes(area)) return prev.filter((value) => value !== area);
      if (prev.length >= maxAreas) return prev;
      return [...prev, area];
    });
  };

  // What `location` is saved as: the picked places, or the original value
  // when the area wasn't changed (so older custom text isn't lost).
  const locationToSave = areaTouched
    ? selectedAreas.join(', ')
    : String(item?.location || '').trim() || selectedAreas.join(', ');

  // Re-measures the currently focused field against the ScrollView and
  // scrolls it just above the keyboard. Doing a fresh measurement every
  // time (instead of a one-shot helper) is what makes this work reliably
  // on the 2nd, 3rd, etc. focus, not just the first.
  const scrollFocusedInputAboveKeyboard = () => {
    const target = focusedInputRef.current;
    const scrollNode = formScrollRef.current;
    if (!target || !scrollNode) return;

    target.measureLayout(
      scrollNode,
      (x, y) => {
        scrollNode.scrollTo({ y: Math.max(y - 24, 0), animated: true });
      },
      () => {}
    );
  };

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      const height = event?.endCoordinates?.height ?? 0;
      keyboardHeightRef.current = height;
      setKeyboardHeight(height);

      requestAnimationFrame(scrollFocusedInputAboveKeyboard);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      keyboardHeightRef.current = 0;
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  // The item handed in from ItemsScreen's list can be a lighter or stale
  // payload, so the latest copy is fetched here (the same way ItemReview
  // does) to pre-fill the reporter's name and Student ID and, for
  // Surrendered items, the verification questions/answers.
  useEffect(() => {
    if (!item?.id) return;

    let cancelled = false;
    setDetailsLoading(true);
    setDetailsError('');

    (async () => {
      try {
        const response = await getItemById(item.id);
        const data = Array.isArray(response)
          ? response[0]
          : response?.results
            ? response.results[0]
            : response;

        if (!cancelled && data) {
          // Reporter name comes from `poster_name`. If the item has one,
          // show it and lock the fields; if not, leave them editable.
          const savedName = (data.poster_name || '').trim();
          if (savedName) {
            const { first, last } = splitPosterName(savedName);
            setFirstName(first);
            setLastName(last);
            setNameLocked(true);
          } else {
            setNameLocked(false);
          }

          // The reporter's Student ID is fetched for every item type — the
          // decline-notice email goes to student_id + school domain.
          setIdNumber(String(data.student_id || data.id_number || ''));
          setIdNumberLoaded(true);

          // FIX: load the photos currently saved on this item so they can
          // be removed or replaced. Skipped if the admin already removed a
          // photo while this request was still in flight.
          if (!imagesTouchedRef.current) {
            setKeptImages(normalizeImages(data));
          }

          // The latest saved date and time range, unless the admin already
          // changed one of them while this request was in flight.
          if (!datesTouchedRef.current) {
            const range = readDateTimeRange(data);
            if (range.startDate) setCreatedDate(range.startDate);
            if (range.startTime) setCreatedTime(range.startTime);
            setEndDate(range.endDate);
            setEndTime(range.endTime);
          }

          if (isSurrendered) {
            setVerificationQuestions(
              [1, 2, 3, 4].map((n) => ({
                question: data[`verification_question_${n}`] || '',
                answer: data[`verification_answer_${n}`] || '',
              }))
            );
          }
        }
      } catch (error) {
        if (!cancelled) {
          setDetailsError('Could not load the latest reporter and verification details.');
        }
      } finally {
        if (!cancelled) setDetailsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  const closeDropdowns = () => {
    setCategoryOpen(false);
    setAreaOpen(false);
  };

  const scrollFocusedInputIntoView = (inputRef) => {
    focusedInputRef.current = inputRef.current;
    // If the keyboard is already up, no keyboardDidShow event will fire for
    // this field, so re-measure and scroll straight away.
    if (keyboardHeightRef.current > 0) {
      requestAnimationFrame(scrollFocusedInputAboveKeyboard);
    }
  };

  const handleInputFocus = (inputRef) => {
    closeDropdowns();
    scrollFocusedInputIntoView(inputRef);
  };

  // Verification question/answer inputs are stored in a ref array (their
  // count can change) rather than individual refs, so they get their own
  // small focus handler instead of going through handleInputFocus.
  const handleVerificationInputFocus = (node) => {
    closeDropdowns();
    focusedInputRef.current = node;
    if (keyboardHeightRef.current > 0) {
      requestAnimationFrame(scrollFocusedInputAboveKeyboard);
    }
  };

  const updateVerificationField = (index, field, value) => {
    setVerificationQuestions((current) =>
      current.map((qa, i) => (i === index ? { ...qa, [field]: value } : qa))
    );
  };

  // "YYYY-MM-DD" -> a local Date. Built from the parts rather than
  // new Date(string) so the day isn't read as UTC midnight and shown as the
  // day before. Returns null for anything else.
  const parseDateValue = (value) => {
    const [year, month, day] = String(value || '').split('-').map(Number);
    return year && month && day ? new Date(year, month - 1, day) : null;
  };

  // `target` is which end of the range is being picked: 'start' or 'end'.
  const openPicker = (mode, target = 'start') => {
    Keyboard.dismiss();
    closeDropdowns();

    // The "To" pickers open on the saved "To" value, or on the "From" value
    // when there is none yet.
    const dateValue = target === 'end' ? endDate || createdDate : createdDate;
    const timeValue = target === 'end' ? endTime || createdTime : createdTime;

    let initialDate = new Date();

    if (mode === 'date') {
      initialDate = parseDateValue(dateValue) || initialDate;
    } else if (mode === 'time' && timeValue) {
      const [hours, minutes] = timeValue.split(':').map(Number);
      initialDate.setHours(hours || 0, minutes || 0, 0, 0);
    }

    setPickerValue(initialDate);
    setPickerMonth(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
    setPickerTarget(target);
    setPicker(mode);
  };

  // Removes the optional "To" date and time, making it a single moment again.
  const clearEndRange = () => {
    datesTouchedRef.current = true;
    setEndDate('');
    setEndTime('');
  };

  const applyPickerValue = () => {
    if (!picker) return;

    if (picker === 'date') {
      const year = pickerValue.getFullYear();
      const month = String(pickerValue.getMonth() + 1).padStart(2, '0');
      const day = String(pickerValue.getDate()).padStart(2, '0');
      const value = `${year}-${month}-${day}`;
      if (pickerTarget === 'end') setEndDate(value);
      else setCreatedDate(value);
    } else {
      const hours = String(pickerValue.getHours()).padStart(2, '0');
      const minutes = String(pickerValue.getMinutes()).padStart(2, '0');
      const value = `${hours}:${minutes}`;
      if (pickerTarget === 'end') setEndTime(value);
      else setCreatedTime(value);
    }

    datesTouchedRef.current = true;

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
    setPickerMonth(new Date(selectedTempYear, selectedTempMonth, 1));
    setMonthYearPickerVisible(false);
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

  const formatTimeLabel = (value) => {
    if (!value) return '';
    const [hours, minutes] = value.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    return `${String(hours % 12 || 12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
  };

  const getImageUrl = (image) => {
    const imageValue = typeof image === 'string' ? image : image?.image;

    if (!imageValue) return null;
    if (imageValue.startsWith('http')) return imageValue;

    return `${API_URL.replace(/\/$/, '')}${imageValue}`;
  };

  const saveSelectedPhotos = (assets) => {
    const slotsLeft = MAX_IMAGES - keptImages.length - newImages.length;

    setNewImages((currentImages) => [
      ...currentImages,
      ...assets.slice(0, slotsLeft).map((asset) => ({
        uri: asset.uri,
        name: asset.fileName || `item-image-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      })),
    ]);
  };

  const selectFromLibrary = async () => {
    const slotsLeft = MAX_IMAGES - keptImages.length - newImages.length;

    if (slotsLeft <= 0) {
      showFeedback({
        title: 'Photo limit reached',
        message: `You can upload up to ${MAX_IMAGES} photos.`,
        tone: 'warning',
      });
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      showFeedback({
        title: 'Permission required',
        message: 'Allow photo-library access to select item photos.',
        tone: 'warning',
      });
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: slotsLeft,
      quality: 0.8,
    });

    if (!result.canceled) {
      saveSelectedPhotos(result.assets);
    }
  };

  const captureWithCamera = async () => {
    const slotsLeft = MAX_IMAGES - keptImages.length - newImages.length;

    if (slotsLeft <= 0) {
      showFeedback({
        title: 'Photo limit reached',
        message: `You can upload up to ${MAX_IMAGES} photos.`,
        tone: 'warning',
      });
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      showFeedback({
        title: 'Permission required',
        message: 'Allow camera access to take an item photo.',
        tone: 'warning',
      });
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (!result.canceled) {
      saveSelectedPhotos(result.assets);
    }
  };

  const removeExistingImage = (imageKey) => {
    imagesTouchedRef.current = true;
    setKeptImages((currentImages) =>
      currentImages.filter((image) => image.key !== imageKey)
    );
  };

  const removeNewImage = (imageUri) => {
    setNewImages((currentImages) =>
      currentImages.filter((image) => image.uri !== imageUri)
    );
  };

  // Flow: SAVE CHANGES -> inline loading overlay -> success/error modal.
  // The overlay is a plain View in this screen's tree (like LoginScreen's
  // isSubmitting overlay), and is removed BEFORE the result modal shows.
  const saveChanges = async () => {
    if (saving) return;

    if (!title.trim() || !category.trim() || !locationToSave) {
      showFeedback({
        title: 'Missing details',
        message: 'Item name, category, and area lost/found are required.',
        tone: 'warning',
      });
      return;
    }

    if (areaTouched && (selectedAreas.length < 1 || selectedAreas.length > maxAreas)) {
      showFeedback({
        title: 'Missing details',
        message: isSurrenderedItem
          ? 'Please choose the area where the item was found.'
          : `Please choose 1 to ${MAX_LOST_AREAS} areas where the item was lost.`,
        tone: 'warning',
      });
      return;
    }

    // DATE AND TIME RANGE — the "To" values are optional, but when given
    // they can't come before the "From" values.
    if ((endDate || endTime) && (!createdDate || !createdTime)) {
      showFeedback({
        title: 'Missing details',
        message: 'Please set the "From" date and time before adding a "To" date or time.',
        tone: 'warning',
      });
      return;
    }

    // "YYYY-MM-DD" and "HH:MM" compare correctly as plain text.
    if (endDate && endDate < createdDate) {
      showFeedback({
        title: 'Check the dates',
        message: 'The "To" date cannot be earlier than the "From" date.',
        tone: 'warning',
      });
      return;
    }

    // The times are only compared when both fall on the same day.
    if (endTime && (!endDate || endDate === createdDate) && endTime < createdTime) {
      showFeedback({
        title: 'Check the times',
        message: 'The "To" time cannot be earlier than the "From" time on the same day.',
        tone: 'warning',
      });
      return;
    }

    // A name typed into the (unlocked) fields is saved as one `poster_name`.
    const typedName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');

    if (!nameLocked && typedName.length > POSTER_NAME_MAX_LENGTH) {
      showFeedback({
        title: 'Name too long',
        message: `The reporter's full name can be up to ${POSTER_NAME_MAX_LENGTH} characters.`,
        tone: 'warning',
      });
      return;
    }

    Keyboard.dismiss();
    setSaving(true);

    try {
      const formData = new FormData();

      formData.append('title', title.trim());
      formData.append('category', category.trim());
      // One or more places from the list, e.g. "Library, Gymnasium".
      formData.append('location', locationToSave);
      formData.append('description', description.trim());
      // The status is not edited here (it changes through Approve, Decline,
      // Mark as Claimed and Archive), so it isn't sent.

      // FIX: the reporter's name is saved to `poster_name` (the backend has
      // no first_name / last_name on items, so those were being dropped).
      // Only sent when the item had no name and one was typed in — an
      // existing name is locked and left untouched.
      if (!nameLocked && typedName) {
        formData.append('poster_name', typedName);
      }

      // The reporter's Student ID is sent for every item type, since the
      // decline-notice email is addressed from it. If the latest value
      // couldn't be fetched and the field is blank, it's left out so a
      // saved ID isn't wiped by accident.
      if (idNumberLoaded || idNumber.trim()) {
        formData.append('student_id', idNumber.trim());
      }

      // Only Surrendered items have verification question/answer fields.
      if (isSurrendered) {
        verificationQuestions.forEach((qa, index) => {
          formData.append(`verification_question_${index + 1}`, qa.question.trim());
          formData.append(`verification_answer_${index + 1}`, qa.answer.trim());
        });
      }

      // DATE AND TIME RANGE. Sent under the backend's current names
      // (start_* / end_*) and under the older created_* names, so the save
      // works whichever names the server reads.
      if (createdDate.trim()) {
        formData.append('start_date', createdDate.trim());
        formData.append('created_date', createdDate.trim());
      }

      if (createdTime.trim()) {
        formData.append('start_time', createdTime.trim());
        formData.append('created_time', createdTime.trim());
      }

      // The "To" values are always sent: an empty value clears a "To" date
      // or time that was saved before.
      formData.append('end_date', endDate.trim());
      formData.append('end_time', endTime.trim());
      formData.append('created_date_to', endDate.trim());
      formData.append('created_time_to', endTime.trim());

      // Your Django view uses this to determine which existing photos remain.
      formData.append(
        'keep_image_ids',
        JSON.stringify(
          keptImages
            .map((image) => image.id)
            .filter((id) => id !== null && id !== undefined)
        )
      );

      newImages.forEach((image) => {
        formData.append('image', {
          uri: image.uri,
          name: image.name,
          type: image.type,
        });
      });

      // Keep the loader on screen for a minimum time so it's visible even
      // on a fast connection.
      await Promise.all([editLostItem(item.id, formData), wait(600)]);

      // Hide the loader before the success modal appears.
      setSaving(false);

      showFeedback({
        title: 'Saved',
        message: 'Item changes were saved successfully.',
        tone: 'success',
        onClose: () => navigation.goBack(),
      });
    } catch (error) {
      setSaving(false);

      const responseData = error.response?.data;

      showFeedback({
        title: 'Save failed',
        message:
          responseData?.error ||
          responseData?.poster_name?.[0] ||
          responseData?.student_id?.[0] ||
          'Could not save item changes. Please try again.',
        tone: 'error',
      });
    }
  };

  if (!item) return null;

  const allImageCount = keptImages.length + newImages.length;

  // Locked name fields are greyed out so it's clear they can't be edited.
  const nameBoxClass = `relative overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 ${
    nameLocked ? 'bg-slate-100 dark:bg-slate-800' : ''
  }`;
  const nameTextClass = `h-11 px-3 text-sm ${
    nameLocked ? 'text-slate-500 dark:text-slate-400' : 'text-[#16233F] dark:text-slate-100'
  }`;

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-[#F7F8FC] dark:bg-slate-950"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
      <StatusBar style="light" backgroundColor="#1B2061" translucent={false} />

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
              ADMIN
            </Text>

            <Text className="text-2xl font-bold text-white">
              Edit Item
            </Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        ref={formScrollRef}
        className="flex-1"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: keyboardHeight > 0 ? KEYBOARD_SCROLL_RESERVE : 24,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View className="rounded-2xl bg-white dark:bg-slate-900 p-4">
          <Text className="text-xs font-semibold text-slate-400 dark:text-slate-500">
            {item.ticket_code || `Item #${item.id}`} · {item.type || 'Item'}
          </Text>

          <Text className="mt-1 text-lg font-bold text-[#16233F] dark:text-slate-100">
            Update reported item
          </Text>

          <View className="mt-5">
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="text-xs font-bold tracking-wide text-[#1B2061] dark:text-indigo-200">
                PHOTOS (OPTIONAL)
              </Text>

              <Text className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                {allImageCount}/{MAX_IMAGES}
              </Text>
            </View>

            <View className="flex-row gap-3">
              {[0, 1, 2].map((slotIndex) => {
                const existingImage = keptImages[slotIndex];
                const newImageIndex = slotIndex - keptImages.length;
                const newImage = newImages[newImageIndex];
                const showAddButton =
                  slotIndex === allImageCount && allImageCount < MAX_IMAGES;

                if (existingImage) {
                  return (
                    <View
                      key={`existing-${existingImage.key}`}
                      className="relative aspect-square flex-1 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    >
                      <Image
                        source={{ uri: getImageUrl(existingImage) }}
                        className="h-full w-full"
                        resizeMode="cover"
                      />

                      <TouchableOpacity
                        onPress={() => removeExistingImage(existingImage.key)}
                        className="absolute right-2 top-2 h-7 w-7 items-center justify-center rounded-full bg-black/70"
                      >
                        <X size={14} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  );
                }

                if (newImage) {
                  return (
                    <View
                      key={`new-${newImage.uri}`}
                      className="relative aspect-square flex-1 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    >
                      <Image
                        source={{ uri: newImage.uri }}
                        className="h-full w-full"
                        resizeMode="cover"
                      />

                      <TouchableOpacity
                        onPress={() => removeNewImage(newImage.uri)}
                        className="absolute right-2 top-2 h-7 w-7 items-center justify-center rounded-full bg-black/70"
                      >
                        <X size={14} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  );
                }

                if (showAddButton) {
                  return (
                    <TouchableOpacity
                      key="add-photo"
                      onPress={() => {
                        Keyboard.dismiss();
                        closeDropdowns();
                        setPhotoModalVisible(true);
                      }}
                      className="aspect-square flex-1 items-center justify-center rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700"
                    >
                      <ImagePlus size={28} color={isDark ? '#94A3B8' : '#5B647A'} />
                      <Text className="mt-1 text-[10px] font-bold text-[#5B647A] dark:text-slate-400">
                        Add Photo
                      </Text>
                    </TouchableOpacity>
                  );
                }

                return <View key={`empty-${slotIndex}`} className="aspect-square flex-1" />;
              })}
            </View>
          </View>

          <Text className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
            {allImageCount}/{MAX_IMAGES} photos · Swipe to view photos
          </Text>
        </View>

        {/* Reporter Details: ID number, then first and last name. */}
        <Text className="mb-2 mt-6 text-xs font-bold tracking-wide text-[#1B2061] dark:text-indigo-200">
          REPORTER DETAILS
        </Text>

        <View className="rounded-2xl bg-white dark:bg-slate-900 px-4">
          <View className="border-b border-slate-100 dark:border-slate-800 py-3">
            {/* Reporter's ID number — shown for every item type. The
                decline-notice email is sent to this ID + the school domain. */}
            <Text className="mb-2 text-[10px] font-bold tracking-wide text-slate-400 dark:text-slate-500">
              ID NUMBER
            </Text>

            <View className="relative overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
              <TextInput
                ref={idNumberInputRef}
                value={idNumber}
                onChangeText={(value) => setIdNumber(value.replace(/\D/g, '').slice(0, 8))}
                onFocus={() => handleInputFocus(idNumberInputRef)}
                placeholder={detailsLoading ? 'Loading…' : 'ID number'}
                placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                keyboardType="number-pad"
                maxLength={8}
                className="h-11 px-3 text-sm text-[#16233F] dark:text-slate-100"
              />

              <LinearGradient
                colors={['rgba(15,23,42,0.14)', 'rgba(15,23,42,0)']}
                className="absolute inset-x-0 top-0 h-1.5 opacity-30 dark:opacity-0"
                pointerEvents="none"
              />
            </View>

            <Text className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
              {idNumber.trim()
                ? "Notices such as a declined report are emailed to this ID number's school email."
                : 'No ID number on record — a declined-report notice cannot be emailed without one.'}
            </Text>
          </View>

          {/* Reported by — filled in and read-only when the item already has
              a reporter name; editable only when it's blank. */}
          <View className="py-3">
            <Text className="mb-2 text-[10px] font-bold tracking-wide text-slate-400 dark:text-slate-500">
              REPORTED BY
            </Text>

            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="mb-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                  FIRST NAME
                </Text>

                <View className={nameBoxClass} pointerEvents={nameLocked ? 'none' : 'auto'}>
                  <TextInput
                    ref={firstNameInputRef}
                    value={firstName}
                    onChangeText={setFirstName}
                    editable={!nameLocked}
                    onFocus={() => handleInputFocus(firstNameInputRef)}
                    placeholder={detailsLoading ? 'Loading…' : 'First name'}
                    placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                    className={nameTextClass}
                  />

                  <LinearGradient
                    colors={['rgba(15,23,42,0.14)', 'rgba(15,23,42,0)']}
                    className="absolute inset-x-0 top-0 h-1.5 opacity-30 dark:opacity-0"
                    pointerEvents="none"
                  />
                </View>
              </View>

              <View className="flex-1">
                <Text className="mb-1.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                  LAST NAME
                </Text>

                <View className={nameBoxClass} pointerEvents={nameLocked ? 'none' : 'auto'}>
                  <TextInput
                    ref={lastNameInputRef}
                    value={lastName}
                    onChangeText={setLastName}
                    editable={!nameLocked}
                    onFocus={() => handleInputFocus(lastNameInputRef)}
                    placeholder={detailsLoading ? 'Loading…' : 'Last name'}
                    placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                    className={nameTextClass}
                  />

                  <LinearGradient
                    colors={['rgba(15,23,42,0.14)', 'rgba(15,23,42,0)']}
                    className="absolute inset-x-0 top-0 h-1.5 opacity-30 dark:opacity-0"
                    pointerEvents="none"
                  />
                </View>
              </View>
            </View>

            <Text className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
              {nameLocked
                ? "The reporter's name is already on record and can't be changed."
                : 'No reporter name on record yet — you can add one.'}
            </Text>
          </View>
        </View>

        {/* Item Details: category, item name, area lost / found. */}
        <Text className="mb-2 mt-6 text-xs font-bold tracking-wide text-[#1B2061] dark:text-indigo-200">
          ITEM DETAILS
        </Text>

        <View className="rounded-2xl bg-white dark:bg-slate-900 px-4">
          <View className="border-b border-slate-100 dark:border-slate-800 py-3">
            <Text className="mb-2 text-[10px] font-bold tracking-wide text-slate-400 dark:text-slate-500">
              CATEGORY *
            </Text>

            <TouchableOpacity
              onPress={() => {
                Keyboard.dismiss();
                setCategoryOpen((open) => !open);
                setAreaOpen(false);
              }}
              className="relative h-11 flex-row items-center justify-between overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 px-3"
            >
              <LinearGradient
                colors={['rgba(15,23,42,0.14)', 'rgba(15,23,42,0)']}
                className="absolute inset-x-0 top-0 h-1.5 opacity-30 dark:opacity-0"
                pointerEvents="none"
              />

              <Text className="text-sm text-[#16233F] dark:text-slate-100">
                {category || 'Select category'}
              </Text>

              <ChevronDown
                size={18}
                color={isDark ? '#94A3B8' : '#5B647A'}
                style={{ transform: [{ rotate: categoryOpen ? '180deg' : '0deg' }] }}
              />
            </TouchableOpacity>

            {categoryOpen && (
              <View className="mt-1 overflow-hidden rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800">
                {CATEGORIES.map((option) => (
                  <TouchableOpacity
                    key={option}
                    onPress={() => {
                      setCategory(option);
                      setCategoryOpen(false);
                    }}
                    className="flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 px-3 py-3 last:border-b-0"
                  >
                    <Text
                      className={`text-sm ${
                        category === option
                          ? 'font-bold text-[#1B2061] dark:text-indigo-200'
                          : 'text-[#16233F] dark:text-slate-100'
                      }`}
                    >
                      {option}
                    </Text>

                    {category === option ? <Check size={16} color={isDark ? '#C7D2FE' : '#1B2061'} /> : null}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View className="border-b border-slate-100 dark:border-slate-800 py-3">
            <Text className="mb-2 text-[10px] font-bold tracking-wide text-slate-400 dark:text-slate-500">
              ITEM NAME *
            </Text>

            <View className="relative overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
              <TextInput
                ref={titleInputRef}
                value={title}
                onChangeText={setTitle}
                onFocus={() => handleInputFocus(titleInputRef)}
                placeholder="Item name"
                placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                className="h-11 px-3 text-sm text-[#16233F] dark:text-slate-100"
              />

              <LinearGradient
                colors={['rgba(15,23,42,0.14)', 'rgba(15,23,42,0)']}
                className="absolute inset-x-0 top-0 h-1.5 opacity-30 dark:opacity-0"
                pointerEvents="none"
              />
            </View>
          </View>

          <View className="py-3">
            <Text className="mb-2 text-[10px] font-bold tracking-wide text-slate-400 dark:text-slate-500">
              {item.type === 'Surrendered' ? 'AREA FOUND *' : 'AREA LOST *'}
            </Text>

            <TouchableOpacity
              onPress={() => {
                Keyboard.dismiss();
                setAreaOpen((open) => !open);
                setCategoryOpen(false);
              }}
              className="relative h-11 flex-row items-center justify-between overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 px-3"
            >
              <LinearGradient
                colors={['rgba(15,23,42,0.14)', 'rgba(15,23,42,0)']}
                className="absolute inset-x-0 top-0 h-1.5 opacity-30 dark:opacity-0"
                pointerEvents="none"
              />

              <Text
                numberOfLines={1}
                className={`flex-1 pr-2 text-sm ${
                  selectedAreas.length > 0
                    ? 'text-[#16233F] dark:text-slate-100'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {selectedAreas.length > 0 ? selectedAreas.join(', ') : 'Select area'}
              </Text>

              <ChevronDown
                size={18}
                color={isDark ? '#94A3B8' : '#5B647A'}
                style={{ transform: [{ rotate: areaOpen ? '180deg' : '0deg' }] }}
              />
            </TouchableOpacity>

            {!isSurrenderedItem ? (
              <Text className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                Choose up to {MAX_LOST_AREAS} areas ({selectedAreas.length}/{MAX_LOST_AREAS} selected).
              </Text>
            ) : null}

            {/* Older custom text that isn't one of the choices: kept as it
                is unless an area is picked here. */}
            {!areaTouched && savedAreas.unknown.length > 0 ? (
              <Text className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                Saved area "{savedAreas.unknown.join(', ')}" is not one of the choices. It stays
                as it is unless you pick an area from the list.
              </Text>
            ) : null}

            {areaOpen && (
              <View className="mt-1 overflow-hidden rounded-lg border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800">
                <ScrollView
                  style={{ maxHeight: 224 }}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {AREAS.map((option) => {
                    const selected = selectedAreas.includes(option);
                    // Lost: once 3 are picked, the others can't be added.
                    const disabled =
                      !selected && maxAreas > 1 && selectedAreas.length >= maxAreas;
                    return (
                      <TouchableOpacity
                        key={option}
                        disabled={disabled}
                        onPress={() => toggleArea(option)}
                        className={`flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 px-3 py-3 last:border-b-0 ${
                          disabled ? 'opacity-40' : ''
                        }`}
                      >
                        <Text
                          className={`flex-1 pr-2 text-sm ${
                            selected
                              ? 'font-bold text-[#1B2061] dark:text-indigo-200'
                              : 'text-[#16233F] dark:text-slate-100'
                          }`}
                        >
                          {option}
                        </Text>

                        {selected ? <Check size={16} color={isDark ? '#C7D2FE' : '#1B2061'} /> : null}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>
        </View>

        {/* Date and Time Details: date (From / To), then time (From / To). */}
        <Text className="mb-2 mt-6 text-xs font-bold tracking-wide text-[#1B2061] dark:text-indigo-200">
          DATE AND TIME DETAILS
        </Text>

        <View className="rounded-2xl bg-white dark:bg-slate-900 px-4">
          <View className="py-3">
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Text className="mb-2 text-[10px] font-bold tracking-wide text-slate-400 dark:text-slate-500">
                  {item.type === 'Surrendered' ? 'DATE FOUND (FROM)' : 'DATE LOST (FROM)'}
                </Text>

                <TouchableOpacity
                  onPress={() => openPicker('date', 'start')}
                  className="relative h-11 flex-row items-center overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 px-3"
                >
                  <Calendar size={14} color={isDark ? '#94A3B8' : '#5B647A'} />

                  <Text
                    className={`ml-2 flex-1 text-sm ${
                      createdDate ? 'text-[#16233F] dark:text-slate-100' : 'text-[#94A3B8] dark:text-slate-500'
                    }`}
                  >
                    {createdDate || 'YYYY-MM-DD'}
                  </Text>

                  <LinearGradient
                    colors={['rgba(15,23,42,0.14)', 'rgba(15,23,42,0)']}
                    className="absolute inset-x-0 top-0 h-1.5 opacity-30 dark:opacity-0"
                    pointerEvents="none"
                  />
                </TouchableOpacity>
              </View>

              <View className="flex-1">
                <Text className="mb-2 text-[10px] font-bold tracking-wide text-slate-400 dark:text-slate-500">
                  DATE (TO) · OPTIONAL
                </Text>

                <TouchableOpacity
                  onPress={() => openPicker('date', 'end')}
                  className="relative h-11 flex-row items-center overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 px-3"
                >
                  <Calendar size={14} color={isDark ? '#94A3B8' : '#5B647A'} />

                  <Text
                    className={`ml-2 flex-1 text-sm ${
                      endDate ? 'text-[#16233F] dark:text-slate-100' : 'text-[#94A3B8] dark:text-slate-500'
                    }`}
                  >
                    {endDate || 'YYYY-MM-DD'}
                  </Text>

                  <LinearGradient
                    colors={['rgba(15,23,42,0.14)', 'rgba(15,23,42,0)']}
                    className="absolute inset-x-0 top-0 h-1.5 opacity-30 dark:opacity-0"
                    pointerEvents="none"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Second row: the times. The "To" date and time are the
                optional end of the range; left blank, the item was lost
                or found at a single moment. */}
            <View className="mt-3 flex-row gap-3">
              <View className="flex-1">
                <Text className="mb-2 text-[10px] font-bold tracking-wide text-slate-400 dark:text-slate-500">
                  {item.type === 'Surrendered' ? 'TIME FOUND (FROM)' : 'TIME LOST (FROM)'}
                </Text>

                <TouchableOpacity
                  onPress={() => openPicker('time', 'start')}
                  className="relative h-11 flex-row items-center overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 px-3"
                >
                  <Clock size={14} color={isDark ? '#94A3B8' : '#5B647A'} />

                  <Text
                    className={`ml-2 flex-1 text-sm ${
                      createdTime ? 'text-[#16233F] dark:text-slate-100' : 'text-[#94A3B8] dark:text-slate-500'
                    }`}
                    numberOfLines={1}
                  >
                    {formatTimeLabel(createdTime) || 'HH:MM'}
                  </Text>

                  <LinearGradient
                    colors={['rgba(15,23,42,0.14)', 'rgba(15,23,42,0)']}
                    className="absolute inset-x-0 top-0 h-1.5 opacity-30 dark:opacity-0"
                    pointerEvents="none"
                  />
                </TouchableOpacity>
              </View>

              <View className="flex-1">
                <Text className="mb-2 text-[10px] font-bold tracking-wide text-slate-400 dark:text-slate-500">
                  TIME (TO) · OPTIONAL
                </Text>

                <TouchableOpacity
                  onPress={() => openPicker('time', 'end')}
                  className="relative h-11 flex-row items-center overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 px-3"
                >
                  <Clock size={14} color={isDark ? '#94A3B8' : '#5B647A'} />

                  <Text
                    className={`ml-2 flex-1 text-sm ${
                      endTime ? 'text-[#16233F] dark:text-slate-100' : 'text-[#94A3B8] dark:text-slate-500'
                    }`}
                    numberOfLines={1}
                  >
                    {formatTimeLabel(endTime) || 'HH:MM'}
                  </Text>

                  <LinearGradient
                    colors={['rgba(15,23,42,0.14)', 'rgba(15,23,42,0)']}
                    className="absolute inset-x-0 top-0 h-1.5 opacity-30 dark:opacity-0"
                    pointerEvents="none"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {endDate || endTime ? (
              <TouchableOpacity
                onPress={clearEndRange}
                className="mt-2 flex-row items-center self-start"
              >
                <X size={12} color={isDark ? '#FDA4AF' : '#BE123C'} />
                <Text className="ml-1 text-[11px] font-bold text-rose-700 dark:text-rose-300">
                  Clear "To" date and time
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Description. */}
        <Text className="mb-2 mt-6 text-xs font-bold tracking-wide text-[#1B2061] dark:text-indigo-200">
          DESCRIPTION
        </Text>

        <View className="rounded-2xl bg-white dark:bg-slate-900 px-4">
          <View className="py-3">

            <View className="relative overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
              <TextInput
                ref={descriptionInputRef}
                multiline
                value={description}
                onChangeText={setDescription}
                onFocus={() => handleInputFocus(descriptionInputRef)}
                textAlignVertical="top"
                placeholder="Add identifying details about the item."
                placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                className="min-h-28 px-3 py-3 text-sm leading-6 text-[#16233F] dark:text-slate-100"
              />

              <LinearGradient
                colors={['rgba(15,23,42,0.14)', 'rgba(15,23,42,0)']}
                className="absolute inset-x-0 top-0 h-1.5 opacity-30 dark:opacity-0"
                pointerEvents="none"
              />
            </View>
          </View>
        </View>

        {isSurrendered && (
          <>
            <Text className="mb-2 mt-6 text-xs font-bold tracking-wide text-[#1B2061] dark:text-indigo-200">
              OWNERSHIP VERIFICATION QUESTIONS
            </Text>

            <View className="rounded-2xl bg-white dark:bg-slate-900 px-4">
              {verificationQuestions.map((qa, index) => (
                <View
                  key={index}
                  className={`py-3 ${
                    index === verificationQuestions.length - 1 ? '' : 'border-b border-slate-100 dark:border-slate-800'
                  }`}
                >
                  <Text className="mb-2 text-[10px] font-bold tracking-wide text-slate-400 dark:text-slate-500">
                    QUESTION {index + 1}
                  </Text>

                  <View className="relative mb-2 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                    <TextInput
                      ref={(node) => {
                        verificationInputRefs.current[index * 2] = node;
                      }}
                      value={qa.question}
                      onChangeText={(value) => updateVerificationField(index, 'question', value)}
                      onFocus={() =>
                        handleVerificationInputFocus(verificationInputRefs.current[index * 2])
                      }
                      placeholder={detailsLoading ? 'Loading…' : `Verification question ${index + 1}`}
                      placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                      className="h-11 px-3 text-sm text-[#16233F] dark:text-slate-100"
                    />

                    <LinearGradient
                      colors={['rgba(15,23,42,0.14)', 'rgba(15,23,42,0)']}
                      className="absolute inset-x-0 top-0 h-1.5 opacity-30 dark:opacity-0"
                      pointerEvents="none"
                    />
                  </View>

                  <Text className="mb-2 text-[10px] font-bold tracking-wide text-slate-400 dark:text-slate-500">
                    ANSWER {index + 1}
                  </Text>

                  <View className="relative overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                    <TextInput
                      ref={(node) => {
                        verificationInputRefs.current[index * 2 + 1] = node;
                      }}
                      value={qa.answer}
                      onChangeText={(value) => updateVerificationField(index, 'answer', value)}
                      onFocus={() =>
                        handleVerificationInputFocus(verificationInputRefs.current[index * 2 + 1])
                      }
                      placeholder={detailsLoading ? 'Loading…' : `Answer ${index + 1}`}
                      placeholderTextColor={isDark ? '#64748B' : '#94A3B8'}
                      className="h-11 px-3 text-sm text-[#16233F] dark:text-slate-100"
                    />

                    <LinearGradient
                      colors={['rgba(15,23,42,0.14)', 'rgba(15,23,42,0)']}
                      className="absolute inset-x-0 top-0 h-1.5 opacity-30 dark:opacity-0"
                      pointerEvents="none"
                    />
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {detailsError ? (
          <Text className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-300">{detailsError}</Text>
        ) : null}
      </ScrollView>

      <SafeAreaView
        edges={['bottom']}
        className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-4 py-3"
      >
        <View className="flex-row gap-3">
          <TouchableOpacity
            disabled={saving}
            onPress={() => navigation.goBack()}
            className="flex-1 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 py-3.5"
          >
            <Text className="text-xs font-bold text-slate-600 dark:text-slate-300">
              CANCEL
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            disabled={saving}
            onPress={saveChanges}
            className="flex-[1.4] flex-row items-center justify-center rounded-xl bg-[#1B2061] dark:bg-indigo-600 py-3.5"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Save size={17} color="#FFFFFF" />
            )}

            <Text className="ml-2 text-xs font-bold text-white">
              {saving ? 'SAVING...' : 'SAVE CHANGES'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Primary Date and Time Picker Modal */}
      <Modal
        visible={Boolean(picker)}
        transparent
        animationType="fade"
        onRequestClose={() => setPicker(null)}
      >
        <View className="flex-1 items-center justify-center bg-black/40 dark:bg-black/60 px-5">
          <View className="w-full overflow-hidden rounded-2xl bg-white dark:bg-slate-900">
            <View className="bg-[#1b2061] px-5 py-4">
              <Text className="text-lg font-bold text-white">
                Select {pickerTarget === 'end' ? '"To"' : '"From"'} {picker === 'date' ? 'date' : 'time'}
              </Text>
            </View>

            <View className="items-center p-4">
              {picker ? (
                <View className="self-stretch">
                  {picker === 'date' ? (
                    <>
                      <View className="mb-4 flex-row items-center justify-between">
                        <TouchableOpacity
                          onPress={() => changePickerMonth(-1)}
                          className="h-9 w-9 items-center justify-center rounded-full bg-[#EEF1F7] dark:bg-slate-800"
                        >
                          <Text className="text-2xl leading-none text-[#1b2061] dark:text-indigo-200">‹</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={openMonthYearPicker}
                          className="flex-row items-center rounded-lg bg-[#EEF1F7] dark:bg-slate-800 px-3 py-1.5"
                        >
                          <Text className="text-base font-bold text-[#16233F] dark:text-slate-100">
                            {MONTH_NAMES[pickerMonth.getMonth()]} {pickerMonth.getFullYear()}
                          </Text>
                          <ChevronDown size={16} color={isDark ? '#C7D2FE' : '#1b2061'} className="ml-1" />
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => changePickerMonth(1)}
                          className="h-9 w-9 items-center justify-center rounded-full bg-[#EEF1F7] dark:bg-slate-800"
                        >
                          <Text className="text-2xl leading-none text-[#1b2061] dark:text-indigo-200">›</Text>
                        </TouchableOpacity>
                      </View>

                      <View className="flex-row flex-wrap">
                        {WEEK_DAYS.map((day) => (
                          <Text
                            key={day}
                            className="mb-1 w-[14.28%] text-center text-xs font-semibold text-slate-400 dark:text-slate-500"
                          >
                            {day}
                          </Text>
                        ))}

                        {getCalendarDays(pickerMonth).map((date, index) => {
                          if (!date) return <View key={`empty-${index}`} className="mb-1 h-10 w-[14.28%]" />;

                          const selected = isSameDay(date, pickerValue);
                          // An item can't have been lost or found in the
                          // future, same rule the report form uses.
                          // A "To" date also can't be before the "From" date.
                          const startDay = pickerTarget === 'end' ? parseDateValue(createdDate) : null;
                          const disabled = date > new Date() || (startDay ? date < startDay : false);

                          return (
                            <TouchableOpacity
                              key={date.toISOString()}
                              disabled={disabled}
                              onPress={() => setPickerValue(date)}
                              className={`mb-1 h-10 w-[14.28%] items-center justify-center ${
                                selected ? 'rounded-full bg-[#1b2061] dark:bg-indigo-600' : ''
                              }`}
                            >
                              <Text
                                className={`text-sm ${
                                  selected
                                    ? 'font-bold text-white'
                                    : disabled
                                      ? 'text-slate-300 dark:text-slate-600'
                                      : 'text-[#16233F] dark:text-slate-100'
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
                      <View className="mb-5 items-center rounded-2xl bg-[#EEF1F7] dark:bg-slate-800 py-5">
                        <Text className="text-[11px] font-bold tracking-widest text-slate-500 dark:text-slate-400">
                          SELECTED TIME
                        </Text>

                        <Text className="mt-2 text-4xl font-bold text-[#1B2061] dark:text-indigo-200">
                          {String(pickerValue.getHours() % 12 || 12).padStart(2, '0')}:
                          {String(pickerValue.getMinutes()).padStart(2, '0')}{' '}
                          {pickerValue.getHours() >= 12 ? 'PM' : 'AM'}
                        </Text>

                        <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Scroll to select an hour and minute.
                        </Text>
                      </View>

                      <View className="mb-4 flex-row rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
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
                                selected ? 'bg-[#1B2061] dark:bg-indigo-600' : ''
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
                        <View className="flex-1 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                          <View className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-3 py-3">
                            <Text className="text-center text-xs font-bold tracking-wide text-[#1B2061] dark:text-indigo-200">
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
                                    selected ? 'bg-[#1B2061] dark:bg-indigo-600' : ''
                                  }`}
                                >
                                  <Text
                                    className={`text-sm font-bold ${
                                      selected ? 'text-white' : 'text-[#16233F] dark:text-slate-100'
                                    }`}
                                  >
                                    {String(hour).padStart(2, '0')}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                        </View>

                        <View className="flex-1 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                          <View className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-3 py-3">
                            <Text className="text-center text-xs font-bold tracking-wide text-[#1B2061] dark:text-indigo-200">
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
                                    selected ? 'bg-[#1B2061] dark:bg-indigo-600' : ''
                                  }`}
                                >
                                  <Text
                                    className={`text-sm font-bold ${
                                      selected ? 'text-white' : 'text-[#16233F] dark:text-slate-100'
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
              ) : null}

              <View className="mt-4 flex-row items-center gap-3 self-stretch">
                <TouchableOpacity
                  onPress={() => setPicker(null)}
                  className="h-11 flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800"
                >
                  <Text className="text-sm font-semibold text-[#16233F] dark:text-slate-100">Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={applyPickerValue}
                  className="h-11 flex-1 items-center justify-center rounded-xl bg-[#1b2061] dark:bg-indigo-600"
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
        <View className="flex-1 items-center justify-center bg-black/50 dark:bg-black/60 px-5">
          <View className="w-full rounded-2xl bg-white dark:bg-slate-900 p-5">
            <Text className="mb-4 text-center text-lg font-bold text-[#16233F] dark:text-slate-100">
              Select Month & Year
            </Text>

            <View className="flex-row h-52 gap-4">
              <ScrollView className="flex-1 border-r border-slate-200 dark:border-slate-700 pr-2" showsVerticalScrollIndicator={false}>
                {MONTH_NAMES.map((month, index) => {
                  const selected = selectedTempMonth === index;
                  return (
                    <TouchableOpacity
                      key={month}
                      onPress={() => setSelectedTempMonth(index)}
                      className={`mb-1.5 rounded-lg p-2.5 ${selected ? 'bg-[#1b2061] dark:bg-indigo-600' : 'bg-slate-50 dark:bg-slate-800'}`}
                    >
                      <Text
                        className={`text-center text-sm font-semibold ${
                          selected ? 'text-white' : 'text-[#16233F] dark:text-slate-100'
                        }`}
                      >
                        {month}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <ScrollView className="flex-1 pl-2" showsVerticalScrollIndicator={false}>
                {YEARS.map((year) => {
                  const selected = selectedTempYear === year;
                  return (
                    <TouchableOpacity
                      key={year}
                      onPress={() => setSelectedTempYear(year)}
                      className={`mb-1.5 rounded-lg p-2.5 ${selected ? 'bg-[#1b2061] dark:bg-indigo-600' : 'bg-slate-50 dark:bg-slate-800'}`}
                    >
                      <Text
                        className={`text-center text-sm font-semibold ${
                          selected ? 'text-white' : 'text-[#16233F] dark:text-slate-100'
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
                onPress={() => setMonthYearPickerVisible(false)}
                className="h-11 flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800"
              >
                <Text className="text-sm font-semibold text-[#16233F] dark:text-slate-100">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={applyMonthYearSelection}
                className="h-11 flex-1 items-center justify-center rounded-xl bg-[#1b2061] dark:bg-indigo-600"
              >
                <Text className="text-sm font-semibold text-white">Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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

      {/* Inline loading overlay — plain View, same approach as LoginScreen's
          isSubmitting overlay, so it isn't a second native Modal. */}
      {saving && (
        <View
          className="absolute inset-0 items-center justify-center bg-[#1b2061]/45 dark:bg-black/60"
          pointerEvents="auto"
        >
          <View className="w-[78%] items-center rounded-2xl bg-white dark:bg-slate-800 px-6 py-7 shadow-lg">
            <ActivityIndicator size="large" color={isDark ? '#C7D2FE' : '#1b2061'} />
            <Text className="mt-4 text-center text-base font-bold text-[#1b2061] dark:text-indigo-200">
              Saving changes...
            </Text>
            <Text className="mt-1 text-center text-sm text-[#666] dark:text-slate-400">
              Please wait while we update this item.
            </Text>
          </View>
        </View>
      )}

      {confirmationModal}
    </KeyboardAvoidingView>
  );
}