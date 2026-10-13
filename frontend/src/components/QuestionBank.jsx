import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2, HelpCircle, AlertCircle, X, Tag, Sparkles, Loader2 } from 'lucide-react';
import Pagination from "./Pagination";
import { confirmAction } from "./ConfirmDialog";
import {
  ALL_KINDS_KEY,
  getKindsForCategory,
  getQuestionKind,
  isAlwaysKeptOption,
  optionFitsKind,
  setQuestionBankGroups,
} from "../utils/itemOptionGroups";
import { showToast } from "../utils/toast";
import { API_URL } from "../api/api";

// Base URL of your Django API, taken from the shared API_URL in api.js
// (VITE_API_URL in production, http://localhost:8000/ locally). The
// trailing slash is removed because the paths below start with "/"
// (e.g. "/questions/"). This app's endpoints live under /questions/.
const API_BASE_URL = API_URL.replace(/\/+$/, '');

// Kept in sync with the item categories used in FoundItems.jsx (CATS) and
// ClaimModal.jsx (CATEGORY_QUESTIONS). 'All' is filter-only. A question
// can be tagged with several categories (checkboxes), so a shared
// question like color or brand is added once for all of them.
const CATEGORIES = [
  'All',
  'Accessories',
  'ID',
  'Academic Materials',
  'Bags & Wallets',
  'Clothing',
  'Electronic',
  'Keys',
];

const ITEM_CATEGORIES = CATEGORIES.filter((c) => c !== 'All');

// A question's categories (older entries only have `category`).
const categoriesOf = (q) => {
  if (Array.isArray(q?.categories) && q.categories.length) return q.categories;
  const one = String(q?.category || '').trim();
  if (!one || ['general', 'all'].includes(one.toLowerCase())) return ITEM_CATEGORIES;
  return [one];
};

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

const GENERAL_OPTION_LISTS = {
  Color: COLORS,
  'Design/Distinctive Features': DESIGN_FEATURES,
};

