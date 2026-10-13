import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, X, Pencil, CheckCircle, Archive, AlertCircle, CalendarClock } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  getItems,
  getItemById,
  API_URL,
  editLostItem,
  createLostItem,
  deleteLostItem,
  addPointsRecord,
  getUsers,
  getClaims,
} from "../api/api";
import { calculatePoints } from '../utils/PointingSystem';
import PhotoUpload from '../components/PhotoUpload';
import { logActivity } from '../utils/Activitylog';
import Pagination from "../components/Pagination";
import { confirmAction } from "../components/ConfirmDialog";
import { narrowOptionsForItem, setQuestionBankGroups } from "../utils/itemOptionGroups";
import { showToast } from "../utils/toast";


const PREDEFINED_OPTIONS_STORAGE_KEY = 'app_predefined_options';

// Generic fallback answer lists, used only when a question has no
// predefined choices of its own in the Question Bank.
const DEFAULT_OPTION_SETS = {
  color: [
    'Black', 'White', 'Gray', 'Silver', 'Gold', 'Rose Gold', 'Brown', 'Beige', 'Red',
    'Orange', 'Yellow', 'Green', 'Blue', 'Navy', 'Purple', 'Pink', 'Maroon', 'Brass',
    'Bronze', 'Copper', 'Clear',
  ],
  watch: [
    'Casio', 'G-Shock', 'Seiko', 'Citizen', 'Fossil', 'Timex', 'Swatch', 'Rolex',
    'Tissot', 'Daniel Wellington', 'Apple', 'Samsung', 'Garmin', 'Xiaomi', 'Huawei', 'Amazfit',
  ],
  laptop: ['Apple', 'Asus', 'Acer', 'Dell', 'HP', 'Lenovo', 'MSI', 'Microsoft', 'Huawei', 'Samsung', 'Razer'],
  cellphone: [
    'Apple', 'Samsung', 'Xiaomi', 'Redmi', 'Oppo', 'Vivo', 'Realme', 'Huawei', 'Google Pixel',
    'OnePlus', 'Nokia', 'Motorola', 'Infinix', 'Tecno', 'Cherry Mobile', 'MyPhone',
  ],
  bagWallet: [
    'Hawk', 'Tiger', 'Jansport', 'Herschel', 'Nike', 'Adidas', 'Puma', 'Samsonite',
    'Coach', 'Michael Kors', 'Kate Spade', 'Charles & Keith', 'Bench', 'Penshoppe',
  ],
};

/** Load the current (possibly admin-edited) fallback option sets from storage. */
function loadOptionSets() {
  try {
    const saved = localStorage.getItem(PREDEFINED_OPTIONS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        return { ...DEFAULT_OPTION_SETS, ...parsed };
      }
    }
  } catch (e) {
    console.error('Failed to load predefined options from storage:', e);
  }
  return { ...DEFAULT_OPTION_SETS };
}

// Keyword hints used to figure out WHAT KIND of item we're dealing with,
// based on the free-text Item Name the staff typed in (e.g. "Black
// MacBook Pro 13-inch" -> laptop brands, "iPhone 13" -> cellphone brands).
const LAPTOP_KEYWORDS = /laptop|notebook|macbook|chromebook|netbook|ultrabook/i;
const CELLPHONE_KEYWORDS = /phone|iphone|smartphone|cellphone|android|galaxy|redmi|poco|\boppo\b|\bvivo\b|realme/i;
const WATCH_KEYWORDS = /watch/i; // covers "watch" and "smartwatch"

/**
 * Figure out which brand list applies for the current item. Item Name
 * keywords take priority (most specific), then Category is used as a
 * fallback for categories that map to a single brand list. Returns null if
 * nothing confidently matches (caller falls back to free text).
 */
function getBrandOptions(category, itemTitle = '') {
  const title = (itemTitle || '').toLowerCase();
  const optionSets = loadOptionSets();

  if (WATCH_KEYWORDS.test(title)) return optionSets.watch;
  if (LAPTOP_KEYWORDS.test(title)) return optionSets.laptop;
  if (CELLPHONE_KEYWORDS.test(title)) return optionSets.cellphone;

  if (category === 'Bags & Wallets') return optionSets.bagWallet;

  return null;
}

/**
 * Given a verification question's text plus the item's Category and Item
 * Name, return the predefined list of valid answers for that question, or
 * null if the question doesn't have a predefined list (free text applies).
 *
 * An exact Question Bank preset match (with its own `options`) wins
 * first; a generic color/brand keyword fallback applies only when there's
 * no such match.
 */
function getPresetAnswerOptions(questionText, category, itemTitle) {
  // Narrowed to the item's kind (e.g. a Mobile Phone only gets phone
  // brands / phone sizes), so the staff answer dropdown, the list saved
  // on the item and the claimant's dropdown all match.
  return narrowOptionsForItem(
    questionText,
    getCategoryAnswerOptions(questionText, category, itemTitle),
    itemTitle,
    category
  );
}

function getCategoryAnswerOptions(questionText, category, itemTitle) {
  if (!questionText) return null;
  const trimmedQuestion = questionText.trim();
  if (!trimmedQuestion) return null;

  // 1. Question Bank preset match — exact text, case-insensitive. If more
  // than one bank entry shares this exact wording, prefer one tagged for
  // this item's Category; otherwise the first text match.
  const bankCandidates = getPresetQuestions().filter(
    (qObj) =>
      typeof qObj === 'object' &&
      typeof qObj.text === 'string' &&
      qObj.text.trim().toLowerCase() === trimmedQuestion.toLowerCase()
  );

  const bankMatch =
    bankCandidates.find((qObj) => questionFitsCategory(qObj, category)) ||
    bankCandidates[0];

  if (bankMatch && Array.isArray(bankMatch.options) && bankMatch.options.length > 0) {
    return bankMatch.options;
  }

  // 2. Generic color/brand keyword fallback.
  const q = trimmedQuestion.toLowerCase();
  if (q.includes('color') || q.includes('colour')) return loadOptionSets().color;
  if (q.includes('brand')) return getBrandOptions(category, itemTitle);

  return null;
}

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
  'Others'
];

const CATS = ['Accessories', 'ID', 'Academic Materials', 'Bags & Wallets', 'Clothing', 'Electronic', 'Keys'];
const STATUSES = ['Pending', 'Claimed', 'Approved'];

// ─── Item Name presets ──────────────────────────────────────────────────────
// Predefined Item Name choices per Category. Keys must match the CATS
// values above exactly. "Other (please specify)" is always appended in the
// UI so staff can still type something not on the list.
const ITEM_NAME_OPTIONS = {
  'Accessories': [
    'Watch', 'Bracelet', 'Necklace', 'Ring', 'Earrings', 'Hair Clip', 'Hair Tie',
    'Sunglasses', 'Eyeglasses', 'Cap/Hat', 'Keychain', 'ID Lace', 'Brooch/Pin', 'Belt'
  ],
  'ID': [
    'Student ID', "Driver's License", 'Passport', 'Government ID',
    'Company/Employee ID', 'PhilHealth ID', 'UMID', 'ATM/Debit Card', 'Library Card',
    'Other Identification Card'
  ],
  'Academic Materials': [
    'Notebook', 'Binder', 'Folder', 'Envelope', 'Textbook', 'Reference Book', 'Module',
    'Reviewer', 'Printed Document', 'Assignment', 'Examination Paper', 'Index Card',
    'Yellow Pad', 'Calculator', 'Ruler', 'Pencil', 'Ballpen', 'Marker/Highlighter',
    'Eraser', 'Pencil Case', 'Art Materials', 'USB/Flash Drive'
  ],
  'Bags & Wallets': [
    'Backpack', 'School Bag', 'Shoulder Bag', 'Tote Bag', 'Sling Bag', 'Laptop Bag',
    'Handbag', 'Purse', 'Wallet', 'Coin Purse', 'Pouch', 'Pencil Case', 'Drawstring Bag',
    'Travel Bag'
  ],
  'Clothing': [
    'T-Shirt', 'Polo Shirt', 'Uniform', 'Jacket', 'Hoodie', 'Sweater', 'Pants', 'Jeans',
    'Shorts', 'Skirt', 'Dress', 'Socks', 'Shoes', 'Slippers', 'Sneakers', 'Underwear',
    'Scarf', 'Gloves', 'Raincoat'
  ],
  'Electronic': [
    'Mobile Phone', 'Laptop', 'Tablet', 'iPad', 'Smartwatch', 'Digital Camera',
    'Calculator', 'Power Bank', 'Charger', 'Charging Cable', 'Earphones', 'Earbuds',
    'Headphones', 'Bluetooth Speaker', 'USB Flash Drive', 'External Hard Drive', 'Mouse',
    'Keyboard', 'Adapter', 'Power Supply', 'HDMI Cable'
  ],
  'Keys': [
    'House Key', 'Room Key', 'Classroom Key', 'Office Key', 'Cabinet Key', 'Locker Key',
    'Padlock Key', 'Motorcycle Key', 'Car Key', 'Key Set', 'Duplicate Key',
    'Keychain with Keys'
  ]
};

// Marker value used by the Item Name <select> to represent "the staff wants
// to type a custom name that isn't on the predefined list for this Category".
const OTHER_ITEM_NAME = '__other__';

/** True when `title` is non-empty and not one of the predefined choices for
 * `category` — i.e. the Item Name field should show as free-text/custom. */
function isCustomItemName(title, category) {
  if (!title) return false;
  const options = ITEM_NAME_OPTIONS[category] || [];
  return !options.includes(title);
}

// Used ONLY by the name auto-fill lookup in ItemModal, to match an 8-digit
// Student ID against a registered account's email in User Management
// (e.g. "12345678" -> "12345678@slc-sflu.edu.ph"). The Student ID itself
// is saved and used for points as the BARE 8 digits — this suffix is never
// appended to it.
const ID_NUMBER_DOMAIN = '@slc-sflu.edu.ph';

// ─── Student ID helpers ─────────────────────────────────────────────────────
// The Student ID input only ever collects the 8 digits, and those bare
// digits are what gets saved. When loading an existing item, strip any
// non-digit characters (including a legacy appended email domain) back
// down to just the digits for display.
function parseIdNumberDigits(source) {
  const raw = source?.student_id || '';
  return String(raw).replace(/\D/g, '').slice(0, 8);
}

// Normalizes any stored/entered finder Student ID to just the 8 digits.
// Handles both the bare form ("12345678") and older records saved with the
// school-email suffix ("12345678@slc-sflu.edu.ph").
function toIdDigits(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 8);
}

// Normalizes a getUsers()/getClaims()-style API response into a plain
// array, regardless of whether the backend returns a bare array or a
// paginated `{ count, next, previous, results: [...] }` envelope.
function toArray(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.results)) return response.results;
  return [];
}

