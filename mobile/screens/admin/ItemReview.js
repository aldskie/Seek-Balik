import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  Archive,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  HelpCircle,
  Mail,
  MapPin,
  Phone,
  Tag,
  User,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react-native';

// FIX: getItemById wasn't imported before — the `item` this screen opens
// with comes straight from ItemsScreen's list, which (like the web admin's
// FoundItems.jsx list) is a lighter payload that never carried id_number or
// the verification_question_*/verification_answer_* fields. Those are
// fetched separately below, the same way FoundItems.jsx's own review modal
// re-fetches the full record before showing them.
// ASSUMPTION: getItemById is exported from this api module the same way it
// is on the web admin side — if it isn't yet, add it there (or swap this
// import for whatever the equivalent single-item fetch is called here).
import { API_URL, editLostItem, getItemById, getClaims, getCurrentUser } from '../../api/api';

// ASSUMPTION: same relative layout as the other shared components this
// screen already imports from (e.g. '../../api/api'). Adjust the path if
// ConfirmationModal actually lives somewhere else in this project.
import { useConfirmationModal } from '../../components/ConfirmationModal';
import { useAppearance } from '../../hooks/Appearance';

const STATUS_COLORS = {
  Pending: 'bg-orange-100 text-orange-700',
  Approved: 'bg-green-100 text-green-700',
  Claimed: 'bg-purple-100 text-purple-700',
  Declined: 'bg-red-100 text-red-700',
  Archived: 'bg-slate-200 text-slate-600',
};

// Same photo limit as ItemEdit — the photo row always shows this many
// square slots so the tiles are the same size on both screens.
const MAX_IMAGES = 3;

// How much larger than the screen a photo is drawn when zoomed in inside
// the full-screen viewer.
const ZOOM_SCALE = 2.5;