const CATEGORY_BRANDS = {
  Accessories: [
    'Bench', 'Penshoppe', 'Kultura', 'Casio', 'G-Shock', 'Seiko', 'Citizen', 'Fossil',
    'Timex', 'Swatch', 'Rolex', 'Tissot', 'Daniel Wellington', 'Apple', 'Samsung',
    'Garmin', 'Xiaomi', 'Huawei', 'Amazfit', 'Jewelmer', 'Haliya', 'Hiraya',
    'Golden South Sea Pearls', 'Pandora', 'Swarovski', 'Tiffany & Co.', 'Cartier',
    'Bvlgari', 'Michael Kors', 'Coach', 'Kate Spade', 'Sunnies Studios', 'Ideal Vision',
    'EO Executive Optical', 'Ray-Ban', 'Oakley', 'JINS', 'Gucci', 'Prada', 'Persol',
    'Polaroid', 'OXGN', 'Team Manila', 'Bocu', 'Regatta', 'Nike', 'Adidas', 'Puma',
    'New Era', 'Vans', 'Converse', 'Under Armour', 'ForMe', 'Memo', "Levi's",
    'Calvin Klein', 'Zara', 'Tommy Hilfiger', 'Lacoste',
  ],
  ID: [
    'PSA / PhilSys — National ID', 'LTO — Driver\u2019s License', 'DFA — Passport',
    'PRC — Professional ID', 'SSS', 'PhilHealth', 'Pag-IBIG', 'PHLPost — Postal ID',
    'Saint Louis College', 'School/University', 'Company/Employer', 'Government Agency',
    'Organization', 'BDO', 'BPI', 'Metrobank', 'PNB', 'UnionBank', 'RCBC',
    'Security Bank', 'LandBank', 'DBP', 'China Bank', 'EastWest Bank', 'AUB',
    'Maybank', 'HSBC', 'Citibank',
  ],
  'Academic Materials': [
    'Cattleya', 'Advance', 'Corona', 'Best Buy', 'Expressions', 'National Book Store',
    'Kokuyo', 'Muji', 'Moleskine', 'Campus', 'Rhodia', 'Oxford', 'Clairefontaine',
    'Pilot', 'Uni', 'Zebra', 'Pentel', 'Faber-Castell', 'Stabilo', 'Schneider',
    'Paper Mate', 'Sharpie', 'Staedtler', 'Maped', 'Deli', 'Casio', 'Canon', 'Sharp',
    'Citizen', 'Texas Instruments', 'HP', 'Sakura', 'Crayola', 'Rex Book Store',
    'C&E Publishing', 'Pearson', 'McGraw Hill', 'Cengage', 'Wiley', 'Cambridge',
    'Macmillan', 'SanDisk', 'Kingston', 'Transcend', 'Toshiba', 'Lexar', 'Samsung',
    'Crucial', 'Western Digital',
  ],
  'Bags & Wallets': [
    'Hawk', 'Tiger', 'Straightforward', 'Bench', 'Penshoppe', 'OXGN', 'World Balance',
    'Team Manila', 'Jansport', 'Herschel', 'Nike', 'Adidas', 'Puma', 'Fj\u00e4llr\u00e4ven',
    'The North Face', 'Doughnut', 'Eastpak', 'Samsonite', 'Targus', 'Case Logic',
    'Lenovo', 'HP', 'Dell', 'American Tourister', 'Aranaz', 'R2R', 'Kultura', 'Bayo',
    'ForMe', 'Uniqlo', 'Longchamp', 'Coach', 'Michael Kors', 'Kate Spade',
    'Charles & Keith', 'Baggu', 'Anello', 'Fossil', 'Calvin Klein', 'Tommy Hilfiger',
    'Lacoste', "Levi's", 'World Traveller', 'Delsey', 'Tumi', 'Victorinox', 'SwissGear',
  ],
  Clothing: [
    'Bench', 'Penshoppe', 'OXGN', 'Human', 'Oxygen', 'Memo', 'ForMe', 'Regatta', 'Bocu',
    'Bayo', 'Jag', 'RRJ', 'Team Manila', 'Straightforward', 'Nike', 'Adidas', 'Puma',
    'Uniqlo', 'H&M', 'Zara', "Levi's", 'Lacoste', 'Tommy Hilfiger', 'Calvin Klein',
    'Gap', 'Cotton On', 'Giordano', 'Under Armour', 'New Balance', 'Champion',
    'The North Face', 'Columbia', 'Vans', 'Converse', 'Wrangler', 'Lee', 'Dickies',
    'Carhartt', 'Plains & Prints', 'Kamiseta', 'R.A.F.', 'Mango', 'Forever 21',
    'Charles & Keith', 'World Balance', 'Rusty Lopez', 'Parisian', 'Bristol',
    'Easy Soft', 'Spartan', 'Islander', 'Banana Peel', 'Tribu', 'Reebok', 'Skechers',
    'Crocs', 'Asics', 'Fila', 'On', 'Hoka', 'Havaianas', 'Birkenstock',
    'Hanes Philippines', 'Jockey', 'Hanes',
  ],
  Electronic: [
    'Cherry Mobile', 'MyPhone', 'Starmobile', 'CloudFone', 'Torque', 'Apple', 'Samsung',
    'Xiaomi', 'Redmi', 'Oppo', 'Vivo', 'Realme', 'Huawei', 'Google Pixel', 'OnePlus',
    'Nokia', 'Motorola', 'Asus', 'Sony', 'HP', 'Dell', 'Lenovo', 'Acer', 'MSI',
    'Microsoft', 'Razer', 'Amazfit', 'Garmin', 'Fitbit', 'Casio', 'JBL', 'Anker',
    'Soundcore', 'Jabra', 'Bose', 'Sennheiser', 'Skullcandy', 'Audio-Technica',
    'Logitech', 'Marshall', 'Harman Kardon', 'Romoss', 'UGREEN', 'Baseus', 'Aukey',
    'Belkin', 'A4Tech', 'Redragon', 'Corsair', 'SteelSeries', 'Canon', 'Nikon',
    'Fujifilm', 'Panasonic', 'GoPro', 'DJI', 'Kodak', 'Epson', 'Brother',
  ],
  Keys: [
    'Union', 'Yale', 'Schlage', 'Kwikset', 'Dormakaba', 'Master Lock', 'Ace', 'Rusi',
    'MotorStar', 'Honda', 'Yamaha', 'Suzuki', 'Kawasaki', 'KTM', 'Vespa', 'Kymco',
    'Toyota', 'Mitsubishi', 'Nissan', 'Isuzu', 'Ford', 'Mazda', 'Hyundai', 'Kia',
    'Chevrolet', 'Subaru', 'BMW', 'Mercedes-Benz', 'Audi', 'Volkswagen',
  ],
};