// ─── Scheduled claim detection ──────────────────────────────────────────────
// A found item "has a scheduled claim" when someone submitted a claim with a
// meeting date that hasn't passed yet (the claimant can come in any time on
// that day) and the claim wasn't declined. Staff-confirmed meetings
// (status "Scheduled") win over claimant-requested ones ("Pending").
const DECLINED_CLAIM_STATUSES = ['rejected', 'declined', 'denied', 'cancelled'];

function buildScheduledClaimMap(claimsList) {
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  const map = new Map();

  claimsList.forEach((c) => {
    const status = String(c.status || '').trim().toLowerCase();
    if (DECLINED_CLAIM_STATUSES.includes(status)) return;
    if (!c.meeting_date) return;
    const day = String(c.meeting_date).slice(0, 10);
    if (day < today) return; // meeting day already over

    const itemId = String(c.item_details?.id ?? c.item?.id ?? c.item_id ?? c.item);
    const current = map.get(itemId);
    const confirmed = status === 'scheduled' || c.staff_scheduled === true;
    const currentConfirmed =
      current && (String(current.status || '').toLowerCase() === 'scheduled' || current.staff_scheduled === true);

    // Prefer a confirmed meeting, then the earliest date.
    if (
      !current ||
      (confirmed && !currentConfirmed) ||
      (confirmed === currentConfirmed && day < String(current.meeting_date).slice(0, 10))
    ) {
      map.set(itemId, c);
    }
  });

  return map;
}

const isConfirmedClaim = (c) =>
  String(c?.status || '').trim().toLowerCase() === 'scheduled' || c?.staff_scheduled === true;