// Small delay helper — keeps the loading overlay on screen long enough to be
// seen (and lets the confirmation modal finish closing) even on a fast
// connection.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Claimant info (Mark as Claimed) ────────────────────────────────────────
// Mirrors the web admin's ClaimantInfoModal in FoundItems.jsx. Every field is
// optional — a field is only validated when something was typed into it.
const SCHOOL_DOMAIN = '@slc-sflu.edu.ph';
const NAME_REGEX = /^[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F .'-]*$/;
const EMAIL_USER_REGEX = /^[A-Za-z0-9._%+-]+$/;
const EMPTY_CLAIMANT = { firstName: '', lastName: '', contact: '', emailUser: '' };

const validateClaimant = ({ firstName, lastName, contact, emailUser }) => {
  const errors = {};

  if (firstName.trim() && !NAME_REGEX.test(firstName.trim())) {
    errors.firstName = 'Use letters, spaces, hyphens or apostrophes only.';
  }
  if (lastName.trim() && !NAME_REGEX.test(lastName.trim())) {
    errors.lastName = 'Use letters, spaces, hyphens or apostrophes only.';
  }
  if (contact && contact.length !== 10) {
    errors.contact = `Enter all 10 digits after +63 (${contact.length}/10).`;
  }
  if (emailUser && !EMAIL_USER_REGEX.test(emailUser)) {
    errors.emailUser = 'Enter a valid username (letters, numbers, . _ % + - only).';
  }

  return errors;
};

// ─── Logged-in moderator ────────────────────────────────────────────────────
// Name of the moderator/staff member currently logged in — recorded as
// `released_by` on an item when they mark it as Claimed, and shown as
// "Released By" for claimed surrendered items (mirrors getModeratorName() in
// the web admin's FoundItems.jsx).
//
// The logged-in user comes from the API (GET account/current/ via
// getCurrentUser(), authenticated with the JWT kept in SecureStore), so it
// always reflects whoever is logged in right now. If the request fails the
// name comes back empty and the item is still marked as claimed.
const loadModeratorName = async () => {
  try {
    const response = await getCurrentUser();
    const user = response?.user ?? response?.data ?? response;
    if (!user) return '';

    const full = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    return full || user.name || user.username || user.email || '';
  } catch (error) {
    console.error('Could not load the logged-in user for released_by:', error);
    return '';
  }
};

const getImageUrl = (image) => {
  const value = typeof image === 'string' ? image : image?.image;

  if (!value) return null;
  if (value.startsWith('http')) return value;

  return `${API_URL.replace(/\/$/, '')}${value}`;
};

const formatTimeLabel = (value) => {
  if (!value || typeof value !== 'string') return null;

  const trimmed = value.trim();

  const twelveHourMatch = trimmed.match(/^(\d{1,2}):([0-5]\d)\s*([AaPp][Mm])$/);
  if (twelveHourMatch) {
    const [, hour, minute, meridiem] = twelveHourMatch;
    return `${Number(hour)}:${minute} ${meridiem.toUpperCase()}`;
  }

  const twentyFourHourMatch = trimmed.match(/^([01]\d|2[0-3]):([0-5]\d)/);
  if (!twentyFourHourMatch) return trimmed;

  const [, hour24, minute] = twentyFourHourMatch;
  const period = Number(hour24) >= 12 ? 'PM' : 'AM';
  const hour12 = Number(hour24) % 12 || 12;

  return `${hour12}:${minute} ${period}`;
};

// When the item was lost or found. The backend stores a range:
// start_date / start_time ("From") and the optional end_date / end_time
// ("To"); the older created_* names are still read as a fallback.
// The date and the time are returned as two separate labels so each can be
// shown on its own line.
//   date: "2026-10-03"           or "2026-10-03 to 2026-10-05"
//   time: "2:30 PM"              or "2:30 PM to 4:00 PM"
const getDateRangeLabel = (item) => {
  const dateFrom = String(item.start_date || item.created_date || item.created_at || '').slice(0, 10);
  const dateTo = String(item.end_date || item.created_date_to || '').slice(0, 10);

  if (dateFrom && dateTo && dateTo !== dateFrom) return `${dateFrom} to ${dateTo}`;
  return dateFrom || dateTo || null;
};

const getTimeRangeLabel = (item) => {
  const timeFrom = formatTimeLabel(item.start_time ?? item.created_time);
  const timeTo = formatTimeLabel(item.end_time ?? item.created_time_to);

  if (timeFrom && timeTo && timeTo !== timeFrom) return `${timeFrom} to ${timeTo}`;
  return timeFrom || timeTo || null;
};

// Same casing the web admin uses for names (toTitleCase in FoundItems.jsx).
const toTitleCase = (text) => {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// item.claimed_time ("HH:MM", saved when the item was marked as Claimed) as
// a "2:30 PM" label. The claimed date is shown on its own row.
const getClaimedTimeLabel = (item) => formatTimeLabel(item.claimed_time);

function DetailRow({ icon: Icon, label, value, last = false }) {
  const { isDark } = useAppearance();

  return (
    <View className={`flex-row py-3 ${last ? '' : 'border-b border-slate-100 dark:border-slate-800'}`}>
      <View className="mr-3 h-9 w-9 items-center justify-center rounded-lg bg-[#EEF1F7] dark:bg-slate-800">
        <Icon size={17} color={isDark ? '#C7D2FE' : '#1B2061'} />
      </View>

      <View className="flex-1">
        <Text className="text-[10px] font-bold tracking-wide text-slate-400 dark:text-slate-500">
          {label}
        </Text>
        <Text className="mt-0.5 text-sm font-medium text-[#16233F] dark:text-slate-100">
          {value || 'Not specified'}
        </Text>
      </View>
    </View>
  );
}

function ClaimantField({ label, error, children }) {
  return (
    <View className="mb-4">
      <Text className="mb-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">{label}</Text>
      {children}
      {!!error && (
        <Text className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-300">{error}</Text>
      )}
    </View>
  );
}

// Full-screen photo viewer opened by tapping a photo tile.
// - Tap the photo to zoom in; drag to move around it; tap again to zoom out.
// - The arrows (or the counter) step through the item's photos.
// Built from plain ScrollViews so it needs no extra libraries and behaves
// the same on Android and iOS.
function PhotoViewerModal({ images, index, onChangeIndex, onClose }) {
  const { width, height } = useWindowDimensions();
  const [zoomed, setZoomed] = useState(false);

  const visible = index !== null && index >= 0 && index < images.length;
  const uri = visible ? images[index] : null;
  const hasMany = images.length > 1;

  // Each photo starts un-zoomed.
  useEffect(() => {
    setZoomed(false);
  }, [index]);

  const goTo = (nextIndex) => {
    if (nextIndex < 0 || nextIndex >= images.length) return;
    onChangeIndex(nextIndex);
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black">
        {uri ? (
          zoomed ? (
            // Zoomed: the photo is drawn larger than the screen inside a
            // vertical + horizontal ScrollView pair, so it can be dragged
            // in any direction.
            <ScrollView
              className="flex-1"
              bounces={false}
              showsVerticalScrollIndicator={false}
              contentOffset={{ x: 0, y: (height * (ZOOM_SCALE - 1)) / 2 }}
            >
              <ScrollView
                horizontal
                bounces={false}
                showsHorizontalScrollIndicator={false}
                contentOffset={{ x: (width * (ZOOM_SCALE - 1)) / 2, y: 0 }}
              >
                <TouchableOpacity activeOpacity={1} onPress={() => setZoomed(false)}>
                  <Image
                    source={{ uri }}
                    resizeMode="contain"
                    style={{ width: width * ZOOM_SCALE, height: height * ZOOM_SCALE }}
                  />
                </TouchableOpacity>
              </ScrollView>
            </ScrollView>
          ) : (
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => setZoomed(true)}
              className="flex-1"
            >
              <Image
                source={{ uri }}
                resizeMode="contain"
                style={{ width, height }}
              />
            </TouchableOpacity>
          )
        ) : null}

        {/* Top bar: photo counter + close */}
        <SafeAreaView
          edges={['top']}
          className="absolute inset-x-0 top-0"
          pointerEvents="box-none"
        >
          <View className="flex-row items-center justify-between px-4 pt-2" pointerEvents="box-none">
            <View className="rounded-full bg-black/60 px-3 py-1.5">
              <Text className="text-xs font-bold text-white">
                {visible ? index + 1 : 0} / {images.length}
              </Text>
            </View>

            <TouchableOpacity
              onPress={onClose}
              className="h-10 w-10 items-center justify-center rounded-full bg-black/60"
            >
              <X size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {/* Bottom bar: previous / hint / next */}
        <SafeAreaView
          edges={['bottom']}
          className="absolute inset-x-0 bottom-0"
          pointerEvents="box-none"
        >
          <View className="flex-row items-center justify-between px-4 pb-3" pointerEvents="box-none">
            {hasMany ? (
              <TouchableOpacity
                disabled={index === 0}
                onPress={() => goTo(index - 1)}
                className={`h-11 w-11 items-center justify-center rounded-full bg-black/60 ${
                  index === 0 ? 'opacity-30' : ''
                }`}
              >
                <ChevronLeft size={22} color="#FFFFFF" />
              </TouchableOpacity>
            ) : (
              <View className="h-11 w-11" />
            )}

            <View className="rounded-full bg-black/60 px-3 py-1.5">
              <Text className="text-[11px] font-semibold text-white">
                {zoomed ? 'Drag to move · Tap to zoom out' : 'Tap photo to zoom in'}
              </Text>
            </View>

            {hasMany ? (
              <TouchableOpacity
                disabled={index === images.length - 1}
                onPress={() => goTo(index + 1)}
                className={`h-11 w-11 items-center justify-center rounded-full bg-black/60 ${
                  index === images.length - 1 ? 'opacity-30' : ''
                }`}
              >
                <ChevronRight size={22} color="#FFFFFF" />
              </TouchableOpacity>
            ) : (
              <View className="h-11 w-11" />
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

// Bottom-sheet modal shown when "Mark as Claimed" is pressed on a
// Surrendered item. Validation errors show under each field; save errors
// show in a banner above the buttons so what was typed is never lost.
function ClaimantModal({
  visible,
  form,
  errors,
  submitError,
  saving,
  onChange,
  onConfirm,
  onCancel,
}) {
  const { isDark } = useAppearance();

  const inputBase = (hasError) =>
    `rounded-xl border bg-slate-50 dark:bg-slate-800 px-3 text-sm text-[#16233F] dark:text-slate-100 ${
      hasError ? 'border-rose-400 dark:border-rose-500' : 'border-slate-300 dark:border-slate-700'
    }`;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-end bg-black/40 dark:bg-black/60"
      >
        <View className="max-h-[90%] rounded-t-3xl bg-white dark:bg-slate-900 px-5 pb-6 pt-4">
          <View className="items-center">
            <View className="h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700" />
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View className="mb-5 mt-5">
              <Text className="text-lg font-bold text-[#16233F] dark:text-slate-100">Mark Item as Claimed</Text>
              <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Enter who is claiming this item. All fields are optional.
              </Text>
            </View>

            <ClaimantField label="CLAIMANT FIRST NAME" error={errors.firstName}>
              <TextInput
                value={form.firstName}
                onChangeText={(v) => onChange('firstName', v)}
                placeholder="Optional"
                placeholderTextColor={isDark ? '#64748B' : '#9AA3B5'}
                maxLength={50}
                editable={!saving}
                autoCapitalize="words"
                className={`h-12 ${inputBase(errors.firstName)}`}
              />
            </ClaimantField>

            <ClaimantField label="CLAIMANT LAST NAME" error={errors.lastName}>
              <TextInput
                value={form.lastName}
                onChangeText={(v) => onChange('lastName', v)}
                placeholder="Optional"
                placeholderTextColor={isDark ? '#64748B' : '#9AA3B5'}
                maxLength={50}
                editable={!saving}
                autoCapitalize="words"
                className={`h-12 ${inputBase(errors.lastName)}`}
              />
            </ClaimantField>

            <ClaimantField label="CONTACT NUMBER" error={errors.contact}>
              <View
                className={`h-12 flex-row items-center overflow-hidden rounded-xl border bg-slate-50 dark:bg-slate-800 ${
                  errors.contact ? 'border-rose-400 dark:border-rose-500' : 'border-slate-300 dark:border-slate-700'
                }`}
              >
                <View className="h-full justify-center border-r border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-700 px-3">
                  <Text className="text-sm font-bold text-slate-600 dark:text-slate-300">+63</Text>
                </View>
                <TextInput
                  value={form.contact}
                  onChangeText={(v) => onChange('contact', v)}
                  placeholder="9123456789"
                  placeholderTextColor={isDark ? '#64748B' : '#9AA3B5'}
                  keyboardType="number-pad"
                  maxLength={10}
                  editable={!saving}
                  className="h-full flex-1 px-3 text-sm text-[#16233F] dark:text-slate-100"
                />
              </View>
            </ClaimantField>

            <ClaimantField label="GSUITE EMAIL" error={errors.emailUser}>
              <View
                className={`h-12 flex-row items-center overflow-hidden rounded-xl border bg-slate-50 dark:bg-slate-800 ${
                  errors.emailUser ? 'border-rose-400 dark:border-rose-500' : 'border-slate-300 dark:border-slate-700'
                }`}
              >
                <TextInput
                  value={form.emailUser}
                  onChangeText={(v) => onChange('emailUser', v)}
                  placeholder="Optional"
                  placeholderTextColor={isDark ? '#64748B' : '#9AA3B5'}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  editable={!saving}
                  className="h-full flex-1 px-3 text-sm text-[#16233F] dark:text-slate-100"
                />
                <View className="h-full justify-center border-l border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-700 px-3">
                  <Text className="text-xs font-bold text-slate-600 dark:text-slate-300">{SCHOOL_DOMAIN}</Text>
                </View>
              </View>
            </ClaimantField>

            {!!submitError && (
              <View className="mb-4 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950 p-3">
                <Text className="text-xs font-semibold text-rose-700 dark:text-rose-300">{submitError}</Text>
              </View>
            )}

            <View className="mt-2 flex-row gap-3">
              <TouchableOpacity
                activeOpacity={0.6}
                disabled={saving}
                onPress={onCancel}
                className="flex-1 items-center rounded-xl bg-slate-100 dark:bg-slate-800 py-3.5"
              >
                <Text className="text-xs font-bold text-slate-600 dark:text-slate-300">CANCEL</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.6}
                disabled={saving}
                onPress={onConfirm}
                className="flex-[1.35] flex-row items-center justify-center rounded-xl bg-[#1B2061] dark:bg-indigo-600 py-3.5"
              >
                <CheckCircle2 size={16} color="#FFFFFF" />
                <Text className="ml-2 text-xs font-bold text-white">CONFIRM CLAIMED</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>

        {/* Inline loading overlay follows LoginScreen's in-tree pattern. */}
        {saving && (
          <View
            className="absolute inset-0 items-center justify-center bg-[#1b2061]/45 dark:bg-black/60"
            pointerEvents="auto"
          >
            <View className="w-[82%] items-center rounded-2xl bg-white dark:bg-slate-800 px-6 py-7 shadow-lg">
              <ActivityIndicator size="large" color={isDark ? '#C7D2FE' : '#1b2061'} />
              <Text className="mt-4 text-center text-base font-bold text-[#1b2061] dark:text-indigo-200">
                Marking as claimed...
              </Text>
              <Text className="mt-1 text-center text-sm text-[#666] dark:text-slate-400">
                Please wait while we save the claimant details.
              </Text>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function ItemReview() {
  const navigation = useNavigation();
  const { params } = useRoute();
  const { isDark } = useAppearance();

  const [item, setItem] = useState(params?.item);
  const [saving, setSaving] = useState(false);
  const [savingMessage, setSavingMessage] = useState('Saving...');
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineRemarks, setDeclineRemarks] = useState('');

  // Index of the photo open in the full-screen viewer; null = viewer closed.
  const [viewerIndex, setViewerIndex] = useState(null);

  // Claimant modal state (Mark as Claimed on Surrendered items).
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [claimForm, setClaimForm] = useState(EMPTY_CLAIMANT);
  const [claimErrors, setClaimErrors] = useState({});
  const [claimSubmitError, setClaimSubmitError] = useState('');

  // Shared confirmation/feedback modal — replaces the old Alert.alert calls
  // for both "are you sure?" confirmations and post-save success/error
  // messages, so they match the app's own styling instead of the native
  // OS dialog.
  const { confirmationModal, showFeedback, showConfirm } = useConfirmationModal();

  // Which toggle combination this review was opened from (passed by ItemsScreen),
  // used below to decide which footer buttons to show.
  const activeFilter = params?.activeFilter;
  const statusFilter = params?.statusFilter;

  // Surrendered items collect an ID Number and ownership verification
  // questions — Lost reports never ask for either (mirrors
  // ReportLostItemScreen, which has no ID Number or verification-question
  // fields at all). This covers both Surrendered status tabs: "Surrendered"
  // (awaiting claim) and "Claimed" (already claimed) — both need the ID
  // number and verification Q&A shown.
  const isSurrenderedReview =
    activeFilter === 'surrendered' &&
    (statusFilter === 'Surrendered' || statusFilter === 'Claimed');

  // Once a surrendered item has been claimed, the review should also show
  // who claimed it — claimant name and contact come from the claim record,
  // not the item itself — and who released it (`released_by`, saved on the
  // item when the logged-in moderator marked it as claimed).
  const isClaimedSurrenderedReview =
    activeFilter === 'surrendered' && statusFilter === 'Claimed';

  // Only Surrendered -> Surrendered reviews ask for claimant info when the
  // item is marked as claimed (mirrors FoundItems.jsx's ClaimantInfoModal).
  const needsClaimantInfo =
    activeFilter === 'surrendered' && statusFilter === 'Surrendered';

  // The finder/reporter comes from `poster_name` on the item (ItemDetails
  // stores a single poster_name). Surrendered reviews already re-fetch the
  // full record; for any other review, re-fetch it only if the list payload
  // arrived without poster_name.
  const needsFullRecord = isSurrenderedReview || !params?.item?.poster_name;

  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState('');

  const [claimDetails, setClaimDetails] = useState(null);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimError, setClaimError] = useState('');

  const images = useMemo(() => {
    // An `images` array with photos in it wins; the legacy single `image`
    // field is only used when the item has no ItemImage rows.
    const itemImages =
      Array.isArray(item?.images) && item.images.length > 0
        ? item.images
        : item?.image
          ? [item.image]
          : [];

    return itemImages.map(getImageUrl).filter(Boolean);
  }, [item]);

  // Footer button set for this review screen:
  // - "default": Lost + Pending (and anything else not covered below) -> Decline / Approve
  // - "closeOnly": Lost + Declined, Lost + Claimed -> Close
  // - "closeClaim": Lost + Approved, or Surrendered + Surrendered -> Close / Mark as Claimed
  // - "closeArchive": Surrendered + Claimed -> Close / Archive
  // (Declared above the `if (!item) return null` guard so hooks always run
  // in the same order on every render.)
  const buttonMode = useMemo(() => {
    if (activeFilter === 'lost' && statusFilter === 'Approved') return 'closeClaim';
    if (activeFilter === 'lost' && statusFilter === 'Declined') return 'closeOnly';
    // Lost Items > Claimed: the report is already resolved, so it can only
    // be viewed (no Decline / Approve / Mark as Claimed).
    if (activeFilter === 'lost' && statusFilter === 'Claimed') return 'closeOnly';
    if (activeFilter === 'surrendered' && statusFilter === 'Surrendered') return 'closeClaim';
    if (activeFilter === 'surrendered' && statusFilter === 'Claimed') return 'closeArchive';
    return 'default';
  }, [activeFilter, statusFilter]);

  // Fetches the ID Number, verification question/answer fields and
  // `released_by` for this specific item once, when reviewing a Surrendered
  // item (either the "Surrendered" or "Claimed" status tab).
  useEffect(() => {
    if (!needsFullRecord || !item?.id) return;

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
          setItem((prev) => ({ ...prev, ...data }));
        }
      } catch (error) {
        if (!cancelled) {
          setDetailsError('Could not load the ID number and verification questions.');
        }
      } finally {
        if (!cancelled) setDetailsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsFullRecord, item?.id]);

  // Fetches the claim record tied to this item once it's been marked
  // Claimed, so the claimant's name and contact can be shown alongside the
  // ID number and verification questions. Items claimed through the claimant
  // modal below have no Claim record — their claimant info is saved on the
  // item itself (claimed_by_name / claimed_by_contact / claimed_by_email),
  // which the rows below read first.
  // ASSUMPTION: there's no single-claim-by-item endpoint here, so this
  // mirrors ItemsScreen's own "claimed" tab fetch and matches the claim
  // whose linked item is this one. If the API exposes a more direct way to
  // fetch a single claim by item id, swap this for that.
  useEffect(() => {
    if (!isClaimedSurrenderedReview || !item?.id) return;

    let cancelled = false;
    setClaimLoading(true);
    setClaimError('');

    (async () => {
      try {
        const claimData = await getClaims({});
        const claimsList = Array.isArray(claimData) ? claimData : [];

        const matchedClaim = claimsList.find((claim) => {
          const claimItemId =
            claim.item_id ?? claim.item ?? claim.item_details?.id ?? claim.itemId;
          return String(claimItemId) === String(item.id);
        });

        if (!cancelled) {
          if (matchedClaim) {
            setClaimDetails(matchedClaim);
          } else {
            setClaimError('Could not find the claim record for this item.');
          }
        }
      } catch (error) {
        if (!cancelled) {
          setClaimError('Could not load claimant details.');
        }
      } finally {
        if (!cancelled) setClaimLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isClaimedSurrenderedReview, item?.id]);

  if (!item) return null;

  // Whoever reported a Lost item / turned in a Surrendered item is stored on
  // the item as `poster_name` (same field FoundItems.jsx shows as "Found By").
  const reporter =
    toTitleCase(item.poster_name) ||
    toTitleCase(`${item.first_name || ''} ${item.last_name || ''}`.trim()) ||
    'Not specified';

  const statusClass = STATUS_COLORS[item.status] || STATUS_COLORS.Pending;
  // Date and time are shown on separate rows; each is a single value or a
  // "From to To" range.
  const dateRangeLabel = getDateRangeLabel(item);
  const timeRangeLabel = getTimeRangeLabel(item);
  const claimedTimeLabel = getClaimedTimeLabel(item);
  const lostOrFound = item.type === 'Surrendered' ? 'FOUND' : 'LOST';

  // The 4 verification question/answer pairs, filtered down to only the
  // slots that actually have a question saved — same rule FoundItems.jsx
  // uses when deciding whether to show the section at all.
  const verificationPairs = [1, 2, 3, 4]
    .map((n) => ({
      question: item[`verification_question_${n}`],
      answer: item[`verification_answer_${n}`],
    }))
    .filter((pair) => Boolean(pair.question));

  // Shared "confirm, then save the new status" flow for Approve / Mark as
  // Claimed (Lost items) / Archive.
  //
  // Flow: button -> confirm modal -> (confirm pressed) -> inline loading
  // overlay -> success/error modal.
  //
  // The loading overlay is a plain absolutely-positioned View rendered in
  // this screen's own tree (same approach as LoginScreen's `isSubmitting`
  // overlay) — NOT a second native Modal — so it can appear even while the
  // confirmation modal is still closing. It is removed BEFORE the result
  // modal is shown so the two never overlap.
  //
  // `getExtraFields` (optional) is an async function returning extra fields
  // to save together with the status. It runs after the user confirms,
  // right before the save.
  const updateStatus = (
    status,
    {
      confirmTitle,
      confirmMessage,
      confirmLabel,
      destructive = false,
      successMessage,
      loadingMessage = 'Saving...',
      getExtraFields,
    }
  ) => {
    const saveStatus = async () => {
      setSavingMessage(loadingMessage);
      setSaving(true);

      let failure = null;

      try {
        // Keep the full-screen loader visible long enough to read, even on
        // a fast connection. The confirmation dialog itself does not wait
        // on this promise, so its button stays static while saving.
        const [updatedItem] = await Promise.all([
          (async () => {
            const extraFields = getExtraFields ? await getExtraFields() : {};
            return editLostItem(item.id, { status, ...extraFields });
          })(),
          wait(600),
        ]);
        setItem((prev) => ({ ...prev, ...updatedItem }));
      } catch (error) {
        failure = error;
      } finally {
        // Remove the loader first, then show the result modal.
        setSaving(false);
      }

      if (failure) {
        showFeedback({
          title: 'Could not update item',
          message: failure.response?.data?.error || 'Please try again.',
          tone: 'error',
        });
      } else {
        showFeedback({
          title: 'Saved',
          message: successMessage,
          tone: 'success',
          onClose: () => navigation.goBack(),
        });
      }
    };

    showConfirm({
      title: confirmTitle,
      message: confirmMessage,
      confirmLabel,
      destructive,
      // Do not return the async save promise to the confirmation dialog.
      // This keeps its confirm button from switching into its own loading
      // state; the in-screen overlay below shows progress instead.
      onConfirm: () => {
        void saveStatus();
      },
    });
  };

  const handleApprove = () =>
    updateStatus('Approved', {
      confirmTitle: 'Approve item?',
      confirmMessage: 'This item will become visible as approved.',
      confirmLabel: 'Approve',
      successMessage: 'Item approved successfully.',
      loadingMessage: 'Approving item...',
    });

  const handleDecline = () => {
    setDeclineRemarks('');
    setShowDeclineModal(true);
  };

  const handleCancelDecline = () => {
    if (saving) return;
    setShowDeclineModal(false);
    setDeclineRemarks('');
  };

  const handleConfirmDecline = async () => {
    const trimmedRemarks = declineRemarks.trim();
    if (!trimmedRemarks || saving) return;

    setSavingMessage('Declining item...');
    setSaving(true);

    try {
      const updatedItem = await editLostItem(item.id, {
        status: 'Declined',
        declined_remarks: trimmedRemarks,
      });
      setItem((prev) => ({ ...prev, ...updatedItem }));

      // Hide the loader BEFORE closing the sheet and showing feedback so
      // the overlay and the feedback modal never appear together.
      setSaving(false);
      setShowDeclineModal(false);

      showFeedback({
        title: 'Saved',
        message: 'Item declined successfully.',
        tone: 'success',
        onClose: () => navigation.goBack(),
      });
    } catch (error) {
      showFeedback({
        title: 'Could not update item',
        message: error.response?.data?.error || 'Please try again.',
        tone: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  // ─── Claimant modal handlers ──────────────────────────────────────────────
  const handleChangeClaimField = (field, value) => {
    let next = value;

    if (field === 'contact') {
      // digits only, drop a leading 0 (09xx...), max 10 digits after +63
      next = value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 10);
    } else if (field === 'emailUser') {
      // if a full address is pasted, keep only the part before "@"
      next = value.split('@')[0].replace(/\s/g, '');
    }

    setClaimForm((prev) => ({ ...prev, [field]: next }));
    setClaimErrors((prev) => ({ ...prev, [field]: undefined }));
    setClaimSubmitError('');
  };

  const handleCancelClaim = () => {
    if (saving) return;
    setShowClaimModal(false);
    setClaimForm(EMPTY_CLAIMANT);
    setClaimErrors({});
    setClaimSubmitError('');
  };

  // Saves the item as Claimed together with WHO claimed it
  // (claimed_by_name / claimed_by_contact / claimed_by_email), WHEN
  // (claimed_date / claimed_time) and WHO released it (`released_by`, the
  // logged-in moderator) — the same fields the web admin's handleClaimItem()
  // saves.
  // ASSUMPTION: the backend's item model/serializer accepts and persists all
  // of these (they were added to ItemDetails for the web admin).
  const handleConfirmClaim = async () => {
    if (saving) return;

    const errors = validateClaimant(claimForm);
    if (Object.values(errors).some(Boolean)) {
      setClaimErrors(errors);
      return;
    }

    setSavingMessage('Marking as claimed...');
    setSaving(true);
    setClaimSubmitError('');

    try {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');

      const claimantName = [claimForm.firstName.trim(), claimForm.lastName.trim()]
        .filter(Boolean)
        .join(' ');

      const updatedItem = await editLostItem(item.id, {
        status: 'Claimed',
        released_by: await loadModeratorName(),
        claimed_by_name: claimantName,
        claimed_by_contact: claimForm.contact ? `+63${claimForm.contact}` : '',
        claimed_by_email: claimForm.emailUser ? `${claimForm.emailUser}${SCHOOL_DOMAIN}` : '',
        claimed_date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
        claimed_time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
      });

      setItem((prev) => ({ ...prev, ...updatedItem }));

      // Hide the loader and close this modal BEFORE showing the feedback
      // modal so two Modals never stack on top of each other.
      setSaving(false);
      setShowClaimModal(false);
      setClaimForm(EMPTY_CLAIMANT);

      showFeedback({
        title: 'Saved',
        message: 'Item marked as claimed successfully.',
        tone: 'success',
        onClose: () => navigation.goBack(),
      });
    } catch (error) {
      const data = error.response?.data;
      const message =
        (typeof data === 'string' && data) ||
        data?.error ||
        data?.detail ||
        (data && typeof data === 'object'
          ? Object.entries(data)
              .map(([field, errs]) => `${field}: ${Array.isArray(errs) ? errs.join(', ') : errs}`)
              .join('\n')
          : '') ||
        (error.message === 'Network Error'
          ? 'No connection. Check your internet and try again.'
          : 'Could not mark this item as claimed. Please try again.');

      // Stay on the modal and show the error inline so the input isn't lost.
      setClaimSubmitError(message);
    } finally {
      setSaving(false);
    }
  };

  // Surrendered items open the claimant modal; Lost items keep the
  // confirm -> loading -> success flow (status only).
  const handleMarkAsClaimed = () => {
    if (needsClaimantInfo) {
      setClaimForm(EMPTY_CLAIMANT);
      setClaimErrors({});
      setClaimSubmitError('');
      setShowClaimModal(true);
      return;
    }

    updateStatus('Claimed', {
      confirmTitle: 'Mark as claimed?',
      confirmMessage: 'This item will be marked as claimed.',
      confirmLabel: 'Mark as Claimed',
      successMessage: 'Item marked as claimed successfully.',
      loadingMessage: 'Marking as claimed...',
    });
  };

  const handleArchive = () =>
    updateStatus('Archived', {
      confirmTitle: 'Archive item?',
      confirmMessage: 'This item will be moved to archived records.',
      confirmLabel: 'Archive',
      destructive: true,
      successMessage: 'Item archived successfully.',
      loadingMessage: 'Archiving item...',
    });

  return (
    <View className="flex-1 bg-[#F7F8FC] dark:bg-slate-950">
      <StatusBar style="light" backgroundColor="#1B2061" />

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
                    Item Review
                </Text>
            </View>
            <View className={`rounded-full px-3 py-1 ${statusClass.split(' ')[0]}`}>
                <Text className={`text-[10px] font-bold ${statusClass.split(' ')[1]}`}>
                {(item.status || 'Pending').toUpperCase()}
                </Text>
          </View>
        </View>
    </SafeAreaView>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="rounded-2xl bg-white dark:bg-slate-900 p-4 shadow-sm">
          <Text className="text-xl font-bold text-[#16233F] dark:text-slate-100">
            {item.title || 'Untitled item'}
          </Text>

          <Text className="mt-1 text-xs font-semibold text-slate-400 dark:text-slate-500">
            {item.ticket_code}
          </Text>

          {images.length > 0 ? (
            <>
              <View className="mb-2 mt-5 flex-row items-center justify-between">
                <Text className="text-xs font-bold tracking-wide text-[#1B2061] dark:text-indigo-200">
                  PHOTOS
                </Text>

                <Text className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                  {Math.min(images.length, MAX_IMAGES)}/{MAX_IMAGES}
                </Text>
              </View>

              {/* Same three square slots as ItemEdit. Tapping a photo opens
                  it full screen for a closer look. */}
              <View className="flex-row gap-3">
                {Array.from({ length: MAX_IMAGES }, (_, slotIndex) => {
                  const uri = images[slotIndex];

                  if (!uri) {
                    return <View key={`empty-${slotIndex}`} className="aspect-square flex-1" />;
                  }

                  return (
                    <TouchableOpacity
                      key={`${uri}-${slotIndex}`}
                      activeOpacity={0.8}
                      onPress={() => setViewerIndex(slotIndex)}
                      className="relative aspect-square flex-1 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    >
                      <Image
                        source={{ uri }}
                        className="h-full w-full"
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
                Tap a photo to view it full screen
              </Text>
            </>
          ) : (
            <View className="mt-4 h-36 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
              <Text className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                No photos submitted
              </Text>
            </View>
          )}
        </View>

        <Text className="mb-2 mt-6 text-xs font-bold tracking-wide text-[#1B2061] dark:text-indigo-200">
          REPORT DETAILS
        </Text>

        <View className="rounded-2xl bg-white dark:bg-slate-900 px-4">
          {isSurrenderedReview && (
            <DetailRow
              icon={CreditCard}
              label="ID NUMBER"
              value={detailsLoading ? 'Loading…' : item.id_number || item.student_id}
            />
          )}
          <DetailRow
            icon={User}
            label={item.type === 'Surrendered' ? 'FOUND BY' : 'REPORTED BY'}
            value={detailsLoading && !item.poster_name ? 'Loading…' : reporter}
          />
          <DetailRow icon={Tag} label="CATEGORY" value={item.category} />
          <DetailRow
            icon={MapPin}
            label={item.type === 'Surrendered' ? 'AREA FOUND' : 'AREA LOST'}
            value={item.location}
          />
          <DetailRow
            icon={Calendar}
            label={`DATE ${lostOrFound}`}
            value={dateRangeLabel}
          />
          <DetailRow
            icon={Clock}
            label={`TIME ${lostOrFound}`}
            value={timeRangeLabel}
            last={!isClaimedSurrenderedReview}
          />
          {isClaimedSurrenderedReview && (
            <>
              <DetailRow
                icon={User}
                label="CLAIMED BY"
                value={
                  (claimLoading || detailsLoading) && !item.claimed_by_name
                    ? 'Loading…'
                    : toTitleCase(item.claimed_by_name) ||
                      toTitleCase(claimDetails?.claimant_name) ||
                      'Not recorded'
                }
              />
              <DetailRow
                icon={Phone}
                label="CLAIMANT CONTACT"
                value={
                  (claimLoading || detailsLoading) && !item.claimed_by_contact
                    ? 'Loading…'
                    : item.claimed_by_contact || claimDetails?.claimant_contact || 'Not recorded'
                }
              />
              <DetailRow
                icon={Mail}
                label="CLAIMANT EMAIL"
                value={
                  (claimLoading || detailsLoading) && !item.claimed_by_email
                    ? 'Loading…'
                    : item.claimed_by_email || claimDetails?.claimant_email || 'Not recorded'
                }
              />
              <DetailRow
                icon={Calendar}
                label="DATE CLAIMED"
                value={
                  detailsLoading && !item.claimed_date
                    ? 'Loading…'
                    : item.claimed_date || 'Not recorded'
                }
              />
              <DetailRow
                icon={Clock}
                label="TIME CLAIMED"
                value={
                  detailsLoading && !claimedTimeLabel
                    ? 'Loading…'
                    : claimedTimeLabel || 'Not recorded'
                }
              />
              <DetailRow
                icon={UserCheck}
                label="RELEASED BY"
                value={detailsLoading && !item.released_by ? 'Loading…' : toTitleCase(item.released_by) || 'Not recorded'}
                last
              />
            </>
          )}
        </View>

        {isClaimedSurrenderedReview && claimError && !item.claimed_by_name && (
          <Text className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-300">
            {claimError}
          </Text>
        )}

        <Text className="mb-2 mt-6 text-xs font-bold tracking-wide text-[#1B2061] dark:text-indigo-200">
          DESCRIPTION
        </Text>

        <View className="rounded-2xl bg-white dark:bg-slate-900 p-4">
          <Text className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            {item.description || 'No description provided.'}
          </Text>
        </View>

        {isSurrenderedReview && (
          <>
            <Text className="mb-2 mt-6 text-xs font-bold tracking-wide text-[#1B2061] dark:text-indigo-200">
              OWNERSHIP VERIFICATION QUESTIONS
            </Text>

            <View className="rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 p-4">
              {detailsLoading ? (
                <View className="flex-row items-center">
                  <ActivityIndicator size="small" color={isDark ? '#FCD34D' : '#B45309'} />
                  <Text className="ml-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                    Loading verification questions…
                  </Text>
                </View>
              ) : detailsError ? (
                <Text className="text-xs font-semibold text-rose-600 dark:text-rose-300">
                  {detailsError}
                </Text>
              ) : verificationPairs.length > 0 ? (
                <View>
                  {verificationPairs.map((pair, index) => (
                    <View
                      key={index}
                      className={index === 0 ? '' : 'mt-3 border-t border-amber-200 dark:border-amber-900 pt-3'}
                    >
                      <View className="flex-row items-start">
                        <HelpCircle size={15} color={isDark ? '#FCD34D' : '#B45309'} style={{ marginTop: 1 }} />
                        <Text className="ml-2 flex-1 text-sm font-semibold text-[#16233F] dark:text-slate-100">
                          {pair.question}
                        </Text>
                      </View>

                      <Text className="ml-[23px] mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                        Answer: {' '}
                        <Text className="font-bold">
                          {pair.answer || 'Not specified'}
                        </Text>
                      </Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                  No verification questions were set for this item.
                </Text>
              )}
            </View>
          </>
        )}
      </ScrollView>

      <SafeAreaView edges={['bottom']} className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-4 py-3">
        <View className="flex-row gap-3">
          {buttonMode === 'default' && (
            <>
              <TouchableOpacity
                disabled={saving}
                onPress={handleDecline}
                className="flex-1 flex-row items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 py-3.5"
              >
                <XCircle size={17} color={isDark ? '#94A3B8' : '#64748B'} />
                <Text className="ml-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                  DECLINE
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={saving}
                onPress={handleApprove}
                className="flex-[1.35] flex-row items-center justify-center rounded-xl bg-[#1B2061] dark:bg-indigo-600 py-3.5"
              >
                <CheckCircle2 size={17} color="#FFFFFF" />

                <Text className="ml-2 text-xs font-bold text-white">
                  APPROVE ITEM
                </Text>
              </TouchableOpacity>
            </>
          )}

          {buttonMode === 'closeOnly' && (
            // Slate, the same color as the Close button on the other tabs.
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              className="flex-1 flex-row items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 py-3.5"
            >
              <Text className="text-xs font-bold text-slate-600 dark:text-slate-300">
                CLOSE
              </Text>
            </TouchableOpacity>
          )}

          {buttonMode === 'closeClaim' && (
            <>
              <TouchableOpacity
                disabled={saving}
                onPress={() => navigation.goBack()}
                className="flex-1 flex-row items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 py-3.5"
              >
                <Text className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  CLOSE
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={saving}
                onPress={handleMarkAsClaimed}
                className="flex-[1.35] flex-row items-center justify-center rounded-xl bg-[#1B2061] dark:bg-indigo-600 py-3.5"
              >
                <CheckCircle2 size={17} color="#FFFFFF" />

                <Text className="ml-2 text-xs font-bold text-white">
                  MARK AS CLAIMED
                </Text>
              </TouchableOpacity>
            </>
          )}

          {buttonMode === 'closeArchive' && (
            <>
              <TouchableOpacity
                disabled={saving}
                onPress={() => navigation.goBack()}
                className="flex-1 flex-row items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 py-3.5"
              >
                <Text className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  CLOSE
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={saving}
                onPress={handleArchive}
                className="flex-[1.35] flex-row items-center justify-center rounded-xl bg-rose-600 py-3.5"
              >
                <Archive size={17} color="#FFFFFF" />

                <Text className="ml-2 text-xs font-bold text-white">
                  ARCHIVE
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </SafeAreaView>

      <Modal
        visible={showDeclineModal}
        transparent
        animationType="slide"
        onRequestClose={handleCancelDecline}
      >
        <View className="flex-1 justify-end bg-black/40 dark:bg-black/60">
          <View className="rounded-t-3xl bg-white dark:bg-slate-900 px-5 pb-6 pt-4">
            <View className="items-center">
              <View className="h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700" />
            </View>

            <View className="mt-5">
              <Text className="text-lg font-bold text-[#16233F] dark:text-slate-100">Decline Item</Text>
              <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Please provide a reason for declining this item.
              </Text>
            </View>

            <Text className="mb-1.5 mt-5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
              DECLINE REMARKS
            </Text>
            <TextInput
              value={declineRemarks}
              onChangeText={setDeclineRemarks}
              placeholder="e.g. Insufficient proof of ownership, duplicate report..."
              placeholderTextColor={isDark ? '#64748B' : '#9AA3B5'}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              editable={!saving}
              className="min-h-24 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-3 text-sm text-[#16233F] dark:text-slate-100"
            />

            <View className="mt-6 flex-row gap-3">
              <TouchableOpacity
                activeOpacity={0.6}
                disabled={saving}
                onPress={handleCancelDecline}
                className={`flex-1 items-center rounded-xl py-3.5 ${saving ? 'bg-slate-50 dark:bg-slate-800' : 'bg-slate-100 dark:bg-slate-800'}`}
              >
                <Text className={`text-xs font-bold ${saving ? 'text-slate-400 dark:text-slate-500' : 'text-slate-600 dark:text-slate-300'}`}>
                  CANCEL
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.6}
                disabled={saving || !declineRemarks.trim()}
                onPress={handleConfirmDecline}
                className={`flex-1 flex-row items-center justify-center rounded-xl py-3.5 ${
                  saving || !declineRemarks.trim() ? 'bg-rose-300 dark:bg-rose-900' : 'bg-rose-600'
                }`}
              >
                <XCircle size={16} color="#FFFFFF" />
                <Text className="ml-2 text-xs font-bold text-white">
                  CONFIRM DECLINE
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Inline loader uses the same in-tree pattern as LoginScreen. */}
          {saving && (
            <View
              className="absolute inset-0 items-center justify-center bg-[#1b2061]/45 dark:bg-black/60"
              pointerEvents="auto"
            >
              <View className="w-[82%] items-center rounded-2xl bg-white dark:bg-slate-800 px-6 py-7 shadow-lg">
                <ActivityIndicator size="large" color={isDark ? '#C7D2FE' : '#1b2061'} />
                <Text className="mt-4 text-center text-base font-bold text-[#1b2061] dark:text-indigo-200">
                  {savingMessage}
                </Text>
                <Text className="mt-1 text-center text-sm text-[#666] dark:text-slate-400">
                  Please wait while we update this item.
                </Text>
              </View>
            </View>
          )}
        </View>
      </Modal>

      <ClaimantModal
        visible={showClaimModal}
        form={claimForm}
        errors={claimErrors}
        submitError={claimSubmitError}
        saving={saving}
        onChange={handleChangeClaimField}
        onConfirm={handleConfirmClaim}
        onCancel={handleCancelClaim}
      />

      {/* Full-screen photo viewer (tap a photo tile to open). */}
      <PhotoViewerModal
        images={images}
        index={viewerIndex}
        onChangeIndex={setViewerIndex}
        onClose={() => setViewerIndex(null)}
      />

      {/* Main-screen loader for Approve, Archive and Lost -> Claimed.
          Plain View overlay (same as LoginScreen's isSubmitting overlay),
          not a Modal, so it shows right after the confirm modal closes.
          Hidden while the Decline / Claimant sheets are open because they
          render their own overlays. */}
      {saving && !showClaimModal && !showDeclineModal && (
        <View
          className="absolute inset-0 items-center justify-center bg-[#1b2061]/45 dark:bg-black/60"
          pointerEvents="auto"
        >
          <View className="w-[78%] items-center rounded-2xl bg-white dark:bg-slate-800 px-6 py-7 shadow-lg">
            <ActivityIndicator size="large" color={isDark ? '#C7D2FE' : '#1b2061'} />
            <Text className="mt-4 text-center text-base font-bold text-[#1b2061] dark:text-indigo-200">
              {savingMessage}
            </Text>
            <Text className="mt-1 text-center text-sm text-[#666] dark:text-slate-400">
              Please wait while we update this item.
            </Text>
          </View>
        </View>
      )}

      {confirmationModal}
    </View>
  );
}