const CATEGORY_SIZES = {
  Accessories: [
    'Small', 'Medium', 'Large', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'One Size',
    'Adjustable', 'Short', 'Medium Length', 'Long', 'Ring Size 5–12', 'Other', 'Unknown',
  ],
  ID: [
    'Standard ID Size', 'Standard Card Size', 'Passport Size', 'Other', 'Unknown',
  ],
  'Academic Materials': [
    'Small', 'Medium', 'Large', 'Pocket', 'A5', 'A4', 'Letter', 'Legal', 'Short',
    'Long', '6 inches', '12 inches', '18 inches', '24 inches', 'Standard', 'Other',
    'Unknown',
  ],
  'Bags & Wallets': [
    'Mini', 'Small', 'Medium', 'Large', 'XL', 'XXL', 'Carry-on', '11 inches',
    '13 inches', '14 inches', '15 inches', '16 inches', '17 inches', 'Other', 'Unknown',
  ],
  Clothing: [
    'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL', '5XL', '26', '28', '30',
    '32', '34', '36', '38', '40', '42', '44', 'One Size', 'Adjustable', 'Other',
    'Unknown',
  ],
  Electronic: [
    'Mini', 'Small', 'Medium', 'Large', 'Compact', 'Standard', '7 inches', '8 inches',
    '10 inches', '11 inches', '12 inches', '13 inches', '14 inches', '15 inches',
    '16 inches', '17 inches', '19 inches', '21 inches', '24 inches', '27 inches',
    '32 inches', '34+ inches', '256GB', '512GB', '1TB', '2TB', '4TB', '5TB+', 'Other',
    'Unknown',
  ],
  Keys: [
    'Mini', 'Small', 'Standard', 'Large', '2 Keys', '3 Keys', '4+ Keys', 'Other',
    'Unknown',
  ],
};