const formatMeetingDay = (value) => {
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return isNaN(d.getTime())
    ? String(value)
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const DEFAULT_PRESETS = [
  { text: "What is the main color of the item?", category: "", options: [] },
  { text: "What brand is the item?", category: "", options: [] },
  { text: "What is the size of the item?", category: "", options: [] },
];

const statusColor = (s) =>
  s === 'Claimed' ? 'bg-purple-100 text-purple-500' :
  s === 'Pending' ? 'bg-orange-100 text-orange-500' :
  'bg-green-100 text-green-500';

const EMPTY = {
  title: '',
  category: 'Accessories',
  poster_first_name: '',
  poster_last_name: '',
  student_id: '',
  location: [],
  created_date: '',
  created_date_to: '',
  created_time: '',
  created_time_to: '',
  description: '',
  verification_question_1: '',
  verification_answer_1: '',
  verification_question_2: '',
  verification_answer_2: '',
  verification_question_3: '',
  verification_answer_3: '',
  verification_question_4: '',
  verification_answer_4: '',
  status: 'Pending',
  image: null
};

function toTitleCase(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// ─── Question Bank (shared with Utilities > Question Bank) ──────────────────
// Questions live in the database (QuestionBank.jsx saves them through the
// /questions/ API). They're fetched when the Add/Edit modal opens and kept
// in this module-level cache so the answer-choice helpers above can read
// them synchronously.
let questionBankCache = [];

async function fetchQuestionBank() {
  const res = await fetch(`${API_URL.replace(/\/$/, '')}/questions/`);
  if (!res.ok) throw new Error(`Question Bank request failed (${res.status})`);
  const data = await res.json();
  const list = Array.isArray(data) ? data : data?.results || [];
  // Oldest first, so General questions and each category's questions keep
  // the order they were added in.
  questionBankCache = list
    .map((q) => ({ ...q, options: Array.isArray(q.options) ? q.options : [] }))
    .sort((a, b) => (a.id || 0) - (b.id || 0));
  // Choices the admin linked to item types in the Question Bank.
  setQuestionBankGroups(questionBankCache);
  return questionBankCache;
}

// True when a Question Bank question applies to this item category
// (questions can be tagged with several categories; older ones only have
// `category`, and "General" meant every category).
const questionFitsCategory = (q, category) => {
  if (Array.isArray(q?.categories) && q.categories.length) return q.categories.includes(category);
  const one = String(q?.category || '').trim();
  return !one || one === 'General' || one === category;
};

// True for questions shared by every category: Default questions, ones
// tagged with every category, and older "General" / untagged ones.
const isSharedQuestion = (q) => {
  if (q?.is_default) return true;
  if (Array.isArray(q?.categories) && q.categories.length) {
    return CATS.every((cat) => q.categories.includes(cat));
  }
  const one = String(q?.category || '').trim();
  return !one || one === 'General';
};

const getPresetQuestions = () =>
  questionBankCache.length > 0 ? questionBankCache : DEFAULT_PRESETS;

/** True when `questionText` is a Question Bank preset that belongs to a
 * specific category other than `category` (General presets always fit). */
function isPresetForOtherCategory(questionText, category) {
  const text = (questionText || '').trim().toLowerCase();
  if (!text) return false;
  const matches = getPresetQuestions().filter(
    (q) => (q.text || '').trim().toLowerCase() === text
  );
  if (matches.length === 0) return false; // custom question — keep it
  return !matches.some((q) => questionFitsCategory(q, category));
}

// ─── Location helpers ──────────────────────────────────────────────────────
// The item's "location" is stored on the backend as a single text field.
// The form works with a SINGLE selected area, kept internally as a
// one-item array so the save/serialize pipeline (and any legacy
// multi-location data) keeps working unchanged.

/** Turn a stored location value (string or array) into a working array of
 * selected AREAS values (using "Others" as the marker for custom entries),
 * plus the free-text for any custom ("Others") entries. Only the FIRST
 * area found is kept, since the field is single-select. */
function parseStoredLocation(rawLocation, storedOtherText) {
  let list = [];
  if (Array.isArray(rawLocation)) {
    list = rawLocation.filter(Boolean);
  } else if (typeof rawLocation === 'string' && rawLocation.trim() !== '') {
    list = rawLocation.split(',').map((s) => s.trim()).filter(Boolean);
  }

  const known = list.filter((loc) => AREAS.includes(loc) && loc !== 'Others');
  const custom = list.filter((loc) => !AREAS.includes(loc));
  const hadOthersMarker = list.includes('Others');

  let otherText = storedOtherText || '';
  let selected = [];

  if (known.length > 0) {
    selected = [known[0]];
  } else if (custom.length > 0) {
    selected = ['Others'];
    otherText = custom.join(', ');
  } else if (hadOthersMarker) {
    selected = ['Others'];
  }

  return { selected, otherText };
}

/** Turn the working { location: [...], other_location } form state back into
 * a single comma-separated string for saving to the backend. */
function serializeLocation(locationArr, otherText) {
  const list = Array.isArray(locationArr) ? locationArr : [];
  const named = list.filter((a) => a !== 'Others');
  const custom = list.includes('Others')
    ? (otherText || '').split(',').map((s) => s.trim()).filter(Boolean)
    : [];
  return [...named, ...custom].join(', ');
}

// ─── Found-by name helpers ──────────────────────────────────────────────────
// "Found By" is stored on the backend as a single `poster_name` field, but
// the form works with separate First Name / Last Name inputs.
function parsePosterName(source) {
  if (!source) return { first: '', last: '' };
  if (source.poster_first_name || source.poster_last_name) {
    return {
      first: source.poster_first_name || '',
      last: source.poster_last_name || '',
    };
  }
  const full = (source.poster_name || '').trim();
  if (!full) return { first: '', last: '' };
  const parts = full.split(/\s+/);
  return { first: parts[0] || '', last: parts.slice(1).join(' ') };
}

const ItemModal = ({ item, onSave, onClose }) => {
  const [saving, setSaving] = useState(false);
  const [presetQuestions, setPresetQuestions] = useState([]);
  // Confirmation step shown right before the item is actually submitted —
  // set to true once all field validation has already passed.
  const [confirmOpen, setConfirmOpen] = useState(false);

  const normalizeForm = (source) => {
    const base = source || EMPTY;
    const { selected, otherText } = parseStoredLocation(base.location, base.other_location);
    const { first, last } = parsePosterName(base);
    const idDigits = parseIdNumberDigits(base);

    return {
      ...base,
      location: selected,
      other_location: otherText,
      poster_first_name: first,
      poster_last_name: last,
      student_id: idDigits,
      created_date_to: base.created_date_to || base.end_date || '',
      created_time_to: (base.created_time_to || base.end_time || '').slice(0, 5),
    };
  };

  const [form, setForm] = useState(normalizeForm(item));
  const isEdit = !!item;

  // Whether the Item Name field is currently in "custom text" mode.
  const [itemNameOther, setItemNameOther] = useState(() =>
    isCustomItemName(normalizeForm(item).title, normalizeForm(item).category)
  );

  // ─── Finder lookup by Student ID ──────────────────────────────────────────
  // The Student ID is REQUIRED (points are recorded under it), but the
  // finder need not be registered. As soon as it reaches 8 digits we look
  // the account up in User Management (keyed by <digits>@slc-sflu.edu.ph).
  // If an account exists, Found By First/Last Name are filled from that
  // account and locked read-only. If no account exists, the name fields
  // stay editable and NO account is created.
  //
  // This lookup only ever runs in ADD mode. In Edit mode the Student ID is
  // fixed and can't be reassigned from this form.
  //
  // 'idle' | 'loading' | 'found' | 'notfound' | 'error'
  const [lookupStatus, setLookupStatus] = useState('idle');

  // Tracks whether the name currently in the form was put there by the
  // lookup, so clearing the Student ID only ever wipes OUR auto-fill.
  const autoFilledRef = useRef(false);

  const nameLocked = lookupStatus === 'found';

  // Load the latest Question Bank entries from the database on modal open.
  // 'loading' | 'ready' | 'error'
  const [bankStatus, setBankStatus] = useState('loading');
  useEffect(() => {
    let cancelled = false;
    setPresetQuestions(getPresetQuestions());
    fetchQuestionBank()
      .then((list) => {
        if (cancelled) return;
        setPresetQuestions(list.length > 0 ? list : DEFAULT_PRESETS);
        setBankStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load Question Bank:', err);
        setBankStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const normalized = normalizeForm(item);
    setForm(normalized);
    setItemNameOther(isCustomItemName(normalized.title, normalized.category));
    autoFilledRef.current = false;
    setLookupStatus('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  // Debounced account lookup driven purely by the Student ID field.
  // Skipped entirely in Edit mode.
  useEffect(() => {
    if (isEdit) return;

    const digits = form.student_id || '';

    if (digits.length !== 8) {
      setLookupStatus('idle');
      if (autoFilledRef.current) {
        autoFilledRef.current = false;
        setForm((prev) => ({ ...prev, poster_first_name: '', poster_last_name: '' }));
      }
      return;
    }

    let cancelled = false;
    setLookupStatus('loading');

    const timer = setTimeout(async () => {
      try {
        const rawUsers = await getUsers();
        if (cancelled) return;

        const users = toArray(rawUsers);
        const email = `${digits}${ID_NUMBER_DOMAIN}`.toLowerCase();
        const match = users.find(
          (u) => (u.email || '').toLowerCase() === email
        );

        if (match) {
          autoFilledRef.current = true;
          setForm((prev) =>
            prev.student_id === digits
              ? {
                  ...prev,
                  poster_first_name: match.first_name || '',
                  poster_last_name: match.last_name || '',
                }
              : prev
          );
          setLookupStatus('found');
        } else {
          if (autoFilledRef.current) {
            autoFilledRef.current = false;
            setForm((prev) => ({ ...prev, poster_first_name: '', poster_last_name: '' }));
          }
          setLookupStatus('notfound');
        }
      } catch (err) {
        if (cancelled) return;
        // Never trap staff behind read-only fields we can't fill — fall
        // back to manual entry when the lookup itself fails.
        console.error('Finder lookup failed:', err.response?.data || err.message);
        setLookupStatus('error');
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.student_id, isEdit]);

  const set = (key, value) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Changing Category swaps the predefined Item Name list. Reset the Item
  // Name unless the current title also exists in the new category's list.
  const setCategory = (newCategory) => {
    setForm((prev) => {
      const stillValid = (ITEM_NAME_OPTIONS[newCategory] || []).includes(prev.title);
      const next = {
        ...prev,
        category: newCategory,
        title: stillValid ? prev.title : '',
      };
      // Preset questions from the previous category don't apply any more.
      [1, 2, 3, 4].forEach((n) => {
        if (isPresetForOtherCategory(prev[`verification_question_${n}`], newCategory)) {
          next[`verification_question_${n}`] = '';
          next[`verification_answer_${n}`] = '';
        }
      });
      return next;
    });
    setItemNameOther(false);
  };

  // Only digits are ever accepted for the Student ID field, capped at 8
  // characters. Only ever invoked from the Add-mode input.
  const setIdNumber = (value) => {
    const digitsOnly = (value || '').replace(/\D/g, '').slice(0, 8);
    set('student_id', digitsOnly);
  };

  // Area Found is a single-select field. Switching away from "Others"
  // also clears the free-text field for the custom location.
  const setLocation = (area) => {
    setForm((prev) => ({
      ...prev,
      location: area ? [area] : [],
      ...(area !== 'Others' ? { other_location: '' } : {}),
    }));
  };

  // Whenever the Category, Item Name, or any verification question
  // changes, clear an answer that no longer appears in its question's
  // predefined list.
  //
  // Skipped on the first render: when an existing item is opened for
  // editing, its saved answer must be kept even if the Question Bank's
  // choices changed since it was saved (it is shown as "current" in the
  // dropdown instead of being silently wiped).
  const answerCheckReadyRef = useRef(false);
  useEffect(() => {
    if (!answerCheckReadyRef.current) {
      answerCheckReadyRef.current = true;
      return;
    }
    setForm((prev) => {
      let changed = false;
      const next = { ...prev };

      [1, 2, 3, 4].forEach((n) => {
        const qKey = `verification_question_${n}`;
        const aKey = `verification_answer_${n}`;
        const options = getPresetAnswerOptions(prev[qKey], prev.category, prev.title);
        if (options && prev[aKey] && !options.includes(prev[aKey])) {
          next[aKey] = '';
          changed = true;
        }
      });

      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.category,
    form.title,
    form.verification_question_1,
    form.verification_question_2,
    form.verification_question_3,
    form.verification_question_4,
  ]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;

    const today = new Date().toLocaleDateString("en-CA");
    if (form.created_date && form.created_date > today) {
      showToast("Date reported cannot be in the future.");
      return;
    }
    if (form.created_date_to && form.created_date_to > today) {
      showToast("Date reported (To) cannot be in the future.");
      return;
    }
    if (form.created_date && form.created_date_to && form.created_date_to < form.created_date) {
      showToast("End date cannot be before the start date.");
      return;
    }
    if (
      form.created_time &&
      form.created_time_to &&
      form.created_date &&
      form.created_date_to &&
      form.created_date === form.created_date_to &&
      form.created_time_to < form.created_time
    ) {
      showToast("End time cannot be before the start time.");
      return;
    }

    // ------------------------------------------------------------------
    // VALIDATION — each required field is checked individually with its
    // own alert, in the same order the fields appear in the form.
    // ------------------------------------------------------------------
    const hasLocation = Array.isArray(form.location) && form.location.length > 0;

    // Student ID is REQUIRED when adding an item (points are recorded
    // under it) and must be a complete 8 digits. Not enforced in Edit
    // mode — the field is read-only there.
    if (!isEdit && !/^\d{8}$/.test(form.student_id || '')) {
      showToast("Please enter the finder's 8-digit Student ID.");
      return;
    }
    if (lookupStatus === 'loading') {
      showToast("Still checking this Student ID — please wait a moment and try again.");
      return;
    }
    if (!form.poster_first_name?.trim()) {
      showToast("Please enter the First Name of who found the item.");
      return;
    }
    if (!form.poster_last_name?.trim()) {
      showToast("Please enter the Last Name of who found the item.");
      return;
    }
    if (!hasLocation) {
      showToast("Please select the Area Found.");
      return;
    }
    if (form.location.includes("Others") && !form.other_location?.trim()) {
      showToast('Please specify the location for "Others".');
      return;
    }
    if (!form.title?.trim()) {
      showToast("Please select or enter the Item Name.");
      return;
    }
    if (!form.created_date?.trim()) {
      showToast("Please select the Date Found.");
      return;
    }

    // ------------------------------------------------------------------
    // OWNERSHIP VERIFICATION QUESTIONS — required when ADDING an item.
    // Question 1 and its answer must be filled in; any other started
    // question needs BOTH its question and answer.
    // ------------------------------------------------------------------
    if (!isEdit) {
      const pairs = [1, 2, 3, 4].map((n) => ({
        n,
        q: (form[`verification_question_${n}`] || "").trim(),
        a: (form[`verification_answer_${n}`] || "").trim(),
      }));

      if (!pairs[0].q && !pairs[0].a) {
        showToast("Please fill in at least Verification Question 1 and its correct answer.");
        return;
      }

      const incomplete = pairs.find((p) => (p.q && !p.a) || (!p.q && p.a));
      if (incomplete) {
        showToast(
          `Verification Question ${incomplete.n}: please fill in both the question and its correct answer.`
        );
        return;
      }
    }

    // All fields check out — ask for confirmation before submitting.
    setConfirmOpen(true);
  };

  const performSave = async () => {
    setConfirmOpen(false);
    setSaving(true);
    try {
      const payload = {
        ...form,
        location: serializeLocation(form.location, form.other_location),
        // Backend stores a single combined name. The Student ID is sent as
        // the bare 8 digits (no email suffix).
        poster_name: `${form.poster_first_name.trim()} ${form.poster_last_name.trim()}`.trim(),
        student_id: form.student_id || '',
      };
      delete payload.other_location;
      delete payload.poster_first_name;
      delete payload.poster_last_name;

      // The "To" side of the Date/Time Found range is saved in the
      // database's end_date / end_time fields.
      payload.end_date = form.created_date_to || '';
      payload.end_time = form.created_time_to || '';
      delete payload.created_date_to;
      delete payload.created_time_to;

      // Attach the predefined answer-choice list (if any) for each
      // verification question as a JSON string, so ClaimModal.jsx can
      // render the same choices. An empty string clears a stale list.
      [1, 2, 3, 4].forEach((n) => {
        const qText = payload[`verification_question_${n}`];
        let options = getPresetAnswerOptions(qText, payload.category, payload.title);
        // The recorded answer must always be one of the claimant's choices,
        // or a real owner could never select it.
        const answer = (payload[`verification_answer_${n}`] || '').trim();
        if (options && options.length > 0 && answer && !options.includes(answer)) {
          options = [...options, answer];
        }
        payload[`verification_options_${n}`] =
          options && options.length > 0 ? JSON.stringify(options) : '';
      });

      await onSave(payload);
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoChange = (e) => {
    const { name, value, files } = e.target;
    set(name, files ? files[0] : value);
  };

  // Only show presets tagged for the currently selected category.
  const visiblePresets = presetQuestions.filter((qObj) =>
    typeof qObj !== "object" ? true : questionFitsCategory(qObj, form.category)
  );

  const inputClass =
    "h-11 w-full rounded-xl border border-slate-300 px-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#1478a7] disabled:bg-slate-100";
  const lockedInputClass =
    "h-11 w-full rounded-xl border border-slate-300 bg-slate-100 px-4 text-sm font-semibold text-slate-500 outline-none cursor-not-allowed";
  const labelClass = "mb-2 block text-xs font-bold uppercase text-slate-700";
  const rangeLabelClass = "mb-1 block text-[10px] font-bold uppercase text-slate-400";
  const today = new Date().toLocaleDateString("en-CA");
  const selectedLocations = Array.isArray(form.location) ? form.location : [];
  const idNumberInvalid = !isEdit && form.student_id && form.student_id.length !== 8;
  const itemNamePresets = ITEM_NAME_OPTIONS[form.category] || [];
  const lockedTitle =
    "This name comes from the registered account for this Student ID. To change it, edit the account in User Management.";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-md bg-white shadow-2xl">
        <div className="flex items-start justify-between bg-gradient-to-r from-[#0B648D] to-[#155F87] px-6 py-3 text-white">
          <div>
            <h3 className="text-lg font-bold">{isEdit ? "Edit Surrendered Item" : "Add Surrendered Item"}</h3>
            <p className="mt-1 text-sm text-white/90">
              {isEdit ? "Update surrendered item details" : "Start with the finder's Student ID"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-base text-white transition hover:bg-white/25"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSave} className="max-h-[calc(92vh-88px)] overflow-y-auto px-6 py-5">
          <div className="mx-auto max-w-3xl space-y-3">
            {!isEdit && (
              <div className="rounded-xl bg-blue-50 p-4 border border-blue-200 text-blue-800 text-xs font-medium">
                ℹ️ Enter the finder's 8-digit Student ID first — points for this item are recorded under that Student ID, whether or not the finder has a registered account. If they do have an account, their name fills in automatically; otherwise just type their name (no account will be created). This item will be marked <strong>Approved</strong> and appear immediately on the public board under "Surrendered".
              </div>
            )}

            {/* ── 1. Student ID — REQUIRED (Add mode). Read-only in Edit
                   mode; handleSaveEdit (in the parent) always saves back the
                   original student_id regardless of what's in `form`. ── */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Student ID *</label>
                {isEdit ? (
                  <>
                    <div className="flex h-11 w-full items-center rounded-xl border border-slate-300 bg-slate-100 px-4 text-sm font-semibold text-slate-600">
                      {form.student_id || "-"}
                    </div>
                    <p className="mt-1 text-xs font-medium text-slate-400">
                      This is the Student ID of the person who found this item and can't be changed here.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        className={`${inputClass} flex-1`}
                        value={form.student_id || ""}
                        onChange={(e) => setIdNumber(e.target.value)}
                        inputMode="numeric"
                        pattern="\d*"
                        maxLength={8}
                        placeholder="8-digit Student ID"
                        autoFocus
                        required
                      />
                    </div>

                    {idNumberInvalid && (
                      <p className="mt-1 text-xs font-medium text-red-500">
                        Student ID must be exactly 8 digits.
                      </p>
                    )}
                    {lookupStatus === 'loading' && (
                      <p className="mt-1 text-xs font-semibold text-slate-400">
                        Checking this Student ID…
                      </p>
                    )}
                    {lookupStatus === 'found' && (
                      <p className="mt-1 text-xs font-semibold text-emerald-700">
                        ✅ Registered account found — the name below is filled in from it.
                      </p>
                    )}
                    {lookupStatus === 'notfound' && (
                      <p className="mt-1 text-xs font-medium text-amber-600">
                        No registered account for this Student ID — that's okay. Enter the finder's name below; points will still be recorded under this Student ID.
                      </p>
                    )}
                    {lookupStatus === 'error' && (
                      <p className="mt-1 text-xs font-medium text-amber-600">
                        Couldn't reach User Management — enter the finder's name manually.
                      </p>
                    )}
                  </>
                )}
              </div>

              {/* Area Found — single select */}
              <div>
                <label className={labelClass}>Area Found *</label>
                <select
                  className={inputClass}
                  value={selectedLocations[0] || ""}
                  onChange={(e) => setLocation(e.target.value)}
                  required
                >
                  <option value="" disabled>-- Select an area --</option>
                  {AREAS.map((a) => (
                    <option key={a} value={a}>{a === 'Others' ? 'Others (please specify)' : a}</option>
                  ))}
                </select>

                {selectedLocations.includes("Others") && (
                  <>
                    <p className="mt-2 mb-1 text-[11px] font-bold uppercase text-slate-500">If others, please specify *</p>
                    <input
                      className={inputClass}
                      value={form.other_location || ""}
                      onChange={(e) => set("other_location", e.target.value)}
                      placeholder="Please specify the area found"
                      autoFocus
                      required
                    />
                  </>
                )}
              </div>
            </div>

            {/* ── 2. Found By — auto-filled and read-only when the Student ID
                   matches a registered account (Add mode only). */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>
                  Surrendered By — First Name *
                  {nameLocked && (
                    <span className="ml-2 font-bold normal-case text-emerald-700">🔒 from account</span>
                  )}
                </label>
                <input
                  className={nameLocked ? lockedInputClass : inputClass}
                  value={form.poster_first_name || ""}
                  onChange={(e) => set("poster_first_name", e.target.value)}
                  placeholder={lookupStatus === 'loading' ? "Checking…" : "First name"}
                  readOnly={nameLocked}
                  title={nameLocked ? lockedTitle : undefined}
                  required
                />
              </div>
              <div>
                <label className={labelClass}>
                  Surrendered By — Last Name *
                  {nameLocked && (
                    <span className="ml-2 font-bold normal-case text-emerald-700">🔒 from account</span>
                  )}
                </label>
                <input
                  className={nameLocked ? lockedInputClass : inputClass}
                  value={form.poster_last_name || ""}
                  onChange={(e) => set("poster_last_name", e.target.value)}
                  placeholder={lookupStatus === 'loading' ? "Checking…" : "Last name"}
                  readOnly={nameLocked}
                  title={nameLocked ? lockedTitle : undefined}
                  required
                />
              </div>
            </div>

            {nameLocked && (
              <p className="text-xs font-medium text-slate-400">
                Name locked to the registered account for this Student ID. To correct it, update the account in User Management.
              </p>
            )}

            {/* ── 3. The item itself. Category is picked before Item Name. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Category</label>
                <select
                  className={inputClass}
                  value={form.category || "Accessories"}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {CATS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>Item Name *</label>
                <select
                  className={inputClass}
                  value={itemNameOther ? OTHER_ITEM_NAME : (form.title || "")}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === OTHER_ITEM_NAME) {
                      setItemNameOther(true);
                      set("title", "");
                    } else {
                      setItemNameOther(false);
                      set("title", val);
                    }
                  }}
                  required={!itemNameOther}
                >
                  <option value="" disabled>-- Select item name --</option>
                  {itemNamePresets.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                  <option value={OTHER_ITEM_NAME}>Other (please specify)</option>
                </select>

                {itemNameOther && (
                  <input
                    className={`${inputClass} mt-2`}
                    value={form.title || ""} maxLength={30}
                    onChange={(e) => set("title", e.target.value)}
                    placeholder="Please specify the item name"
                    required
                  />
                )}
              </div>
            </div>

            {/* Date Found & Time Found — settable as a range (From / To) */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Date Found *</label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className={rangeLabelClass}>Start Date</span>
                    <input
                      className={inputClass}
                      type="date"
                      value={form.created_date || ""}
                      onChange={(e) => set("created_date", e.target.value)}
                      max={form.created_date_to || today}
                      required
                    />
                  </div>
                  <div>
                    <span className={rangeLabelClass}>End Date</span>
                    <input
                      className={inputClass}
                      type="date"
                      value={form.created_date_to || ""}
                      onChange={(e) => set("created_date_to", e.target.value)}
                      min={form.created_date || undefined}
                      max={today}
                    />
                  </div>
                </div>
              </div>

              {!isEdit ? (
                <div>
                  <label className={labelClass}>Time Found</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className={rangeLabelClass}>Start Time</span>
                      <input
                        className={inputClass}
                        type="time"
                        value={form.created_time || ""}
                        onChange={(e) => set("created_time", e.target.value)}
                      />
                    </div>
                    <div>
                      <span className={rangeLabelClass}>End Time</span>
                      <input
                        className={inputClass}
                        type="time"
                        value={form.created_time_to || ""}
                        onChange={(e) => set("created_time_to", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <label className={labelClass}>Status</label>
                  <select
                    className={inputClass}
                    value={form.status || "Pending"}
                    onChange={(e) => set("status", e.target.value)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  {form.status !== "Approved" && (
                    <p className="mt-1 text-xs font-medium text-amber-600">
                      Only "Approved" items are visible on the public board.
                    </p>
                  )}
                </div>
              )}
            </div>

            {isEdit && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Time Found</label>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className={rangeLabelClass}>Start Time</span>
                      <input
                        className={inputClass}
                        type="time"
                        value={form.created_time || ""}
                        onChange={(e) => set("created_time", e.target.value)}
                      />
                    </div>
                    <div>
                      <span className={rangeLabelClass}>End Time</span>
                      <input
                        className={inputClass}
                        type="time"
                        value={form.created_time_to || ""}
                        onChange={(e) => set("created_time_to", e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className={labelClass}>Description</label>
              <textarea
                className="min-h-[88px] w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#1478a7]"
                rows={2}
                value={form.description || ""} maxLength={100}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Describe the item..."
              />
              <p className="mt-1 text-right text-[11px] font-semibold text-slate-400">{(form.description || "").length}/100</p>
              <p className="mt-1 text-xs font-medium text-slate-400">
                Internal staff notes only — never shown to claimants.
              </p>
            </div>

            {/* Dynamic Ownership Verification Questions from Question Bank. */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <label className="mb-1 block text-sm font-bold uppercase text-amber-800">
                Ownership Verification Questions {!isEdit && "*"} ({!isEdit ? "at least 1 required, " : ""}max 4)
              </label>
              <p className="mb-3 text-xs font-medium text-amber-700">
                Select a preset question from the Question Bank or write a custom one. Only
                questions tagged for the selected category are shown, and a
                preset already used in another question slot won't be offered again here. If the
                selected preset has predefined answer choices (set in the Question Bank), those
                exact choices are used for the correct-answer dropdown below — and are what the
                claimant will pick from when they submit a claim. Otherwise, questions containing
                "color" or "brand" fall back to a generic list based on Category and Item Name.
              </p>

              {bankStatus === 'loading' && (
                <p className="mb-3 text-xs font-semibold text-amber-600">Loading Question Bank…</p>
              )}
              {bankStatus === 'error' && (
                <p className="mb-3 text-xs font-semibold text-rose-600">
                  Couldn't load the Question Bank — you can still type questions manually.
                </p>
              )}
              {bankStatus === 'ready' && visiblePresets.length > 0 && (
                <p className="mb-3 text-xs font-semibold text-emerald-700">
                  {visiblePresets.length} preset question{visiblePresets.length === 1 ? '' : 's'} available for {form.category}.
                </p>
              )}

              <div className="space-y-3">
                {[1, 2, 3, 4].map((n) => {
                  const questionText = form[`verification_question_${n}`] || "";
                  const answerOptions = getPresetAnswerOptions(questionText, form.category, form.title);

                  // Question 1 is mandatory when adding an item.
                  const isRequiredSlot = !isEdit && n === 1;

                  // The preset dropdown reflects the current question text
                  // only when it matches one of the visible presets.
                  const matchingPresetValue = visiblePresets.some((qObj) => {
                    const qText = typeof qObj === "string" ? qObj : qObj.text;
                    return qText === questionText;
                  })
                    ? questionText
                    : "";

                  // A preset already selected in another slot isn't offered again.
                  const otherSelectedQuestions = [1, 2, 3, 4]
                    .filter((i) => i !== n)
                    .map((i) => form[`verification_question_${i}`])
                    .filter(Boolean);

                  const availablePresets = visiblePresets.filter((qObj) => {
                    const qText = typeof qObj === "string" ? qObj : qObj.text;
                    return !otherSelectedQuestions.includes(qText);
                  });

                  return (
                    <div key={n} className="rounded-lg border border-amber-200 bg-white p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold uppercase text-amber-800">
                          Question {n}{isRequiredSlot ? " *" : ""}
                        </span>
                        <select
                          className="h-8 max-w-[280px] rounded-md border border-amber-300 bg-amber-50/50 px-2 text-xs font-medium text-amber-900 outline-none focus:border-amber-500 truncate"
                          onChange={(e) => {
                            if (e.target.value) {
                              set(`verification_question_${n}`, e.target.value);
                            }
                          }}
                          value={matchingPresetValue}
                        >
                          <option value="" disabled>-- Select Preset Question --</option>
                          {availablePresets.map((qObj, idx) => {
                            const qText = typeof qObj === "string" ? qObj : qObj.text;
                            // [Default] for shared questions, otherwise the
                            // selected category. `qObj.category` only holds the
                            // FIRST of a question's categories, so it isn't used.
                            const qCat = typeof qObj !== "object"
                              ? ''
                              : isSharedQuestion(qObj)
                              ? '[Default] '
                              : `[${form.category}] `;
                            const hasChoices = typeof qObj === "object" && Array.isArray(qObj.options) && qObj.options.length > 0;
                            return (
                              <option key={idx} value={qText}>
                                {qCat}{qText}{hasChoices ? ' ✓' : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <input
                          className="h-11 w-full rounded-lg border border-amber-300 bg-white px-3.5 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-amber-500"
                          value={questionText}
                          onChange={(e) => set(`verification_question_${n}`, e.target.value)}
                          placeholder={`Question ${n} (or pick preset above)`}
                          maxLength={150}
                          required={isRequiredSlot}
                        />

                        {answerOptions ? (
                          <select
                            className="h-11 w-full rounded-lg border border-amber-300 bg-white px-3.5 text-sm text-slate-700 outline-none focus:border-amber-500"
                            value={form[`verification_answer_${n}`] || ""}
                            onChange={(e) => set(`verification_answer_${n}`, e.target.value)}
                            required={isRequiredSlot}
                          >
                            <option value="" disabled>-- Select correct answer --</option>
                            {/* A saved answer that's no longer in the Question
                                Bank's choices stays selectable. */}
                            {form[`verification_answer_${n}`] &&
                              !answerOptions.includes(form[`verification_answer_${n}`]) && (
                                <option value={form[`verification_answer_${n}`]}>
                                  {form[`verification_answer_${n}`]} (current)
                                </option>
                              )}
                            {answerOptions.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            className="h-11 w-full rounded-lg border border-amber-300 bg-white px-3.5 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-amber-500"
                            value={form[`verification_answer_${n}`] || ""}
                            onChange={(e) => set(`verification_answer_${n}`, e.target.value)}
                            placeholder={`Correct answer ${n}`}
                            maxLength={150}
                            required={isRequiredSlot}
                          />
                        )}
                      </div>

                      {answerOptions && (
                        <p className="text-[11px] font-semibold text-emerald-700">
                          🔗 {answerOptions.length} predefined choices linked — the claimant will see a dropdown of these same options.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {!isEdit && (
              <PhotoUpload name="image" value={form.image} onChange={handlePhotoChange} />
            )}

            <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-gradient-to-b from-[#384388] to-[#2D366D] text-white font-semibold uppercase tracking-wide hover:shadow-lg active:scale-[0.98]"
              >
                {saving ? "Saving..." : isEdit ? "Save Changes" : "Add Item"}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="h-12 rounded-xl bg-slate-200 text-sm font-black uppercase text-slate-500 hover:bg-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Confirmation prompt shown right before the item is actually submitted. */}
      {confirmOpen && (
        <ConfirmModal
          message={
            isEdit
              ? "Are you sure you want to save these changes to this surrendered item?"
              : "Are you sure you want to add this surrendered item? It will be marked Approved and appear immediately on the public board."
          }
          onConfirm={performSave}
          onClose={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
};

const ConfirmModal = ({ message, onConfirm, onClose }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm">
    <div className="w-full max-w-sm rounded-[28px] bg-white px-8 py-8 text-center shadow-2xl">
      <div className="mx-auto mb-7 flex h-16 w-16 items-center justify-center rounded-full bg-[#EAF4F8] text-[#0B6B8A]">
        <AlertCircle size={30} strokeWidth={2.5} />
      </div>

      <h5 className="mb-3 text-lg font-black text-[#144B70]">System Confirmation</h5>

      <p className="mx-auto mb-8 max-w-[280px] text-sm font-medium leading-6 text-[#5F6F8C]">
        {message}
      </p>

      <div className="space-y-3">
        <button
          onClick={onConfirm}
          className="h-12 w-full rounded-xl bg-[#0B6B8A] text-sm font-black uppercase tracking-wide text-white shadow-md transition hover:bg-[#095A74] active:scale-[0.98]"
        >
          Confirm
        </button>

        <button
          onClick={onClose}
          className="h-12 w-full rounded-xl border border-[#0B6B8A] bg-white text-sm font-black uppercase tracking-wide text-[#0B6B8A] transition hover:bg-[#EAF4FF]"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
);

// The claimant's school email (Student ID email, e.g. 23100806@slc-sflu.edu.ph)
// is REQUIRED: it is how the system knows who received the item, so their
// claim becomes "Released" and everyone else's is closed. Typing only the
// 8-digit Student ID fills in the school domain automatically.
const SCHOOL_EMAIL_DOMAIN = '@slc-sflu.edu.ph';
const normalizeClaimantEmail = (value) => {
  const v = String(value || '').trim().toLowerCase();
  return /^\d{8}$/.test(v) ? `${v}${SCHOOL_EMAIL_DOMAIN}` : v;
};
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));

// ─── Claimant Info Prompt ───────────────────────────────────────────────────
// Shown when staff clicks "Mark as Claimed" from the Review modal. Collects
// the claimant's name (required) plus optional contact/email, saved onto the
// item itself. `releasedBy` is the logged-in moderator's name (display only).
const ClaimantInfoModal = ({ item, name, contact, email, releasedBy, prefillLoading, onChange, onConfirm, onClose, saving }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm">
    <div className="w-full max-w-sm rounded-[24px] bg-white p-6 shadow-2xl">
      <div className="mb-4">
        <h5 className="text-lg font-black text-[#144B70]">Mark Item as Claimed</h5>
        <p className="mt-1 text-xs font-medium text-[#5F6F8C]">
          Enter who is claiming <span className="font-bold">{toTitleCase(item?.title)}</span>, so it's
          on record for this item.
          {releasedBy && (
            <> Released by <span className="font-bold">{toTitleCase(releasedBy)}</span>.</>
          )}
        </p>
      </div>

      {prefillLoading && (
        <p className="mb-3 text-[11px] font-semibold text-slate-400">
          Checking for an existing claim on this item...
        </p>
      )}

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase text-slate-700">Claimant Name *</label>
          <input
            autoFocus
            className="h-11 w-full rounded-xl border border-slate-300 px-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#1478a7]"
            value={name}
            onChange={(e) => onChange('name', e.target.value)}
            placeholder="Full name"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase text-slate-700">Contact Number</label>
          <input
            className="h-11 w-full rounded-xl border border-slate-300 px-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#1478a7]"
            value={contact}
            onChange={(e) => onChange('contact', e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-bold uppercase text-slate-700">Student ID Email *</label>
          <input
            type="email"
            className="h-11 w-full rounded-xl border border-slate-300 px-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#1478a7]"
            value={email}
            onChange={(e) => onChange('email', e.target.value)}
            onBlur={(e) => onChange('email', normalizeClaimantEmail(e.target.value))}
            placeholder="e.g. 23100806@slc-sflu.edu.ph"
          />
          <p className="mt-1 text-[11px] font-medium text-slate-400">
            Type the 8-digit Student ID and the school email is filled in for you.
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <button
          onClick={onConfirm}
          disabled={saving}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0B6B8A] text-sm font-black uppercase tracking-wide text-white shadow-md transition hover:bg-[#095A74] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            'Confirm Claimed'
          )}
        </button>

        <button
          onClick={onClose}
          disabled={saving}
          className="h-12 w-full rounded-xl border border-[#0B6B8A] bg-white text-sm font-black uppercase tracking-wide text-[#0B6B8A] transition hover:bg-[#EAF4FF] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
);

// ─── FoundItems Component ──────────────────────────────────────────────────────
const FoundItems = ({ searchFilter }) => {
  const app = useApp();

  // Name of the moderator/staff member currently logged in — recorded as
  // `released_by` when they mark an item as Claimed.
  const getModeratorName = () => {
    const u = app?.currentUser || app?.user || app?.authUser || null;
    if (u) {
      const full = `${u.first_name || ''} ${u.last_name || ''}`.trim();
      return full || u.name || u.username || u.email || '';
    }
    try {
      const stored = JSON.parse(localStorage.getItem('user') || 'null');
      if (stored) {
        const full = `${stored.first_name || ''} ${stored.last_name || ''}`.trim();
        return full || stored.name || stored.username || stored.email || '';
      }
    } catch {
      /* ignore malformed storage */
    }
    return '';
  };

  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [editItem, setEditItem] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeConfirmation, setActiveConfirmation] = useState(null);
  // 'unclaimed' shows the working queue; 'claimed' shows picked-up items.
  const [claimFilter, setClaimFilter] = useState('unclaimed');
  const tableContainerRef = useRef(null);

  // Item id -> the active claim with a meeting date (see
  // buildScheduledClaimMap). Used for the "Claim scheduled" badges.
  const [scheduledClaims, setScheduledClaims] = useState(new Map());

  // Claimant-info prompt shown from the Review modal's "Mark as Claimed".
  const [claimPrompt, setClaimPrompt] = useState(null);
  const [claimPromptSaving, setClaimPromptSaving] = useState(false);

  // ----------------------------------------------------------
  // OPEN A REVIEW FROM CLAIM REQUESTS
  // Claim Requests' "Review" button (for staff-scheduled claims)
  // navigates here with state { reviewItemId }. Once the items are
  // loaded, that item's Review modal opens automatically.
  // ----------------------------------------------------------
  const location = useLocation();
  const navigate = useNavigate();
  const pendingReviewIdRef = useRef(location.state?.reviewItemId ?? null);

  useEffect(() => {
    if (location.state?.reviewItemId != null) {
      pendingReviewIdRef.current = location.state.reviewItemId;
      // Clear it so a refresh / Back doesn't reopen the modal.
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  useEffect(() => {
    const wanted = pendingReviewIdRef.current;
    if (wanted == null) return;
    const list = Array.isArray(items) ? items : [];
    const match = list.find((it) => String(it.id) === String(wanted));
    if (match) {
      pendingReviewIdRef.current = null;
      setSelectedItem(match);
      return;
    }
    if (list.length === 0) return; // items not loaded yet
    // Not in the list (e.g. filtered out) -> load it directly.
    pendingReviewIdRef.current = null;
    getItemById(wanted)
      .then((item) => {
        const it = item?.item || item;
        if (it && it.id != null) setSelectedItem(it);
        else showToast("Could not find that item in Surrendered Items.");
      })
      .catch(() => showToast("Could not find that item in Surrendered Items."));
  }, [items]);

  useEffect(() => {
    fetchItems();
    const interval = setInterval(() => {
      fetchItems();
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  async function fetchItems() {
    try {
      const response = await getItems();
      setItems(response);
    } catch (error) {
      console.error('Error fetching items:', error);
    }

    // Claims are only used to mark items that already have a claimant
    // with a meeting date; a failure here never blocks the item list.
    try {
      const claimsResponse = await getClaims();
      setScheduledClaims(buildScheduledClaimMap(toArray(claimsResponse)));
    } catch (error) {
      console.error('Error fetching claims for schedule badges:', error);
    }
  }

  const getImageUrl = (img) => {
    if (!img) return null;
    const first = Array.isArray(img) ? img[0] : img;
    if (!first) return null;
    const path = typeof first === 'string' ? first : (first.image || first.file || first.url);
    if (!path) return null;
    return path.startsWith('http') ? path : `${API_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  };

  // Resolves EVERY photo attached to an item (not just the first one).
  const getImageUrls = (img) => {
    if (!img) return [];
    const list = Array.isArray(img) ? img : [img];
    return list
      .map((item) => {
        if (!item) return null;
        const path = typeof item === 'string' ? item : (item.image || item.file || item.url);
        if (!path) return null;
        return path.startsWith('http') ? path : `${API_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
      })
      .filter(Boolean);
  };

  async function handleEdit(item) {
    try {
      const response = await getItemById(item.id);
      let data = Array.isArray(response) ? response[0] : (response.results ? response.results[0] : response);
      setEditItem({ ...data, created_date: data.created_date || '' });
    } catch {
      setEditItem({ ...item, created_date: item.created_date || '' });
    }
  }

  async function handleSaveEdit(updatedForm) {
    try {
      // Student ID can never change through the Edit form — always write
      // back the value that was on the record when Edit was opened
      // (`editItem`). Items with no student_id on record leave it out.
      const formData = new FormData();
      // Skip empty values and nested objects/arrays (e.g. `images`):
      // FormData would send null as the text "null", which the backend
      // rejects (e.g. claimed_date "null" -> "Date has wrong format").
      // Photos are not changed from this form.
      Object.keys(updatedForm).forEach((key) => {
        const val = updatedForm[key];
        if (key === 'image' || key === 'images' || key === 'student_id') return;
        if (val === undefined || val === null) return;
        if (typeof val === 'object' && !(val instanceof File)) return;
        formData.append(key, val);
      });
      if (editItem?.student_id) {
        formData.set('student_id', editItem.student_id);
      }

      await editLostItem(editItem.id, formData);

      logActivity({
        actor_name: updatedForm.poster_name,
        action: 'updated',
        target_title: updatedForm.title,
        details: `updated details for "${updatedForm.title}"`,
      });

      showToast('Surrendered item updated successfully!');
      await fetchItems();
      setEditItem(null);
    } catch (error) {
      console.error('Error updating item:', error);
      showToast('Failed to update item.');
    }
  }

  async function handleDeleteItem(id) {
    if (
      !(await confirmAction({
        message: 'Are you sure you want to delete this item? This cannot be undone.',
        confirmLabel: 'Delete',
        tone: 'danger',
      }))
    ) {
      return;
    }

    try {
      const target = items.find((i) => i.id === id);
      await deleteLostItem(id);

      logActivity({
        action: 'deleted',
        target_title: target?.title,
        details: target?.title ? `deleted "${target.title}"` : 'deleted a surrendered item',
      });

      showToast('Item deleted successfully!');
      await fetchItems();
      if (selectedItem?.id === id) {
        setSelectedItem(null);
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      showToast('Failed to delete item.');
    }
  }

  async function handleArchiveItem(id) {
    try {
      const target = items.find((i) => i.id === id);
      const formData = new FormData();
      formData.append('status', 'Archived');

      await editLostItem(id, formData);

      logActivity({
        action: 'archived',
        target_title: target?.title,
        details: target?.title ? `archived "${target.title}"` : 'archived a surrendered item',
      });

      showToast('Item archived successfully!');
      await fetchItems();
      if (selectedItem?.id === id) {
        setSelectedItem(null);
      }
      setActiveConfirmation(null);
    } catch (error) {
      console.error('Error archiving item:', error);
      showToast('Failed to archive item.');
    }
  }

  async function handleAddItem(form) {
    try {
      // STEP 1 — the finder's Student ID is just the bare 8 digits, sent
      // with the item and used for points as-is.
      const finderId = toIdDigits(form.student_id);

      const formData = new FormData();
      formData.append('type', 'Surrendered');

      // Items logged here are physically turned in and verified by staff,
      // so they're Approved on creation and show on the public board.
      formData.append('status', 'Approved');

      let formattedTime = form.created_time;
      if (!formattedTime || formattedTime.trim() === '') {
        const now = new Date();
        formattedTime = now.toTimeString().slice(0, 5);
      } else if (formattedTime.length > 5) {
        formattedTime = formattedTime.slice(0, 5);
      }
      formData.append('created_time', formattedTime);

      Object.keys(form).forEach((key) => {
        if (key === 'image') {
          if (Array.isArray(form.image)) {
            form.image.forEach((file) => {
              if (file instanceof File) formData.append('image', file);
            });
          } else if (form.image instanceof File) {
            formData.append('image', form.image);
          }
        } else if (key !== 'created_time' && key !== 'status') {
          const val = form[key];
          if (val !== null && val !== undefined && val !== '') {
            formData.append(key, val);
          }
        }
      });

      // STEP 2 — save the item.
      const createdItem = await createLostItem(formData);

      logActivity({
        actor_name: form.poster_name,
        actor_role: 'reporter',
        action: 'created',
        target_title: form.title,
        details: 'turned in a surrendered item',
      });

      // STEP 3 — POINTS SYSTEM. Award points to the finder, keyed by the
      // bare 8-digit Student ID. Wrapped in its own try/catch so a points
      // failure never blocks the item from being saved.
      //
      // The gamification endpoint never double-awards: if the backend
      // already credited this item (items/views.py awards points on
      // create/claim), this call just returns the existing record.
      let pointsWarning = '';
      if (finderId) {
        try {
          await addPointsRecord({
            student_id: finderId,
            player_name: form.poster_name,
            reason: 'SURRENDER_ITEM',
            item_id: createdItem?.ticket_code || createdItem?.id || null,
            points: calculatePoints(form.category, 'SURRENDER_ITEM'),
          });
        } catch (pointsError) {
          console.error('Failed to award points for surrender:', pointsError.response?.data || pointsError.message);
          pointsWarning = '\n\n⚠️ However, points could not be awarded for this item (see console for details).';
        }
      } else {
        pointsWarning = '\n\nNote: no Student ID was entered, so no points were awarded.';
      }

      showToast(`Surrendered item added successfully! It is now visible on the public board under Surrendered Items.${pointsWarning}`);
      await fetchItems();
      setAddOpen(false);
    } catch (error) {
      console.error('Error adding item details:', error.response?.data || error.message);

      let errorMsg = 'Failed to add item.';
      if (error.response?.data) {
        if (typeof error.response.data === 'string') {
          errorMsg = error.response.data;
        } else if (error.response.data.detail) {
          errorMsg = error.response.data.detail;
        } else {
          errorMsg = Object.entries(error.response.data)
            .map(([field, errs]) => `${field.toUpperCase()}: ${Array.isArray(errs) ? errs.join(', ') : errs}`)
            .join('\n');
        }
      }

      showToast(errorMsg);
    }
  }

  // ------------------------------------------------------------------
  // CLAIMANT PROMPT — opened from the Review modal's "Mark as Claimed"
  // button. Pre-fills from the most recent existing Claim record for this
  // item, if any. Failure to look this up never blocks manual entry.
  // ------------------------------------------------------------------
  async function openClaimPrompt(item) {
    if (item.status === 'Claimed') {
      showToast('This item is already claimed.');
      return;
    }

    setClaimPrompt({ item, name: '', contact: '', email: '', prefillLoading: true });

    try {
      const response = await getClaims();
      const claimsList = toArray(response);

      // Several students may have claimed this item. Prefill with the one
      // most likely standing in front of staff: an open claim whose
      // meeting is today, then a staff-confirmed one, then the newest.
      // Everyone else's open claim is closed automatically once the item
      // is marked Claimed (backend claim/closing.py).
      const today = new Date().toLocaleDateString('en-CA');
      const CLOSED_STATUSES = ['rejected', 'declined', 'denied', 'cancelled', 'timed out', 'closed'];
      const rank = (c) =>
        (String(c.meeting_date || '').slice(0, 10) === today ? 2 : 0) +
        (c.staff_scheduled === true || String(c.status || '').toLowerCase() === 'scheduled' ? 1 : 0);
      const matching = claimsList
        .filter((c) => {
          const claimItemId = c.item_details?.id ?? c.item?.id ?? c.item_id ?? c.item;
          return (
            String(claimItemId) === String(item.id) &&
            !CLOSED_STATUSES.includes(String(c.status || '').trim().toLowerCase())
          );
        })
        .sort((a, b) => rank(b) - rank(a) || new Date(b.claim_date) - new Date(a.claim_date))[0];

      setClaimPrompt((prev) =>
        prev && prev.item.id === item.id
          ? {
              ...prev,
              name: matching?.claimant_name || '',
              contact: matching?.claimant_contact || '',
              email: matching?.claimant_email || '',
              prefillLoading: false,
            }
          : prev
      );
    } catch (err) {
      console.error('Failed to look up existing claim for prefill:', err);
      setClaimPrompt((prev) => (prev && prev.item.id === item.id ? { ...prev, prefillLoading: false } : prev));
    }
  }

  const updateClaimPromptField = (field, value) => {
    setClaimPrompt((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  async function confirmClaimPrompt() {
    if (!claimPrompt) return;
    if (!claimPrompt.name.trim()) {
      showToast('Please enter the name of the person claiming this item.');
      return;
    }
    const claimantEmail = normalizeClaimantEmail(claimPrompt.email);
    if (!claimantEmail) {
      showToast("Please enter the claimant's Student ID email.");
      return;
    }
    if (!isValidEmail(claimantEmail)) {
      showToast('Please enter a valid email (e.g. 23100806@slc-sflu.edu.ph).');
      return;
    }

    if (
      !(await confirmAction({
        message: `Release "${claimPrompt.item?.title || 'this item'}" to ${claimPrompt.name.trim()} and mark it as Claimed?`,
        confirmLabel: 'Mark as Claimed',
      }))
    ) {
      return;
    }

    setClaimPromptSaving(true);
    try {
      await handleClaimItem(claimPrompt.item, {
        name: claimPrompt.name.trim(),
        contact: claimPrompt.contact.trim(),
        email: claimantEmail,
      });
      setClaimPrompt(null);
    } finally {
      setClaimPromptSaving(false);
    }
  }

  // `claimantInfo` ({ name, contact, email }) is persisted onto the item as
  // claimed_by_name/claimed_by_contact/claimed_by_email; the logged-in
  // moderator is saved as `released_by`.
  async function handleClaimItem(item, claimantInfo = {}) {
    if (item.status === 'Claimed') {
      showToast('This item is already claimed.');
      return;
    }

    try {
      // Only the claim details change. The update is partial, so every
      // other field stays as it is (re-sending the whole item failed when
      // it had an empty email or description).
      const formData = new FormData();
      formData.set('status', 'Claimed');

      // Record exactly when this item was marked claimed.
      const claimedNow = new Date();
      formData.set('claimed_date', claimedNow.toLocaleDateString('en-CA'));
      formData.set('claimed_time', claimedNow.toTimeString().slice(0, 5));

      // WHO claimed it.
      formData.set('claimed_by_name', claimantInfo.name || '');
      formData.set('claimed_by_contact', claimantInfo.contact || '');
      formData.set('claimed_by_email', claimantInfo.email || '');

      // WHO released it.
      const releasedBy = getModeratorName();
      formData.set('released_by', releasedBy);

      await editLostItem(item.id, formData);

      logActivity({
        actor_name: releasedBy || undefined,
        action: 'claimed',
        target_title: item.title,
        details: claimantInfo.name
          ? `released "${item.title}" to ${claimantInfo.name}${releasedBy ? ` (released by ${releasedBy})` : ''}`
          : `marked "${item.title}" as claimed${releasedBy ? ` (released by ${releasedBy})` : ''}`,
      });

      // ------------------------------------------------------------------
      // POINTS SYSTEM — award points to the ORIGINAL FINDER (by Student ID)
      // when their surrendered item is claimed by its owner.
      //
      // The gamification endpoint never double-awards: if the backend
      // already credited this item (items/views.py awards points on
      // create/claim), this call just returns the existing record.
      // ------------------------------------------------------------------
      let pointsWarning = '';
      try {
        let finderId = toIdDigits(item.student_id);
        let finderName = item.poster_name;

        if (!finderId) {
          try {
            const full = await getItemById(item.id);
            const data = Array.isArray(full)
              ? full[0]
              : (full?.results ? full.results[0] : full);
            finderId = toIdDigits(data?.student_id);
            finderName = data?.poster_name || finderName;
          } catch (lookupErr) {
            console.error('Could not re-fetch item for points award:', lookupErr);
          }
        }

        if (!finderId) {
          pointsWarning =
            '\n\nNote: no finder Student ID is on record for this item, so no points were awarded.';
        } else {
          await addPointsRecord({
            student_id: finderId,
            player_name: finderName,
            reason: 'ITEM_CLAIMED',
            item_id: item.ticket_code || item.id,
            points: calculatePoints(item.category, 'ITEM_CLAIMED'),
          });
        }
      } catch (pointsError) {
        console.error('Failed to award points for claim:', pointsError.response?.data || pointsError.message);
        pointsWarning = '\n\n⚠️ However, points could not be awarded for this claim (see console for details).';
      }

      showToast(`Item marked as claimed!${pointsWarning}`);
      await fetchItems();
      setSelectedItem(null);
    } catch (error) {
      console.error('Error claiming item:', error);
      showToast('Failed to claim item.');
    }
  }

  // Switching tabs re-scopes the whole list, so always land back on page 1.
  const setClaimFilterAndReset = (val) => {
    setClaimFilter(val);
    setCurrentPage(1);
  };

  // Base pool: any Found/Surrendered item that hasn't been archived.
  const activeFoundItems = items.filter((item) => {
    const itemType = item.type?.toUpperCase() || '';
    const isFoundType = itemType === 'SURRENDERED' || itemType === 'FOUND';
    return isFoundType && item.status?.toUpperCase() !== 'ARCHIVED';
  });

  const unclaimedCount = activeFoundItems.filter(
    (item) => item.status?.toUpperCase() !== 'CLAIMED'
  ).length;
  const claimedCount = activeFoundItems.filter(
    (item) => item.status?.toUpperCase() === 'CLAIMED'
  ).length;

  const filteredFound = activeFoundItems
    .filter((item) => {
      const query = search.toLowerCase();
      const status = item.status?.toUpperCase();
      const matchesClaimTab = claimFilter === 'claimed' ? status === 'CLAIMED' : status !== 'CLAIMED';

      return (
        matchesClaimTab &&
        (
          item.title?.toLowerCase().includes(query) ||
          item.category?.toLowerCase().includes(query) ||
          item.poster_name?.toLowerCase().includes(query) ||
          item.location?.toLowerCase().includes(query)
        )
      );
    })
    .sort((a, b) => b.id - a.id);

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(filteredFound.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedItems = filteredFound.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // "Date Claimed" column only shows on the Claimed tab.
  const showDateClaimedColumn = claimFilter !== 'unclaimed';

  const goToPage = (page) => {
    setCurrentPage(page);
    tableContainerRef.current?.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  return (
    <div className="bg-white rounded-[18px] border border-[#D8E2EF] shadow-[0_8px_24px_rgba(45,54,109,0.08)] overflow-hidden flex flex-col h-[calc(100vh-135px)]">

        {/* Header */}
        <div className="bg-white px-6 sm:px-8 py-4 border-b border-[#D8E2EF] shrink-0">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 shrink-0">
            <div className="flex items-center gap-3">

              <div>
                <h3 className="text-base sm:text-lg font-black uppercase tracking-[0.16em] text-[#071E3D]">
                  Surrendered Items
                </h3>
                <p className="text-xs sm:text-sm text-[#7B8AA6] italic mt-0.5">
                  Manage all surrendered items
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:w-auto">
              <div className="relative w-full sm:w-[300px]">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#0B6B8A] text-sm">🔍</span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search surrendered items..."
                  className="w-full pl-10 pr-4 py-2.5 border border-[#CBD8E8] rounded-full text-sm outline-none bg-white text-[#071E3D] placeholder:text-[#8A98B3] focus:ring-2 focus:ring-[#0B6B8A]/20 focus:border-[#0B6B8A]"
                />
              </div>

              <button
                onClick={() => setAddOpen(true)}
                className="px-6 py-2.5 rounded-full bg-[#2D366D] text-white font-black uppercase tracking-[0.1em] text-xs shadow-[0_6px_14px_rgba(45,54,109,0.25)] hover:bg-[#24305C] transition-all whitespace-nowrap"
              >
                📋 Add Surrendered Item
              </button>
            </div>
          </div>

          {/* Claimed / Not Claimed tabs */}
          <div className="mt-4 flex justify-end">
            <div className="inline-flex items-center gap-1 rounded-full bg-[#F1F4F9] p-1">
              <button
                type="button"
                onClick={() => setClaimFilterAndReset('unclaimed')}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black uppercase tracking-wide transition-all ${
                  claimFilter === 'unclaimed'
                    ? 'bg-white text-[#0B6B8A] shadow-sm'
                    : 'text-[#7B8AA6] hover:text-[#475569]'
                }`}
              >
                <span>Not Claimed</span>
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black ${
                    claimFilter === 'unclaimed' ? 'bg-[#0B6B8A]/10 text-[#0B6B8A]' : 'bg-white text-[#7B8AA6]'
                  }`}
                >
                  {unclaimedCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setClaimFilterAndReset('claimed')}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black uppercase tracking-wide transition-all ${
                  claimFilter === 'claimed'
                    ? 'bg-white text-purple-600 shadow-sm'
                    : 'text-[#7B8AA6] hover:text-[#475569]'
                }`}
              >
                <span>Claimed</span>
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black ${
                    claimFilter === 'claimed' ? 'bg-purple-100 text-purple-600' : 'bg-white text-[#7B8AA6]'
                  }`}
                >
                  {claimedCount}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div ref={tableContainerRef} className="flex-1 overflow-auto bg-white">
          <table className="w-full min-w-[1120px] table-fixed border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className={`${showDateClaimedColumn ? "w-[10%]" : "w-[11%]"} bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white`}>Ticket</th>
                <th className={`${showDateClaimedColumn ? "w-[13%]" : "w-[15%]"} bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white`}>Item Name</th>
                <th className={`${showDateClaimedColumn ? "w-[10%]" : "w-[11%]"} bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white`}>Category</th>
                <th className={`${showDateClaimedColumn ? "w-[13%]" : "w-[15%]"} bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white`}>Surrendered By</th>
                <th className={`${showDateClaimedColumn ? "w-[13%]" : "w-[15%]"} bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white`}>Area Found</th>
                <th className={`${showDateClaimedColumn ? "w-[11%]" : "w-[13%]"} bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white`}>Date Found</th>
                {showDateClaimedColumn && (
                  <th className="w-[11%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Date Claimed</th>
                )}
                <th className={`${showDateClaimedColumn ? "w-[9%]" : "w-[10%]"} bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white`}>Status</th>
                <th className={`${showDateClaimedColumn ? "w-[8%]" : "w-[10%]"} bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white`}>Action</th>
              </tr>
            </thead>

            <tbody className="bg-white">
              {paginatedItems.length > 0 ? (
                paginatedItems.map((item, index) => (
                  <tr key={item.id} className={`h-[56px] ${index % 2 === 0 ? "bg-white" : "bg-[#F6FAFF]"} hover:bg-[#EAF4FF]`}>
                    <td className="border border-gray-300 p-2 text-center align-middle font-bold text-[#0B6B8A] text-xs">{item.ticket_code}</td>
                    <td className="border border-gray-300 p-4 text-center align-middle text-slate-700 text-[13px]">
                      {toTitleCase(item.title)}
                      {(() => {
                        const claim =
                          item.status?.toUpperCase() !== 'CLAIMED' && scheduledClaims.get(String(item.id));
                        if (!claim) return null;
                        const confirmed = isConfirmedClaim(claim);
                        return (
                          <span
                            title={`${claim.claimant_name || 'A claimant'} — ${formatMeetingDay(claim.meeting_date)}${claim.meeting_time ? `, ${claim.meeting_time}` : ''}`}
                            className={`mt-1 mx-auto flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              confirmed ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            <CalendarClock size={11} />
                            {confirmed ? 'Claim scheduled' : 'Claim requested'} · {formatMeetingDay(claim.meeting_date)}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="border border-gray-300 p-4 text-center align-middle text-[#2D366D] text-[13px] uppercase">{item.category || '-'}</td>
                    <td className="border border-gray-300 p-4 text-center align-middle text-slate-600 text-[13px]">{toTitleCase(item.poster_name) || '-'}</td>
                    <td className="border border-gray-300 p-4 text-center align-middle text-slate-700 text-[13px]">{toTitleCase(item.location) || '-'}</td>
                    <td className="border border-gray-300 p-4 text-center align-middle text-slate-700 text-[13px]">
                      <span className="block">{item.created_date ? item.created_date : '-'}</span>
                      <span className="block text-xs text-slate-400">{item.created_time ? item.created_time : ''}</span>
                    </td>
                    {showDateClaimedColumn && (
                      <td className="border border-gray-300 p-4 text-center align-middle text-slate-700 text-[13px]">
                        {item.status?.toUpperCase() === 'CLAIMED' && item.claimed_date ? (
                          <>
                            <span className="block">{item.claimed_date}</span>
                            <span className="block text-xs text-slate-400">{item.claimed_time ? item.claimed_time : ''}</span>
                          </>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    )}
                    <td className="border border-gray-300 p-4 text-center align-middle">
                      <span className={`rounded px-3 py-1 text-[10px] font-black uppercase ${statusColor(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="border border-gray-300 p-2 text-center align-middle">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setSelectedItem(item)}
                          title="Review Item"
                          className="inline-flex h-8 w-8 items-center justify-center rounded bg-[#0B6B8A] text-white transition hover:bg-[#095A74]"
                        >
                          <Eye size={16} />
                        </button>
                        {/* No editing once the item is Claimed (released). */}
                        {item.status !== 'Claimed' && (
                          <button
                            onClick={() => handleEdit(item)}
                            title="Edit Item"
                            className="inline-flex h-8 w-8 items-center justify-center rounded bg-[#2D366D] text-white transition hover:opacity-90"
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                        <button
                          onClick={() => setActiveConfirmation({
                            text: "Are you sure you want to archive this item?",
                            action: () => handleArchiveItem(item.id)
                          })}
                          title="Archive Item"
                          className="inline-flex h-8 w-8 items-center justify-center rounded bg-amber-600 text-white transition hover:bg-amber-700"
                        >
                          <Archive size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={showDateClaimedColumn ? 9 : 8} className="bg-white py-24 text-center text-[#7B8AA6] font-bold uppercase">
                    {claimFilter === 'claimed' ? 'No claimed items found' : 'No found items found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <Pagination
          currentPage={currentPage}
          totalItems={filteredFound.length}
          pageSize={ITEMS_PER_PAGE}
          onPageChange={goToPage}
        />

      {/* Review Modal */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedItem(null);
          }}
        >
          <div className="w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-md bg-white shadow-2xl">
            <div className="flex items-start justify-between bg-gradient-to-r from-[#0B648D] to-[#155F87] px-6 py-3 text-white">
              <div>
                <h3 className="text-lg font-bold">Surrendered Item Review</h3>
                <p className="mt-1 text-sm text-white/90">
                  Review details for this turned-in item
                </p>
              </div>

              <button
                onClick={() => setSelectedItem(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[calc(92vh-88px)] overflow-y-auto px-6 py-5">
              <div className="mx-auto max-w-3xl space-y-4">
                {(() => {
                  const claim =
                    selectedItem.status?.toUpperCase() !== 'CLAIMED' &&
                    scheduledClaims.get(String(selectedItem.id));
                  if (!claim) return null;
                  const confirmed = isConfirmedClaim(claim);
                  return (
                    <div
                      className={`flex items-start gap-3 rounded-xl border p-4 ${
                        confirmed ? 'border-blue-200 bg-blue-50' : 'border-amber-200 bg-amber-50'
                      }`}
                    >
                      <CalendarClock
                        size={20}
                        className={`mt-0.5 shrink-0 ${confirmed ? 'text-blue-600' : 'text-amber-600'}`}
                      />
                      <div className="text-sm">
                        <p className={`font-black uppercase tracking-wide text-xs ${confirmed ? 'text-blue-700' : 'text-amber-700'}`}>
                          {confirmed ? 'Verification meeting scheduled' : 'Claim requested — waiting for review'}
                        </p>
                        <p className="mt-1 font-semibold text-slate-700">
                          {claim.claimant_name || 'A claimant'}
                          {claim.claimant_email ? ` (${claim.claimant_email})` : ''}
                        </p>
                        <p className="text-slate-600">
                          {formatMeetingDay(claim.meeting_date)}
                          {claim.meeting_time ? ` · ${claim.meeting_time}` : ''} · Student Affairs Office
                        </p>
                      </div>
                    </div>
                  );
                })()}
                {(() => {
                  const imgs = getImageUrls(selectedItem.images || selectedItem.image || selectedItem.file);

                  if (imgs.length === 0) {
                    return (
                      <img
                        src="https://via.placeholder.com/900x500?text=No+Image"
                        className="h-72 w-full rounded-xl border border-slate-200 bg-slate-100 object-cover"
                        alt="No Item"
                      />
                    );
                  }

                  if (imgs.length === 1) {
                    return (
                      <img
                        src={imgs[0]}
                        className="h-72 w-full rounded-xl border border-slate-200 bg-slate-100 object-cover"
                        alt="Surrendered Item Preview"
                      />
                    );
                  }

                  const gridColsClass = imgs.length === 2 ? "grid-cols-2" : "grid-cols-3";

                  return (
                    <div className={`grid ${gridColsClass} gap-2`}>
                      {imgs.map((src, idx) => (
                        <img
                          key={idx}
                          src={src}
                          className="h-40 w-full rounded-xl border border-slate-200 bg-slate-100 object-cover cursor-pointer transition hover:opacity-90"
                          alt={`Surrendered Item Preview ${idx + 1}`}
                          onClick={() => window.open(src, "_blank")}
                        />
                      ))}
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 block text-xs font-bold uppercase text-slate-700">Student ID</p>
                    <div className="min-h-11 rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-700">
                      {selectedItem.student_id || '-'}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 block text-xs font-bold uppercase text-slate-700">Surrendered By</p>
                    <div className="min-h-11 rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-700">
                      {toTitleCase(selectedItem.poster_name) || '-'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 block text-xs font-bold uppercase text-slate-700">Item Name</p>
                    <div className="min-h-11 rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700">
                      {toTitleCase(selectedItem.title) || '-'}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 block text-xs font-bold uppercase text-slate-700">Category</p>
                    <div className="min-h-11 rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-700">
                      {toTitleCase(selectedItem.category) || '-'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 block text-xs font-bold uppercase text-slate-700">Area Found</p>
                    <div className="min-h-11 rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-700">
                      {toTitleCase(selectedItem.location) || '-'}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 block text-xs font-bold uppercase text-slate-700">Date Found</p>
                    <div className="min-h-11 rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-700">
                      <div><span className="font-semibold">Start:</span> {selectedItem.created_date || '-'}{selectedItem.created_time ? ` · ${String(selectedItem.created_time).slice(0, 5)}` : ''}</div>
                      {(selectedItem.end_date || selectedItem.end_time) && (
                        <div><span className="font-semibold">End:</span> {selectedItem.end_date || selectedItem.created_date}{selectedItem.end_time ? ` · ${String(selectedItem.end_time).slice(0, 5)}` : ''}</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* CLAIMED BY — only shown for Claimed items. */}
                {selectedItem.status?.toUpperCase() === 'CLAIMED' && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <p className="mb-2 block text-xs font-bold uppercase text-slate-700">Claimed By</p>
                      <div className="min-h-11 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm font-bold text-purple-800">
                        {toTitleCase(selectedItem.claimed_by_name) || 'Not recorded'}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 block text-xs font-bold uppercase text-slate-700">Claimant Contact</p>
                      <div className="min-h-11 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-800">
                        {selectedItem.claimed_by_contact || selectedItem.claimed_by_email || 'Not recorded'}
                      </div>
                    </div>
                  </div>
                )}

                {/* Date Claimed + Released By */}
                {selectedItem.status?.toUpperCase() === 'CLAIMED' && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {selectedItem.claimed_date && (
                      <div>
                        <p className="mb-2 block text-xs font-bold uppercase text-slate-700">Date Claimed</p>
                        <div className="min-h-11 rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-700">
                          {selectedItem.claimed_date}
                          {selectedItem.claimed_time ? ` ${selectedItem.claimed_time}` : ''}
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="mb-2 block text-xs font-bold uppercase text-slate-700">Released By</p>
                      <div className="min-h-11 rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm font-bold text-purple-800">
                        {toTitleCase(selectedItem.released_by) || 'Not recorded'}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 block text-xs font-bold uppercase text-slate-700">Status</p>
                    <div className="min-h-11 rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-700">
                      <span className={`rounded-full px-3 py-1 text-[13px] font-black uppercase ${statusColor(selectedItem.status)}`}>
                        {selectedItem.status || '-'}
                      </span>
                    </div>
                  </div>
                </div>

                {selectedItem.description && (
                  <div>
                    <p className="mb-2 block text-xs font-bold uppercase text-slate-700">Description</p>
                    <div className="min-h-16 rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-700">
                      {selectedItem.description}
                    </div>
                  </div>
                )}

                {[1, 2, 3, 4]
                  .map((n) => selectedItem[`verification_question_${n}`])
                  .some(Boolean) && (
                  <div>
                    <p className="mb-2 block text-xs font-bold uppercase text-slate-700">
                      Ownership Verification Questions
                    </p>
                    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                      {[1, 2, 3, 4].map((n) => {
                        const q = selectedItem[`verification_question_${n}`];
                        const a = selectedItem[`verification_answer_${n}`];
                        return q ? (
                          <p key={n} className="text-sm text-slate-700">
                            <span className="font-bold text-amber-700">{n}.</span> {q}
                            {a ? (
                              <span className="ml-1 text-emerald-700">
                                — Answer: <span className="font-semibold">{a}</span>
                              </span>
                            ) : null}
                          </p>
                        ) : null;
                      })}
                    </div>
                  </div>
                )}

                {/* Review Modal Action Buttons */}
                {/* Edit lives in the table row (Review · Edit · Archive). */}
                <div className="flex gap-3 pt-4 border-t border-slate-200">

                  {selectedItem.status !== 'Claimed' && (
                    <button
                      onClick={() => openClaimPrompt(selectedItem)}
                      className="flex-1 flex items-center justify-center gap-2 py-3 bg-purple-600 text-white rounded-xl font-bold uppercase text-sm hover:bg-purple-700 transition-all"
                    >
                      <CheckCircle size={16} /> Mark as Claimed
                    </button>
                  )}

                  <button
                    onClick={() => setActiveConfirmation({
                      text: "Are you sure you want to archive this item?",
                      action: () => handleArchiveItem(selectedItem.id)
                    })}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-amber-600 text-white rounded-xl font-bold uppercase text-sm hover:bg-amber-700 transition-all"
                  >
                    <Archive size={16} /> Archive Item
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {addOpen && (
        <ItemModal
          onSave={handleAddItem}
          onClose={() => setAddOpen(false)}
        />
      )}

      {/* Edit Modal */}
      {editItem && (
        <ItemModal
          item={editItem}
          onSave={handleSaveEdit}
          onClose={() => setEditItem(null)}
        />
      )}

      {/* Global Confirmation Dialog */}
      {activeConfirmation && (
        <ConfirmModal
          message={activeConfirmation.text}
          onConfirm={() => {
            activeConfirmation.action();
            setActiveConfirmation(null);
          }}
          onClose={() => setActiveConfirmation(null)}
        />
      )}

      {/* Claimant Info Prompt */}
      {claimPrompt && (
        <ClaimantInfoModal
          item={claimPrompt.item}
          name={claimPrompt.name}
          contact={claimPrompt.contact}
          email={claimPrompt.email}
          releasedBy={getModeratorName()}
          prefillLoading={claimPrompt.prefillLoading}
          saving={claimPromptSaving}
          onChange={updateClaimPromptField}
          onConfirm={confirmClaimPrompt}
          onClose={() => setClaimPrompt(null)}
        />
      )}
    </div>
  );
};

export default FoundItems;