// Small fetch wrapper: throws with a readable message on non-2xx so
// callers can surface it, and returns null for 204 No Content (DELETE).
async function api(path, options = {}) {
  // Logged-in staff token: the server only lets Admin / Moderator add, edit
  // or delete questions.
  const token = localStorage.getItem('accessToken');
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = JSON.stringify(body);
    } catch (_) {
      // response wasn't JSON; keep statusText
    }
    throw new Error(`API ${options.method || 'GET'} ${path} failed (${res.status}): ${detail}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// One choice "chip". `linked` marks a choice the admin linked to this
// group (shows a small unlink button next to ×).
function OptionChip({ label, onRemove, linked = false, onUnlink }) {
  return (
    <span
      className={`flex items-center gap-1 rounded-full border pl-3 pr-1.5 py-1 text-xs font-semibold ${
        linked
          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
          : 'bg-blue-50 border-blue-200 text-[#0B648D]'
      }`}
    >
      {label}
      {linked && onUnlink && (
        <button
          type="button"
          onClick={onUnlink}
          title="Unlink from this item type"
          className="flex h-4 items-center justify-center rounded-full px-1 text-[9px] font-black uppercase hover:bg-emerald-200"
        >
          unlink
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        title="Remove this choice"
        className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-blue-200"
      >
        <X size={11} />
      </button>
    </span>
  );
}

// A titled group of choices with a divider line.
function OptionSection({ title, count, hint, tone = 'blue', children }) {
  const titleColor =
    tone === 'amber' ? 'text-amber-700' : tone === 'slate' ? 'text-slate-500' : 'text-[#0B648D]';
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className={`shrink-0 text-[11px] font-black uppercase tracking-wide ${titleColor}`}>
          {title}
        </span>
        <span className="shrink-0 rounded-full bg-slate-100 px-1.5 text-[10px] font-bold text-slate-500">
          {count}
        </span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>
      {hint && <p className="mb-2 text-[11px] text-slate-400">{hint}</p>}
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export default function QuestionBank() {
  const [questions, setQuestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');

  const [currentPage, setCurrentPage] = useState(1);
  const QUESTIONS_PER_PAGE = 10;

  const [expandedOptionRows, setExpandedOptionRows] = useState(new Set());
  const OPTIONS_PREVIEW_LIMIT = 4;

  const toggleOptionsExpanded = (id) => {
    setExpandedOptionRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const EMPTY_FORM = { text: '', categories: [], is_default: false, options: [], option_groups: {} };
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [optionDraft, setOptionDraft] = useState('');
  // Which item type a newly typed choice is linked to (brand / size /
  // design questions). ALL_KINDS_KEY = every item type in the category.
  const [linkTarget, setLinkTarget] = useState(ALL_KINDS_KEY);

  // Fetch the full question bank from the Django API. Called on mount and
  // after any create/update/delete so the table always reflects what's
  // actually in Postgres (rather than trusting optimistic local state).
  const fetchQuestions = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await api('/questions/');
      // DRF pagination returns {results: [...]}; a plain ModelViewSet
      // without pagination returns the array directly. Handle both.
      const list = Array.isArray(data) ? data : data.results || [];
      setQuestions(list);
      setQuestionBankGroups(list);
    } catch (e) {
      console.error('Failed to load question bank:', e);
      setLoadError('Could not load questions from the server. Is the API running?');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQuestions();
  }, [fetchQuestions]);

  const handleOpenAdd = () => {
    setEditingQuestion(null);
    setFormData(EMPTY_FORM);
    setOptionDraft('');
    setLinkTarget(ALL_KINDS_KEY);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (q) => {
    setEditingQuestion(q);
    setFormData({
      text: q.text,
      categories: q.is_default ? [...ITEM_CATEGORIES] : categoriesOf(q),
      is_default: !!q.is_default,
      options: q.options || [],
      option_groups: q.option_groups && typeof q.option_groups === 'object' ? q.option_groups : {},
    });
    setOptionDraft('');
    setLinkTarget(ALL_KINDS_KEY);
    setIsModalOpen(true);
  };

  const handleAddOption = () => {
    const pieces = optionDraft.split(',').map((p) => p.trim()).filter(Boolean);
    if (pieces.length === 0) return;
    setFormData((prev) => {
      const existingLower = new Set(prev.options.map((o) => o.toLowerCase()));
      const additions = pieces.filter((p) => !existingLower.has(p.toLowerCase()));

      // Link every typed choice (new or already listed) to the chosen
      // item type, so it shows up for that kind of item.
      const groups = { ...(prev.option_groups || {}) };
      if (linkTarget && groupingEnabled) {
        const current = groups[linkTarget] || [];
        const currentLower = new Set(current.map((o) => o.toLowerCase()));
        const canonical = (piece) =>
          prev.options.find((o) => o.toLowerCase() === piece.toLowerCase()) || piece;
        groups[linkTarget] = [
          ...current,
          ...pieces.map(canonical).filter((p) => !currentLower.has(p.toLowerCase())),
        ];
      }

      return { ...prev, options: [...prev.options, ...additions], option_groups: groups };
    });
    setOptionDraft('');
  };

  const handleLoadCategoryList = (category) => {
    const preset = CATEGORY_BRANDS[category];
    if (!preset || preset.length === 0) return;
    setFormData((prev) => {
      const existingLower = new Set(prev.options.map((o) => o.toLowerCase()));
      const additions = preset.filter((p) => !existingLower.has(p.toLowerCase()));
      return { ...prev, options: [...prev.options, ...additions] };
    });
  };

  const handleLoadCategorySizeList = (category) => {
    const preset = CATEGORY_SIZES[category];
    if (!preset || preset.length === 0) return;
    setFormData((prev) => {
      const existingLower = new Set(prev.options.map((o) => o.toLowerCase()));
      const additions = preset.filter((p) => !existingLower.has(p.toLowerCase()));
      return { ...prev, options: [...prev.options, ...additions] };
    });
  };

  const handleLoadGeneralList = (label) => {
    const preset = GENERAL_OPTION_LISTS[label];
    if (!preset || preset.length === 0) return;
    setFormData((prev) => {
      const existingLower = new Set(prev.options.map((o) => o.toLowerCase()));
      const additions = preset.filter((p) => !existingLower.has(p.toLowerCase()));
      return { ...prev, options: [...prev.options, ...additions] };
    });
  };

  const handleOptionKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddOption();
    }
  };

  // Removes a choice completely (from the list and every item-type link).
  const handleRemoveOption = (value) => {
    const lower = String(value).toLowerCase();
    setFormData((prev) => {
      const groups = {};
      Object.entries(prev.option_groups || {}).forEach(([key, list]) => {
        const kept = (list || []).filter((o) => o.toLowerCase() !== lower);
        if (kept.length) groups[key] = kept;
      });
      return {
        ...prev,
        options: prev.options.filter((o) => o.toLowerCase() !== lower),
        option_groups: groups,
      };
    });
  };

  // Removes only an admin-made link between a choice and one item type.
  const handleUnlinkOption = (kindKey, value) => {
    const lower = String(value).toLowerCase();
    setFormData((prev) => {
      const groups = { ...(prev.option_groups || {}) };
      const kept = (groups[kindKey] || []).filter((o) => o.toLowerCase() !== lower);
      if (kept.length) groups[kindKey] = kept;
      else delete groups[kindKey];
      return { ...prev, option_groups: groups };
    });
  };

  // ── Item-type grouping (brand / size / design questions) ──────────
  const questionKind = getQuestionKind(formData.text);
  // Item types across every checked category (no duplicates).
  const itemKinds = questionKind
    ? formData.categories
        .flatMap((cat) => getKindsForCategory(cat))
        .filter((kind, i, all) => all.findIndex((k) => k.key === kind.key) === i)
    : [];
  const groupingEnabled = itemKinds.length > 0;
  const optionGroups = formData.option_groups || {};
  const isLinked = (kindKey, opt) =>
    (optionGroups[kindKey] || []).some((o) => o.toLowerCase() === String(opt).toLowerCase());

  const groupedSections = groupingEnabled
    ? itemKinds
        .map((kind) => ({
          ...kind,
          items: formData.options.filter(
            (opt) => !isAlwaysKeptOption(opt) && optionFitsKind(kind.key, questionKind, opt, optionGroups)
          ),
        }))
        .filter((section) => section.items.length > 0)
    : [];
  const sharedOptions = groupingEnabled
    ? formData.options.filter((opt) => isAlwaysKeptOption(opt) || isLinked(ALL_KINDS_KEY, opt))
    : [];
  const unlinkedOptions = groupingEnabled
    ? formData.options.filter(
        (opt) =>
          !sharedOptions.includes(opt) &&
          !groupedSections.some((section) => section.items.includes(opt))
      )
    : [];

  // Create or update against the API, then refresh the list from the
  // server so pagination/filters stay accurate.
  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.text.trim()) return;
    if (formData.categories.length === 0) {
      showToast('Pick at least one category for this question.');
      return;
    }
    if (
      !(await confirmAction({
        message: editingQuestion
          ? 'Save the changes to this question?'
          : 'Add this question to the Question Bank?',
        confirmLabel: editingQuestion ? 'Save Changes' : 'Add Question',
      }))
    ) {
      return;
    }

    const cleanOptions = formData.options.map((o) => o.trim()).filter(Boolean);
    const optionSet = new Set(cleanOptions.map((o) => o.toLowerCase()));
    const cleanGroups = {};
    Object.entries(formData.option_groups || {}).forEach(([key, list]) => {
      const kept = (list || []).map((o) => o.trim()).filter((o) => o && optionSet.has(o.toLowerCase()));
      if (kept.length) cleanGroups[key] = kept;
    });

    const payload = {
      text: formData.text.trim(),
      categories: formData.is_default
        ? [...ITEM_CATEGORIES]
        : ITEM_CATEGORIES.filter((c) => formData.categories.includes(c)),
      is_default: !!formData.is_default,
      options: cleanOptions,
      option_groups: cleanGroups,
    };

    setIsSaving(true);
    try {
      if (editingQuestion) {
        await api(`/questions/${editingQuestion.id}/`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await api('/questions/', { method: 'POST', body: JSON.stringify(payload) });
      }
      setIsModalOpen(false);
      await fetchQuestions();
    } catch (e) {
      console.error('Failed to save question:', e);
      showToast('Could not save this question. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingId) return;
    try {
      await api(`/questions/${deletingId}/`, { method: 'DELETE' });
      setDeletingId(null);
      await fetchQuestions();
    } catch (e) {
      console.error('Failed to delete question:', e);
      showToast('Could not delete this question. Please try again.');
    }
  };

  // Default group first, then newest.
  const filteredQuestions = [...questions]
    .sort((a, b) => Number(!!b.is_default) - Number(!!a.is_default))
    .filter((q) => {
    const matchesSearch = q.text.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      categoryFilter === 'All' ||
      (categoryFilter === 'Default' ? !!q.is_default : categoriesOf(q).includes(categoryFilter));
    return matchesSearch && matchesCategory;
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [search, categoryFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredQuestions.length / QUESTIONS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedQuestions = filteredQuestions.slice(
    (safePage - 1) * QUESTIONS_PER_PAGE,
    safePage * QUESTIONS_PER_PAGE
  );

  return (
    <div className="min-h-screen w-full bg-slate-50 p-6 lg:p-10">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#0B648D] flex items-center gap-2">
            <HelpCircle size={26} /> Verification Question Bank Management
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Manage preset verification questions available for moderators and admins when recording surrendered items.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#0B648D] to-[#155F87] px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:shadow-lg active:scale-[0.98]"
        >
          <Plus size={18} /> Add New Question
        </button>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="relative sm:col-span-2">
          <Search size={18} className="absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search preset questions..."
            className="h-11 w-full rounded-xl border border-slate-300 pl-10 pr-4 text-sm text-slate-700 outline-none focus:border-[#1478a7]"
          />
        </div>

        <div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-700 outline-none focus:border-[#1478a7]"
          >
            {['All', 'Default', ...ITEM_CATEGORIES].map((cat) => (
              <option key={cat} value={cat}>
                {cat === 'Default' ? 'Default questions (all categories)' : `Category: ${cat}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center">
          <Loader2 size={32} className="mx-auto mb-3 animate-spin text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">Loading questions…</p>
        </div>
      ) : loadError ? (
        <div className="rounded-2xl border border-dashed border-rose-300 bg-rose-50 p-12 text-center">
          <AlertCircle size={32} className="mx-auto mb-3 text-rose-400" />
          <p className="text-sm font-semibold text-rose-600">{loadError}</p>
          <button
            onClick={fetchQuestions}
            className="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50"
          >
            Retry
          </button>
        </div>
      ) : filteredQuestions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 p-12 text-center">
          <HelpCircle size={40} className="mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">No verification questions found.</p>
          <p className="text-xs text-slate-400 mt-1">Try adjusting your search filter or add a new question.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gradient-to-r from-[#0B648D] to-[#155F87] text-white">
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide">Category</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide">Question</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide">Predefined Choices</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedQuestions.map((q) => (
                  <tr key={q.id} className="transition hover:bg-amber-50/40">
                    <td className="px-4 py-3.5 align-top">
                      {q.is_default ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-[#0B648D] px-2.5 py-0.5 text-xs font-bold uppercase text-white whitespace-nowrap">
                          <Sparkles size={11} /> Default · All
                        </span>
                      ) : categoriesOf(q).length === ITEM_CATEGORIES.length ? (
                        <span className="inline-block rounded-md bg-amber-100 px-2.5 py-0.5 text-xs font-bold uppercase text-amber-800 whitespace-nowrap">
                          All categories
                        </span>
                      ) : (
                        <div className="flex max-w-[220px] flex-wrap gap-1">
                          {categoriesOf(q).map((cat) => (
                            <span
                              key={cat}
                              className="inline-block rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase text-amber-800 whitespace-nowrap"
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 align-top text-sm font-medium text-slate-800">{q.text}</td>
                    <td className="px-4 py-3.5 align-top">
                      {q.options && q.options.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Tag size={12} className="text-slate-400 shrink-0" />
                          {(expandedOptionRows.has(q.id) ? q.options : q.options.slice(0, OPTIONS_PREVIEW_LIMIT)).map(
                            (opt, i) => (
                              <span
                                key={i}
                                className="rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                              >
                                {opt}
                              </span>
                            )
                          )}
                          {q.options.length > OPTIONS_PREVIEW_LIMIT && (
                            <button
                              type="button"
                              onClick={() => toggleOptionsExpanded(q.id)}
                              className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] font-bold text-[#0B648D] hover:bg-blue-50"
                            >
                              {expandedOptionRows.has(q.id) ? 'Show less' : `+${q.options.length - OPTIONS_PREVIEW_LIMIT} more`}
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs italic text-slate-400">Free-text</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 align-top">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEdit(q)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-[#0B648D] hover:bg-blue-50 hover:text-[#0B648D]"
                          title="Edit Question"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => setDeletingId(q.id)}
                          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600"
                          title="Delete Question"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={safePage}
            totalItems={filteredQuestions.length}
            pageSize={QUESTIONS_PER_PAGE}
            onPageChange={setCurrentPage}
          />
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between bg-gradient-to-r from-[#0B648D] to-[#155F87] px-6 py-4 text-white shrink-0">
              <h3 className="font-bold">{editingQuestion ? 'Edit Preset Question' : 'Add New Preset Question'}</h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label
                  className={`mb-3 flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition ${
                    formData.is_default ? 'border-[#0B648D] bg-blue-50' : 'border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={!!formData.is_default}
                    onChange={(e) => {
                      const on = e.target.checked;
                      setFormData({
                        ...formData,
                        is_default: on,
                        categories: on ? [...ITEM_CATEGORIES] : formData.categories,
                      });
                      setLinkTarget(ALL_KINDS_KEY);
                    }}
                    className="mt-0.5 h-4 w-4 accent-[#0B648D]"
                  />
                  <span>
                    <span className="block text-sm font-bold text-[#0B648D]">Default question</span>
                    <span className="block text-xs text-slate-500">
                      Shared by every category, like color, size or design/features. Default questions
                      are listed first in the Question Bank.
                    </span>
                  </span>
                </label>

                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase text-slate-700">Categories *</label>
                  {!formData.is_default && (
                  <button
                    type="button"
                    onClick={() => {
                      const allChecked = formData.categories.length === ITEM_CATEGORIES.length;
                      setFormData({ ...formData, categories: allChecked ? [] : [...ITEM_CATEGORIES] });
                      setLinkTarget(ALL_KINDS_KEY);
                    }}
                    className="text-[11px] font-bold text-[#0B648D] hover:underline"
                  >
                    {formData.categories.length === ITEM_CATEGORIES.length ? 'Clear all' : 'Select all'}
                  </button>
                  )}
                </div>
                <p className="mb-2 text-xs text-slate-400">
                  Check every category this question applies to — e.g. one "What color of the item?"
                  for all categories instead of adding it again for each one.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {ITEM_CATEGORIES.map((cat) => {
                    const checked = formData.is_default || formData.categories.includes(cat);
                    return (
                      <label
                        key={cat}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                          formData.is_default ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                        } ${
                          checked
                            ? 'border-[#0B648D] bg-blue-50 text-[#0B648D]'
                            : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!!formData.is_default}
                          onChange={() => {
                            setFormData({
                              ...formData,
                              categories: checked
                                ? formData.categories.filter((c) => c !== cat)
                                : [...formData.categories, cat],
                            });
                            setLinkTarget(ALL_KINDS_KEY);
                          }}
                          className="h-4 w-4 accent-[#0B648D]"
                        />
                        {cat}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase text-slate-700">Question Text *</label>
                <textarea
                  required
                  rows={3}
                  value={formData.text}
                  onChange={(e) => setFormData({ ...formData, text: e.target.value })}
                  placeholder="e.g. What brand is it?"
                  className="w-full resize-none rounded-xl border border-slate-300 p-3.5 text-sm text-slate-700 outline-none focus:border-[#1478a7]"
                  maxLength={150}
                />
                <p className="mt-1 text-right text-xs text-slate-400">{formData.text.length}/150 characters</p>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase text-slate-700">
                  Predefined Answer Choices (optional)
                </label>
                <p className="mb-2 text-xs text-slate-400">
                  Add specific choices claimants/moderators can pick from instead of typing a free-text
                  answer — e.g. for "What brand?" under Clothing: Nike, Penshoppe, Adidas. Leave empty to
                  keep this a free-text question.
                </p>

                {Object.entries(GENERAL_OPTION_LISTS).map(([label, list]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => handleLoadGeneralList(label)}
                      className="mb-2 mr-2 flex items-center gap-1.5 rounded-lg border border-dashed border-[#0B648D]/40 bg-blue-50/60 px-3 py-1.5 text-xs font-bold text-[#0B648D] transition hover:bg-blue-50"
                    >
                      <Sparkles size={13} />
                      Load standard {label} list
                      <span className="font-normal text-[#0B648D]/60">({list.length})</span>
                    </button>
                  ))}

                {formData.categories.filter((cat) => CATEGORY_BRANDS[cat]).map((cat) => (
                  <button
                    key={`brand-${cat}`}
                    type="button"
                    onClick={() => handleLoadCategoryList(cat)}
                    className="mb-2 flex items-center gap-1.5 rounded-lg border border-dashed border-[#0B648D]/40 bg-blue-50/60 px-3 py-1.5 text-xs font-bold text-[#0B648D] transition hover:bg-blue-50"
                  >
                    <Sparkles size={13} />
                    Load standard {cat === 'ID' ? 'issuer' : 'brand'} list for {cat}
                    <span className="font-normal text-[#0B648D]/60">({CATEGORY_BRANDS[cat].length})</span>
                  </button>
                ))}

                {formData.categories.filter((cat) => CATEGORY_SIZES[cat]).map((cat) => (
                  <button
                    key={`size-${cat}`}
                    type="button"
                    onClick={() => handleLoadCategorySizeList(cat)}
                    className="mb-3 flex items-center gap-1.5 rounded-lg border border-dashed border-amber-400/50 bg-amber-50/60 px-3 py-1.5 text-xs font-bold text-amber-700 transition hover:bg-amber-50"
                  >
                    <Sparkles size={13} />
                    Load standard size list for {cat}
                    <span className="font-normal text-amber-700/60">({CATEGORY_SIZES[cat].length})</span>
                  </button>
                ))}

                {groupingEnabled && (
                  <div className="mb-2">
                    <label className="mb-1 block text-[11px] font-bold uppercase text-slate-500">
                      New choice is for
                    </label>
                    <select
                      value={linkTarget}
                      onChange={(e) => setLinkTarget(e.target.value)}
                      className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-700 outline-none focus:border-[#1478a7]"
                    >
                      <option value={ALL_KINDS_KEY}>All item types</option>
                      {itemKinds.map((kind) => (
                        <option key={kind.key} value={kind.key}>
                          {kind.label}
                          {formData.categories.length > 1
                            ? ` (${kind.categories.join(', ')})`
                            : ''}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-slate-400">
                      The choice will only appear for that kind of item (e.g. a phone brand only for
                      Mobile Phones). Typing a choice that's already listed just adds the link.
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={optionDraft}
                    onChange={(e) => setOptionDraft(e.target.value)}
                    onKeyDown={handleOptionKeyDown}
                    placeholder="Type a choice and press Enter (or comma-separate several)"
                    className="h-10 flex-1 rounded-xl border border-slate-300 px-3.5 text-sm text-slate-700 outline-none focus:border-[#1478a7]"
                  />
                  <button
                    type="button"
                    onClick={handleAddOption}
                    className="shrink-0 rounded-xl bg-slate-800 px-4 text-sm font-bold text-white transition hover:bg-slate-700"
                  >
                    Add
                  </button>
                </div>

                {formData.options.length > 0 && !groupingEnabled && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {formData.options.map((opt) => (
                      <OptionChip key={opt} label={opt} onRemove={() => handleRemoveOption(opt)} />
                    ))}
                  </div>
                )}

                {/* Grouped by item type, with a divider per group. A choice
                    can sit in several groups (e.g. Apple for phones,
                    tablets and laptops). × removes the choice everywhere;
                    the small link icon removes only an admin-made link. */}
                {formData.options.length > 0 && groupingEnabled && (
                  <div className="mt-4 space-y-4">
                    {groupedSections.map((section) => (
                      <OptionSection key={section.key} title={section.label} count={section.items.length}>
                        {section.items.map((opt) => (
                          <OptionChip
                            key={opt}
                            label={opt}
                            linked={isLinked(section.key, opt)}
                            onUnlink={() => handleUnlinkOption(section.key, opt)}
                            onRemove={() => handleRemoveOption(opt)}
                          />
                        ))}
                      </OptionSection>
                    ))}

                    {sharedOptions.length > 0 && (
                      <OptionSection title="All item types" count={sharedOptions.length} tone="slate">
                        {sharedOptions.map((opt) => (
                          <OptionChip
                            key={opt}
                            label={opt}
                            linked={isLinked(ALL_KINDS_KEY, opt)}
                            onUnlink={() => handleUnlinkOption(ALL_KINDS_KEY, opt)}
                            onRemove={() => handleRemoveOption(opt)}
                          />
                        ))}
                      </OptionSection>
                    )}

                    {unlinkedOptions.length > 0 && (
                      <OptionSection
                        title="Not linked to an item type"
                        count={unlinkedOptions.length}
                        tone="amber"
                        hint="These only show for items whose name doesn't match a specific type. Type one above with an item type selected to link it."
                      >
                        {unlinkedOptions.map((opt) => (
                          <OptionChip key={opt} label={opt} onRemove={() => handleRemoveOption(opt)} />
                        ))}
                      </OptionSection>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 rounded-xl bg-gradient-to-r from-[#0B648D] to-[#155F87] py-3 text-sm font-bold uppercase tracking-wide text-white shadow-md transition hover:shadow-lg active:scale-[0.98] disabled:opacity-60"
                >
                  {isSaving ? 'Saving…' : editingQuestion ? 'Save Changes' : 'Add Question'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="h-11 rounded-xl bg-slate-200 px-6 text-sm font-bold uppercase text-slate-600 hover:bg-slate-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingId && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[28px] bg-white px-8 py-8 text-center shadow-2xl">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-rose-100 text-rose-600">
              <AlertCircle size={30} strokeWidth={2.5} />
            </div>
            <h5 className="mb-2 text-lg font-black text-[#144B70]">Delete Question?</h5>
            <p className="mb-6 text-sm font-medium text-[#5F6F8C]">
              Are you sure you want to remove this preset question from the global bank?
            </p>
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="h-12 w-full rounded-xl bg-rose-600 text-sm font-black uppercase tracking-wide text-white shadow-md transition hover:bg-rose-700 active:scale-[0.98]"
              >
                Delete Question
              </button>
              <button
                type="button"
                onClick={() => setDeletingId(null)}
                className="h-12 w-full rounded-xl border border-slate-300 bg-white text-sm font-black uppercase tracking-wide text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}