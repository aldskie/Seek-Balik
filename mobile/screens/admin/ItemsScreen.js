import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { cssInterop } from 'nativewind';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Eye,
  MapPin,
  Search,
  Ticket,
  User,
  ChevronLeft,
  ChevronRight,
  Handshake,
  Flag,
  Pencil,
  Archive,
} from 'lucide-react-native';

import { getItems, getClaims, archiveItem } from '../../api/api';
import { useTabBarVisibility } from '../../hooks/TabBarVisibility';
import { useAppearance } from '../../hooks/Appearance';

// ASSUMPTION: same relative path used on the ItemReview screen — adjust if ConfirmationModal actually lives somewhere else in this project.
import { useConfirmationModal } from '../../components/ConfirmationModal';

const INSET_SHADOW_COLORS = [
  'rgba(15,23,42,0.14)',
  'rgba(15,23,42,0)',
];

// Class strings reused below, each with its light and dark colors.
const CARD = 'mb-3 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';
const CARD_TITLE = 'text-sm font-bold text-[#16233F] dark:text-slate-100';
const INFO_BOX = 'mt-3 rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800';
const INFO_TEXT = 'text-xs text-[#5B647A] dark:text-slate-400';
const PRIMARY_BUTTON = 'bg-[#1b2061] dark:bg-indigo-600';
const FIELD_LABEL = 'mb-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-400';
const FIELD_BOX = 'rounded-xl border border-slate-300 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-800';
const FIELD_VALUE = 'text-sm text-[#16233F] dark:text-slate-100';

const PAGE_SIZE = 10;
// How often the screen silently refetches while it's focused, so lists stay near-real-time.
const POLL_INTERVAL_MS = 5000;

// ==========================================================
// CLAIM REQUEST RULES
//
// These mirror the website's ClaimRequests.jsx, so a claim lands in the
// same tab on the phone as it does on the web:
//
//   Pending        (web "Needs Attention")  not declined, and either no
//                  meeting date/time yet, or an answer mismatch staff has
//                  not approved.
//   Scheduled      (web "Schedule Meeting") not declined and not pending.
//   Declined       every declined claim. A filter inside the tab narrows
//                  it to All / Mismatch / Not the Owner, and each card
//                  carries a remark saying which kind it is (same rule as
//                  the website's getDeclineCategory).
//
// Pending and Scheduled also leave out claims whose item is already
// "Claimed" and claims that are auto-archived (see isClaimAutoArchived).
// ==========================================================

// The item payload getClaims() embeds on a claim.
const getClaimItem = (claim) => claim?.item_details || claim?.item || {};

const normalize = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase();

const getRecordedAnswer = (claim, n) => {
  const item = getClaimItem(claim);
  return item[`verification_answer_${n}`] ?? item[`correct_answer_${n}`] ?? null;
};

// Number of the claimant's answers that differ from the item's recorded answer; questions with no recorded answer (free-text category questions) are never counted as mismatches.
const countMismatches = (claim) =>
  [1, 2, 3, 4].reduce((count, n) => {
    if (!claim?.[`question_${n}`]) return count;

    const recorded = getRecordedAnswer(claim, n);
    const hasRecorded =
      recorded !== null && recorded !== undefined && String(recorded).trim() !== '';
    if (!hasRecorded) return count;

    return normalize(recorded) === normalize(claim[`answer_${n}`]) ? count : count + 1;
  }, 0);

const hasMismatch = (claim) => countMismatches(claim) > 0;

// True once staff approved a flagged claim (and scheduled it anyway).
const isMismatchApproved = (claim) => !!claim?.staff_approved_despite_mismatch;

// True once an admin/moderator confirmed the meeting (Confirm Schedule).
const isStaffScheduled = (claim) => claim?.staff_scheduled === true;

// True once staff declined the claim from the web Review modal.
// Claim.STATUS_CHOICES uses "Declined", but older data / backends may store "rejected", "decline" or "denied", on `status` or `claim_status` (or a boolean flag) — same set the web ClaimRequests.jsx accepts.
const DECLINED_STATUSES = ['rejected', 'declined', 'decline', 'denied'];

const isDeclined = (claim) =>
  !!claim &&
  (DECLINED_STATUSES.includes(normalize(claim.status)) ||
    DECLINED_STATUSES.includes(normalize(claim.claim_status)) ||
    claim.is_declined === true ||
    claim.declined === true);

// Declined with the web's "Not the Owner" button (backend Claim.not_owner).
// These get their own "Not the Owner" tab instead of "Declined".
const isNotOwner = (claim) => claim?.not_owner === true;

// ==========================================================
// WHY A CLAIM WAS DECLINED
//
// Same rule as the website's getDeclineCategory (ClaimRequests.jsx), and
// the same reason texts the website sends with a decline:
//   "notOwner"  declined with the "Not the Owner" button
//   "mismatch"  the answers didn't match the item's recorded answers
//   "other"     declined without flagged answers ("Unable to Verify")
// ==========================================================
const AUTO_DECLINE_REASON = 'The answers provided did not match our records.';
const NOT_OWNER_REASON =
  'After verification, you were found not to be the owner of this item.';

const getDeclineCategory = (claim) => {
  const reason = claim?.decline_reason || claim?.declined_remarks || claim?.remarks || '';
  if (isNotOwner(claim) || reason === NOT_OWNER_REASON) return 'notOwner';
  if (reason === AUTO_DECLINE_REASON || hasMismatch(claim)) return 'mismatch';
  return 'other';
};

const DECLINE_CATEGORY_LABEL = {
  notOwner: 'Not the Owner',
  mismatch: 'Mismatch',
  other: 'Unable to Verify',
};

// One-line remark shown on a declined claim's card.
const DECLINE_CATEGORY_REMARK = {
  notOwner: 'After verification, the claimant was found not to be the owner.',
  mismatch: "The claimant's answers did not match the item's recorded answers.",
  other: 'The claim could not be verified.',
};

// Filter chips inside the Declined tab.
const DECLINE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'mismatch', label: 'Mismatch' },
  { key: 'notOwner', label: 'Not the owner' },
];

// "Declined on" label (YYYY-MM-DD), falling back to the closest timestamp available.
const getDeclinedOnLabel = (claim) => {
  const value =
    claim?.declined_at || claim?.decline_date || claim?.updated_at || claim?.claim_date;
  return value ? String(value).slice(0, 10) : null;
};

// True once the backend marked the claim "Timed Out" (claim/noshow.py):
// staff had confirmed the meeting, the meeting day passed, and the item was
// not handed over — the claimant did not show up.
const isTimedOut = (claim) => normalize(claim?.status) === 'timed out';

// How many earlier meetings this claimant missed for the same item
// (the serializer's `missed_meetings`). After 3 they must claim in person.
const getMissedMeetings = (claim) => Number(claim?.missed_meetings || 0);

// A claim is "pending review" ONLY while it has no meeting slot yet
// (same rule as the website).
const isPendingReview = (claim) =>
  !!claim && (!claim.meeting_date || !claim.meeting_time);

// Still waiting on staff: no meeting slot yet, or a flagged mismatch that
// staff has not approved. A declined claim is never pending.
const needsAttention = (claim) =>
  !isDeclined(claim) &&
  (isPendingReview(claim) || (hasMismatch(claim) && !isMismatchApproved(claim)));

const isItemAlreadyClaimed = (claim) =>
  normalize(getClaimItem(claim)?.status) === 'claimed';

// ==========================================================
// CLAIM AUTO-ARCHIVE RULE
//
// Same rule as the website's utils/claimArchive.js. An auto-archived claim
// is no longer listed under Pending or Scheduled:
//
//   - Finished claims are archived right away, whatever their dates:
//       "Timed Out"  the claimant missed the meeting (claim/noshow.py)
//       "Closed"     the item went to another claimant (claim/closing.py)
//       "Released"   the item was handed to this claimant
//   - Any other claim with a meeting date is archived 3 days after that
//     date, e.g. a meeting on October 3 is archived on October 6.
//   - A claim with no meeting date is never archived.
//
// Declined claims are never auto-archived: the Declined and Not Owner tabs
// don't call this, and Pending / Scheduled drop declined claims first.
//
// Nothing is written to the database; the rule is computed from the claim
// every time the list is built.
// ==========================================================
const AUTO_ARCHIVE_AFTER_DAYS = 3;

const ARCHIVED_STATUSES = ['timed out', 'closed', 'released'];

const isClaimAutoArchived = (claim) => {
  if (!claim) return false;

  // Finished claims are archived right away, like the website.
  if (ARCHIVED_STATUSES.includes(normalize(claim.status))) return true;

  const match = String(claim.meeting_date || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return false;

  // Local dates, so the day doesn't shift in UTC+8.
  const meetingDay = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const daysAgo = Math.round((today - meetingDay) / 86400000);
  return daysAgo >= AUTO_ARCHIVE_AFTER_DAYS;
};

// Newest claim first, like the website (falls back to the id when a claim has no usable claim_date).
const compareClaimsNewestFirst = (first, second) => {
  const firstTime = new Date(first?.claim_date).getTime();
  const secondTime = new Date(second?.claim_date).getTime();

  if (!Number.isNaN(firstTime) && !Number.isNaN(secondTime) && firstTime !== secondTime) {
    return secondTime - firstTime;
  }

  return Number(second?.id) - Number(first?.id);
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

// item.claimed_time ("HH:MM", saved when the item was marked as Claimed) as
// a "2:30 PM" label. The claimed date is shown on its own line.
const getClaimedTimeLabel = (item) => formatTimeLabel(item.claimed_time);

const FALLBACK_STATUS_STYLE = {
  bg: 'bg-slate-200 dark:bg-slate-800',
  text: 'text-slate-600 dark:text-slate-300',
};

const RenderedItemCard = React.memo(
  ({ item, activeFilter, statusFilter, onReview, onEdit, onArchive, getStatusStyle }) => {
    // Icon colors follow the app's Light / Dark appearance.
    const { isDark } = useAppearance();
    const metaIcon = isDark ? '#94A3B8' : '#5B647A';

    if (activeFilter === 'claimed') {
      const itemDetails = item.item_details || {};
      const declined = isDeclined(item);
      const notOwner = declined && isNotOwner(item);
      const hasMeeting = Boolean(item.meeting_date && item.meeting_time);
      // Same rule that puts the claim in the Pending tab.
      const attention = needsAttention(item);
      const staffScheduled = isStaffScheduled(item);
      // NOTE: timed-out claims are auto-archived (see isClaimAutoArchived),
      // so they no longer reach the Pending / Scheduled tabs. The timed-out
      // styling below is kept for any screen that lists archived claims.
      const timedOut = !declined && isTimedOut(item);
      const missedCount = getMissedMeetings(item);
      const mismatched = hasMismatch(item) && !isMismatchApproved(item);
      const declinedOn = getDeclinedOnLabel(item);
      const declineReason = item.decline_reason || item.declined_remarks || item.remarks;
      // Mismatch / Not the Owner / Unable to Verify (declined claims only).
      const declineCategory = declined ? getDeclineCategory(item) : null;

      // Amber while something is still waiting on staff, green once staff confirmed the meeting.
      const waiting = attention || !staffScheduled;
      const meetingLabel = timedOut
        ? 'Missed meeting'
        : attention || !staffScheduled
        ? 'Requested'
        : 'Meeting';
      const meetingColor = timedOut
        ? 'text-orange-700 dark:text-orange-300'
        : attention || !staffScheduled
        ? 'text-amber-700 dark:text-amber-300'
        : 'text-emerald-700 dark:text-emerald-300';

      const stateLabel = attention
        ? 'Pending review'
        : staffScheduled
        ? 'Scheduled by staff'
        : 'Awaiting confirmation';

      return (
        <View className={CARD}>
          <View className="p-3">
            <View className="flex-row items-start justify-between gap-2">
              <View className="flex-1">
                <Text numberOfLines={1} className={CARD_TITLE}>
                  {itemDetails.title || item.ticket_code}
                </Text>
                <Text className="mt-0.5 text-[11px] font-semibold text-slate-400">
                  Claimant: {item.claimant_name || 'Not specified'}
                </Text>
              </View>
              <View className="items-end gap-1">
                {mismatched && !declined ? (
                  <View className="rounded-full bg-rose-100 px-2 py-0.5 dark:bg-rose-950">
                    <Text className="text-[10px] font-bold text-rose-700 dark:text-rose-300">Answer mismatch</Text>
                  </View>
                ) : null}
                {declined ? (
                  <View className="rounded-full bg-red-100 px-2 py-0.5 dark:bg-red-950">
                    <Text className="text-[10px] font-bold text-red-700 dark:text-red-300">
                      Declined · {DECLINE_CATEGORY_LABEL[declineCategory]}
                    </Text>
                  </View>
                ) : timedOut ? (
                  // The claimant missed the staff-confirmed meeting.
                  <View className="rounded-full bg-orange-100 px-2 py-0.5 dark:bg-orange-950">
                    <Text className="text-[10px] font-bold text-orange-700 dark:text-orange-300">Timed out</Text>
                  </View>
                ) : (
                  <View
                    className={`rounded-full px-2 py-0.5 ${
                      waiting
                        ? 'bg-amber-100 dark:bg-amber-950'
                        : 'bg-emerald-100 dark:bg-emerald-950'
                    }`}
                  >
                    <Text
                      className={`text-[10px] font-bold ${
                        waiting
                          ? 'text-amber-700 dark:text-amber-300'
                          : 'text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {stateLabel}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View className={INFO_BOX}>
              <Text className={INFO_TEXT}>Category: {itemDetails.category || 'Uncategorized'}</Text>
              <Text className={`mt-1 ${INFO_TEXT}`}>Contact: {item.claimant_contact || 'Not specified'}</Text>
              {item.claimant_email ? <Text className={`mt-1 ${INFO_TEXT}`}>Email: {item.claimant_email}</Text> : null}
              <Text className={`mt-1 ${INFO_TEXT}`}>Location: {itemDetails.location || 'Not specified'}</Text>
              {declined ? (
                <>
                  <Text className="mt-1 text-xs font-semibold text-red-700 dark:text-red-300">
                    {notOwner ? 'Marked on' : 'Declined on'}: {declinedOn || 'Not recorded'}
                  </Text>
                  {/* Remark: whether it was a mismatch or not the owner. */}
                  <Text className="mt-1 text-xs text-red-700 dark:text-red-300">
                    <Text className="font-bold">Remark: {DECLINE_CATEGORY_LABEL[declineCategory]}</Text>
                    {' — '}
                    {DECLINE_CATEGORY_REMARK[declineCategory]}
                  </Text>
                  {declineReason &&
                  declineReason !== AUTO_DECLINE_REASON &&
                  declineReason !== NOT_OWNER_REASON ? (
                    <Text className="mt-1 text-xs text-red-700 dark:text-red-300">Reason: {declineReason}</Text>
                  ) : null}
                </>
              ) : hasMeeting ? (
                // Date and time on separate lines. Orange for a missed
                // meeting, amber while it is only the claimant's requested
                // slot, green once staff confirmed it.
                <>
                  <Text className={`mt-1 text-xs font-semibold ${meetingColor}`}>
                    {meetingLabel} date: {item.meeting_date}
                  </Text>
                  <Text className={`mt-1 text-xs font-semibold ${meetingColor}`}>
                    {meetingLabel} time: {item.meeting_time}
                  </Text>
                </>
              ) : null}

              {/* Same note the website shows: earlier no-shows on this item. */}
              {!declined && missedCount > 0 ? (
                <Text className="mt-1 text-xs font-semibold text-orange-700 dark:text-orange-300">
                  Missed {missedCount} previous meeting{missedCount === 1 ? '' : 's'}
                </Text>
              ) : null}

              {!declined && item.online_claim_blocked ? (
                <Text className="mt-1 text-xs font-semibold text-orange-700 dark:text-orange-300">
                  3 missed meetings — this claimant must now claim in person.
                </Text>
              ) : null}
            </View>

            <Text className="mt-3 text-xs font-semibold text-[#16233F] dark:text-slate-100">Proof / ownership details</Text>
            <Text numberOfLines={3} className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {item.proof_description || 'No proof description provided.'}
            </Text>

            <TouchableOpacity
              activeOpacity={0.6}
              onPress={() => onReview(item)}
              className={`mt-3 items-center rounded-lg px-4 py-2.5 ${PRIMARY_BUTTON}`}
            >
              {/* The Scheduled tab labels this button "Scheduled"; it
                  still opens the same Claim Verification screen. */}
              <Text className="text-xs font-bold text-white">
                {statusFilter === 'Scheduled' ? 'Scheduled' : 'Review'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    const status = getStatusStyle(item.status);

    // Whoever reported a Lost item / turned in a Surrendered item is stored as poster_name on the item.
    const reporterName =
      item.poster_name?.trim() ||
      `${item.first_name || ''} ${item.last_name || ''}`.trim() ||
      'Not specified';

    // Surrendered > Claimed and Lost Items > Claimed tabs: the record is settled, so Edit is dropped and the card also shows when it was claimed.
    const isClaimedSurrendered =
      (activeFilter === 'surrendered' || activeFilter === 'lost') && statusFilter === 'Claimed';
    // Lost Items > Declined: a declined report is not edited, so Edit is dropped too.
    const isDeclinedLost = activeFilter === 'lost' && statusFilter === 'Declined';
    const canEdit = !isClaimedSurrendered && !isDeclinedLost;
    const lostOrFound = item.type === 'Surrendered' ? 'found' : 'lost';

    return (
      <View className={CARD}>
        <View className="p-3">
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-1">
              <Text numberOfLines={1} className={CARD_TITLE}>
                {item.title}
              </Text>
              <Text className="mt-0.5 text-[11px] font-semibold text-slate-400">
                {item.ticket_code}
              </Text>
            </View>

            <View className={`flex-row items-center rounded-full ${status.bg} px-2 py-0.5`}>
              <Text className={`text-[10px] font-bold ${status.text}`}>{item.status}</Text>
            </View>
          </View>

          <View className={INFO_BOX}>
            <View className="mb-1.5 flex-row items-center">
              <Ticket size={13} color={metaIcon} />
              <Text className={`ml-1.5 ${INFO_TEXT}`}>
                Category: {item.category || 'Uncategorized'}
              </Text>
            </View>

            <View className="mb-1.5 flex-row items-center">
              <User size={13} color={metaIcon} />
              <Text className={`ml-1.5 ${INFO_TEXT}`}>
                Reported by: {reporterName}
              </Text>
            </View>

            <View className="mb-1.5 flex-row items-center">
              <MapPin size={13} color={metaIcon} />
              <Text numberOfLines={1} className={`ml-1.5 flex-1 ${INFO_TEXT}`}>
                Area {item.type === 'Surrendered' ? 'found' : 'lost'}: {item.location || 'Not specified'}
              </Text>
            </View>

            {/* Date and time on separate lines. flex-1 lets a long
                "From to To" range wrap inside the box. */}
            <View className="mb-1.5 flex-row items-start">
              <Calendar size={13} color={metaIcon} style={{ marginTop: 1 }} />
              <Text className={`ml-1.5 flex-1 ${INFO_TEXT}`}>
                Date {lostOrFound}: {getDateRangeLabel(item) || 'Not specified'}
              </Text>
            </View>

            <View className={`flex-row items-start ${isClaimedSurrendered ? 'mb-1.5' : ''}`}>
              <Clock size={13} color={metaIcon} style={{ marginTop: 1 }} />
              <Text className={`ml-1.5 flex-1 ${INFO_TEXT}`}>
                Time {lostOrFound}: {getTimeRangeLabel(item) || 'Not specified'}
              </Text>
            </View>

            {isClaimedSurrendered ? (
              <>
                <View className="mb-1.5 flex-row items-center">
                  <CheckCircle2 size={13} color={metaIcon} />
                  <Text className={`ml-1.5 ${INFO_TEXT}`}>
                    Date claimed: {item.claimed_date || 'Not recorded'}
                  </Text>
                </View>

                <View className="flex-row items-center">
                  <Clock size={13} color={metaIcon} />
                  <Text className={`ml-1.5 ${INFO_TEXT}`}>
                    Time claimed: {getClaimedTimeLabel(item) || 'Not recorded'}
                  </Text>
                </View>
              </>
            ) : null}
          </View>

          <View className="mt-4 flex-row gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <TouchableOpacity
              activeOpacity={0.6}
              onPress={() => onReview(item)}
              className={`flex-1 flex-row items-center justify-center rounded-lg px-2 py-2.5 ${PRIMARY_BUTTON}`}
            >
              <Eye size={14} color="#FFFFFF" />
              <Text className="ml-1.5 text-[11px] font-bold text-white">Review</Text>
            </TouchableOpacity>

            {canEdit ? (
              <TouchableOpacity
                activeOpacity={0.6}
                onPress={() => onEdit(item)}
                className="flex-1 flex-row items-center justify-center rounded-lg bg-blue-50 px-2 py-2.5 dark:bg-blue-950"
              >
                <Pencil size={14} color={isDark ? '#93C5FD' : '#1D4ED8'} />
                <Text className="ml-1.5 text-[11px] font-bold text-blue-700 dark:text-blue-300">Edit</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              activeOpacity={0.6}
              onPress={() => onArchive(item)}
              className="flex-1 flex-row items-center justify-center rounded-lg bg-slate-100 px-2 py-2.5 dark:bg-slate-800"
            >
              <Archive size={14} color={isDark ? '#CBD5E1' : '#475569'} />
              <Text className="ml-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">Archive</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }
);

export default function ItemsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { handleScroll } = useTabBarVisibility();

  // Icon, spinner, and placeholder colors follow the app's appearance.
  const { isDark } = useAppearance();
  const navyIcon = isDark ? '#C7D2FE' : '#1b2061';
  const mutedIcon = isDark ? '#94A3B8' : '#5B647A';
  const disabledIcon = isDark ? '#475569' : '#CBD5E1';

  const [items, setItems] = useState([]);
  const [claims, setClaims] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('lost');
  const [statusFilter, setStatusFilter] = useState('Pending');
  // Claim Requests > Declined: 'all' | 'mismatch' | 'notOwner'.
  const [declineFilter, setDeclineFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reviewingItem, setReviewingItem] = useState(null);
  // Guards against a second archive request firing while one is still in flight (e.g. a stray double-tap on Confirm).
  const [isArchiving, setIsArchiving] = useState(false);

  // Shared confirmation/feedback modal — replaces Alert.alert for the review-modal placeholder actions, and replaces the old bespoke "confirm archive" / "archived successfully" modals below.
  const { confirmationModal, showFeedback, showConfirm } = useConfirmationModal();

  const listRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(1);
  // Prevents a slow request and a poll tick (or refresh pull) from overlapping and racing each other.
  const isFetchingRef = useRef(false);

  const FILTERS = useMemo(
    () => [
      { key: 'lost', label: 'Lost Items', icon: Search },
      { key: 'surrendered', label: 'Surrendered Items', icon: Flag },
      { key: 'claimed', label: 'Claim Requests', icon: Handshake },
    ],
    []
  );

  // Each status has a light and a dark color pair.
  const STATUS_STYLES = useMemo(
    () => ({
      Pending: { bg: 'bg-orange-100 dark:bg-orange-950', text: 'text-orange-700 dark:text-orange-300' },
      Approved: { bg: 'bg-green-100 dark:bg-green-950', text: 'text-green-700 dark:text-green-300' },
      Declined: { bg: 'bg-red-100 dark:bg-red-950', text: 'text-red-700 dark:text-red-300' },
      Claimed: { bg: 'bg-purple-100 dark:bg-purple-950', text: 'text-purple-700 dark:text-purple-300' },
      Scheduled: { bg: 'bg-blue-100 dark:bg-blue-950', text: 'text-blue-700 dark:text-blue-300' },
      Archived: { bg: 'bg-slate-200 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-300' },
    }),
    []
  );

  const getStatusStyle = useCallback(
    (status) => STATUS_STYLES[status] || FALLBACK_STATUS_STYLE,
    [STATUS_STYLES]
  );

  const STATUS_TOGGLES = useMemo(() => {
    switch (activeFilter) {
      case 'surrendered':
        return [
          { key: 'Surrendered', label: 'Surrendered' },
          { key: 'Claimed', label: 'Claimed' },
        ];
      case 'claimed':
        // Pending, Scheduled and Declined. "Not the Owner" claims are in
        // Declined, under its "Not the owner" filter.
        return [
          { key: 'Pending', label: 'Pending' },
          { key: 'Scheduled', label: 'Scheduled' },
          { key: 'Declined', label: 'Declined' },
        ];
      case 'lost':
      default:
        // "Claimed" lists Lost items whose status is Claimed.
        return [
          { key: 'Pending', label: 'Pending' },
          { key: 'Approved', label: 'Approved' },
          { key: 'Declined', label: 'Declined' },
          { key: 'Claimed', label: 'Claimed' },
        ];
    }
  }, [activeFilter]);

  const resolveStatusValue = useCallback((filterKey, toggleKey) => {
    if (filterKey === 'surrendered' && toggleKey === 'Surrendered') {
      return 'Approved';
    }
    return toggleKey;
  }, []);

  useEffect(() => {
    setStatusFilter(STATUS_TOGGLES[0]?.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilter]);

  // `silent` is used for background polling refreshes: it skips the loading/refreshing
  // spinners and skips clearing state on error, so a periodic poll never flickers the UI
  // or wipes out already-loaded data if one poll happens to fail.
  const loadData = useCallback(async (filterKey, statusKey, options = {}) => {
    const { silent = false } = options;

    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    if (!silent) {
      setLoadError('');
      setRefreshing(true);
    }

    try {
      if (filterKey === 'claimed') {
        try {
          // One request returns every claim; the Pending / Scheduled /
          // Declined / Not Owner tabs are sorted out on the device.
          const claimData = await getClaims({});

          // Handles both a plain array and DRF pagination's {results: [...]}
          const claimList = Array.isArray(claimData)
            ? claimData
            : Array.isArray(claimData?.results)
            ? claimData.results
            : [];

          setClaims(claimList);
        } catch (error) {
          console.warn('Claim requests are unavailable for this account.', error);
          if (!silent) setClaims([]);
        }
      } else {
        const itemType = filterKey === 'surrendered' ? 'Surrendered' : 'Lost';
        const actualStatus = resolveStatusValue(filterKey, statusKey);
        try {
          const itemData = await getItems({ type: itemType, status: actualStatus });
          setItems(Array.isArray(itemData) ? itemData : []);
        } catch (error) {
          console.error('Failed to fetch items:', error);
          if (!silent) setLoadError('Could not load items. Check your server connection.');
        }
      }
    } finally {
      setLoading(false);
      if (!silent) setRefreshing(false);
      isFetchingRef.current = false;
    }
  }, [resolveStatusValue]);

  useFocusEffect(
    useCallback(() => {
      // Immediate foreground fetch (shows the loading/refresh state).
      loadData(activeFilter, statusFilter);

      // Poll for fresh data every POLL_INTERVAL_MS while this screen is focused,
      // so lists (especially claim requests) stay near-real-time without a manual pull.
      const intervalId = setInterval(() => {
        loadData(activeFilter, statusFilter, { silent: true });
      }, POLL_INTERVAL_MS);

      return () => clearInterval(intervalId);
    }, [loadData, activeFilter, statusFilter])
  );

  // ==========================================================
  // RESET ONLY ON A BOTTOM-TAB CHANGE
  //
  // The filters go back to Lost Items > Pending (and the search and page
  // are cleared) only when the user switches to another bottom tab.
  //
  // Opening Review, Edit or Claim Verification also takes focus away from
  // this screen, so a plain 'blur' listener reset the filters there too:
  // after going back the user landed on Lost Items > Pending instead of
  // where they were. Now this screen watches the bottom tab navigator and
  // resets only when a different tab becomes the focused one.
  // ==========================================================

  // Set just before this screen opens one of its own detail screens, so the
  // fallback blur listener below can tell that apart from a tab change.
  const openingDetailRef = useRef(false);

  const resetFilters = useCallback(() => {
    setActiveFilter('lost');
    setStatusFilter('Pending');
    setDeclineFilter('all');
    setSearchQuery('');
    setCurrentPage(1);
  }, []);

  useEffect(() => {
    // Find the bottom tab navigator: this screen's own navigator, or the
    // closest parent of type 'tab'.
    let tabNavigation = null;
    let current = navigation;
    while (current) {
      if (current.getState?.()?.type === 'tab') {
        tabNavigation = current;
        break;
      }
      current = current.getParent?.();
    }

    if (tabNavigation) {
      // The tab this screen lives in: whichever tab is focused while this
      // screen itself is focused. Re-read on every focus, so it is right
      // even if Items was mounted in the background.
      let itemsTabKey = null;
      const readItemsTabKey = () => {
        const tabState = tabNavigation.getState();
        itemsTabKey = tabState?.routes?.[tabState.index]?.key ?? itemsTabKey;
      };
      if (navigation.isFocused?.()) readItemsTabKey();
      const unsubscribeFocus = navigation.addListener('focus', readItemsTabKey);

      const unsubscribeState = tabNavigation.addListener('state', (event) => {
        const tabState = event?.data?.state;
        if (!itemsTabKey || !tabState || !Array.isArray(tabState.routes)) return;

        const focusedKey = tabState.routes[tabState.index]?.key;
        if (focusedKey && focusedKey !== itemsTabKey) resetFilters();
      });

      return () => {
        unsubscribeFocus();
        unsubscribeState();
      };
    }

    // Fallback if no tab navigator is found: reset on blur, except when the
    // blur comes from opening Review / Edit / Claim Verification.
    const unsubscribe = navigation.addListener('blur', () => {
      if (openingDetailRef.current) {
        openingDetailRef.current = false;
        return;
      }
      resetFilters();
    });

    return unsubscribe;
  }, [navigation, resetFilters]);

  // Coming back from a detail screen clears the fallback flag.
  useFocusEffect(
    useCallback(() => {
      openingDetailRef.current = false;
    }, [])
  );

  const handleRefresh = useCallback(() => {
    loadData(activeFilter, statusFilter);
  }, [loadData, activeFilter, statusFilter]);

  const handleFilterPress = useCallback((filterKey) => {
    setActiveFilter((currentFilter) =>
      currentFilter === filterKey ? currentFilter : filterKey
    );
  }, []);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const visibleItems = useMemo(() => {
    let matchingRecords;

    if (activeFilter === 'claimed') {
      matchingRecords = claims.filter((claim) => {
        const declined = isDeclined(claim);
        let matchesStatus;

        if (statusFilter === 'Declined') {
          // Every declined claim (shown regardless of the item's own
          // status, like the web Declined tab), narrowed by the filter.
          matchesStatus =
            declined &&
            (declineFilter === 'all' || getDeclineCategory(claim) === declineFilter);
        } else {
          // Pending / Scheduled never include declined claims, claims whose
          // item is already Claimed, or auto-archived claims (finished
          // statuses, or a meeting date 3 or more days ago).
          if (declined || isItemAlreadyClaimed(claim) || isClaimAutoArchived(claim)) {
            return false;
          }

          matchesStatus =
            statusFilter === 'Scheduled'
              ? !needsAttention(claim)
              : needsAttention(claim);
        }

        const searchable = [
          claim.claimant_name,
          claim.claimant_contact,
          claim.claimant_email,
          claim.proof_description,
          claim.item_details?.title,
          claim.item_details?.category,
          claim.item_details?.location,
        ]
          .join(' ')
          .toLowerCase();

        return (
          matchesStatus &&
          (!normalizedQuery || searchable.includes(normalizedQuery))
        );
      });

      // Newest claim first, like the website.
      return [...matchingRecords].sort(compareClaimsNewestFirst);
    }

    const expectedType = activeFilter === 'surrendered' ? 'Surrendered' : 'Lost';
    const expectedStatus = resolveStatusValue(activeFilter, statusFilter);

    matchingRecords = items.filter(
      (item) =>
        item.type === expectedType &&
        item.status === expectedStatus &&
        (!normalizedQuery ||
          [
            item.title,
            item.ticket_code,
            item.category,
            item.poster_name,
            item.first_name,
            item.last_name,
            item.location,
          ]
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery))
    );

    return [...matchingRecords].sort(
      (firstItem, secondItem) => Number(secondItem.id) - Number(firstItem.id)
    );
  }, [activeFilter, claims, items, normalizedQuery, statusFilter, declineFilter, resolveStatusValue]);

  // How many declined claims each Declined filter would show (before search).
  const declineCounts = useMemo(() => {
    const counts = { all: 0, mismatch: 0, notOwner: 0 };
    if (activeFilter !== 'claimed') return counts;
    claims.forEach((claim) => {
      if (!isDeclined(claim)) return;
      counts.all += 1;
      const category = getDeclineCategory(claim);
      if (category in counts) counts[category] += 1;
    });
    return counts;
  }, [activeFilter, claims]);

  const tabBarHeight = useBottomTabBarHeight();

  const listHeader = (
    <>
      <View className="mb-4">
        <Text className="mb-1 text-sm font-semibold tracking-wide text-slate-500 dark:text-slate-400">
          {activeFilter === 'claimed' ? 'Search claims' : 'Search items'}
        </Text>

        <View className="relative flex-row items-center overflow-hidden rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-900">
          <Search size={16} color={mutedIcon} />

          <TextInput
            className="ml-2 h-11 flex-1 text-sm text-[#16233F] dark:text-slate-100"
            placeholder={activeFilter === 'claimed' ? 'Search claimant, item, contact...' : 'Search name, ticket, reporter...'}
            placeholderTextColor={isDark ? '#64748B' : '#9AA3B5'}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
          />
        </View>
      </View>

      <View className="mb-5 flex-row overflow-hidden rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
        {FILTERS.map((filter) => {
          const selected = activeFilter === filter.key;
          const FilterIcon = filter.icon;

          return (
            <TouchableOpacity
              key={filter.key}
              activeOpacity={0.6}
              onPress={() => handleFilterPress(filter.key)}
              className={`h-14 flex-1 items-center justify-center ${
                selected ? PRIMARY_BUTTON : 'bg-white dark:bg-slate-900'
              } ${
                filter.key !== 'claimed'
                  ? 'border-r border-slate-300 dark:border-slate-700'
                  : ''
              }`}
            >
              <FilterIcon
                size={16}
                color={selected ? '#FFFFFF' : mutedIcon}
              />

              <Text
                numberOfLines={2}
                className={`mt-1 text-center text-[10px] font-bold leading-3 ${
                  selected ? 'text-white' : 'text-[#5B647A] dark:text-slate-400'
                }`}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View className="mb-5 flex-row overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700">
        {STATUS_TOGGLES.map((toggle) => {
          const selected = statusFilter === toggle.key;

          return (
            <TouchableOpacity
              key={toggle.key}
              activeOpacity={0.6}
              onPress={() => setStatusFilter(toggle.key)}
              className={`flex-1 items-center justify-center px-1 py-2.5 ${
                selected ? PRIMARY_BUTTON : 'bg-white dark:bg-slate-900'
              }`}
            >
              {/* Slightly smaller text when there are four toggles, so "Not Owner" fits on one line. */}
              <Text
                numberOfLines={1}
                className={`text-center font-bold ${
                  STATUS_TOGGLES.length > 3 ? 'text-[11px]' : 'text-xs'
                } ${
                  selected ? 'text-white' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {toggle.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Claim Requests > Declined: All / Mismatch / Not the owner */}
      {activeFilter === 'claimed' && statusFilter === 'Declined' ? (
        <View className="-mt-2 mb-5 flex-row gap-2">
          {DECLINE_FILTERS.map((chip) => {
            const selected = declineFilter === chip.key;
            return (
              <TouchableOpacity
                key={chip.key}
                activeOpacity={0.6}
                onPress={() => setDeclineFilter(chip.key)}
                className={`flex-row items-center rounded-full border px-3 py-1.5 ${
                  selected
                    ? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950'
                    : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'
                }`}
              >
                <Text
                  className={`text-[11px] font-bold ${
                    selected ? 'text-red-700 dark:text-red-300' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {chip.label}
                </Text>
                <View
                  className={`ml-1.5 rounded-full px-1.5 ${
                    selected ? 'bg-red-100 dark:bg-red-900' : 'bg-slate-100 dark:bg-slate-800'
                  }`}
                >
                  <Text
                    className={`text-[10px] font-bold ${
                      selected ? 'text-red-700 dark:text-red-300' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {declineCounts[chip.key]}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      <View className="mb-3 flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View className="mr-2 h-4 w-1 rounded-full bg-[#1b2061] dark:bg-indigo-500" />

          <Text className="text-sm font-bold text-[#16233F] dark:text-slate-100">
            {activeFilter === 'claimed' ? 'Claim requests' : 'Reported items'}
          </Text>
        </View>

        <Text className="text-xs font-semibold text-slate-400">
          {visibleItems.length}{' '}
          {activeFilter === 'claimed'
            ? (visibleItems.length === 1 ? 'request' : 'requests')
            : (visibleItems.length === 1 ? 'item' : 'items')}
        </Text>
      </View>
    </>
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter, searchQuery, statusFilter, declineFilter]);

  const totalPages = Math.max(
    Math.ceil(visibleItems.length / PAGE_SIZE),
    1
  );

  const safeCurrentPage = Math.min(currentPage, totalPages);

  const startIndex = (safeCurrentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, visibleItems.length);

  const paginatedItems = visibleItems.slice(startIndex, endIndex);

  const pageNumbers = Array.from(
    { length: totalPages },
    (_, index) => index + 1
  ).filter(
    (pageNumber) =>
      pageNumber === 1 ||
      pageNumber === totalPages ||
      Math.abs(pageNumber - safeCurrentPage) <= 1
  );

  const changePage = (pageNumber) => {
    if (pageNumber < 1 || pageNumber > totalPages) return;

    listRef.current?.scrollToOffset({
      offset: 0,
      animated: true,
    });

    setCurrentPage(pageNumber);
  };

  const paginationFooter =
    visibleItems.length > 0 ? (
      <View className="mt-2 border-t border-slate-100 pt-4 dark:border-slate-800">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-[11px] font-semibold text-slate-400">
            Showing {startIndex + 1}–{endIndex} of {visibleItems.length}
          </Text>
          <Text className="text-[11px] font-semibold text-slate-400">
            Page {safeCurrentPage} of {totalPages}
          </Text>
        </View>

        <View className="flex-row items-center justify-between">
          <TouchableOpacity
            activeOpacity={0.6}
            disabled={safeCurrentPage === 1}
            onPress={() => changePage(safeCurrentPage - 1)}
            className={`h-9 w-9 items-center justify-center rounded-lg border ${
              safeCurrentPage === 1
                ? 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900'
                : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800'
            }`}
          >
            <ChevronLeft
              size={16}
              color={safeCurrentPage === 1 ? disabledIcon : navyIcon}
            />
          </TouchableOpacity>

          <View className="flex-row items-center gap-1.5">
            {pageNumbers.map((pageNumber) => {
              const selected = pageNumber === safeCurrentPage;

              return (
                <TouchableOpacity
                  key={pageNumber}
                  activeOpacity={0.6}
                  onPress={() => changePage(pageNumber)}
                  className={`h-9 w-9 items-center justify-center rounded-lg ${
                    selected ? PRIMARY_BUTTON : 'bg-[#EEF1F7] dark:bg-slate-800'
                  }`}
                >
                  <Text
                    className={`text-[11px] font-bold ${
                      selected ? 'text-white' : 'text-[#1b2061] dark:text-slate-200'
                    }`}
                  >
                    {pageNumber}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            activeOpacity={0.6}
            disabled={safeCurrentPage === totalPages}
            onPress={() => changePage(safeCurrentPage + 1)}
            className={`h-9 w-9 items-center justify-center rounded-lg border ${
              safeCurrentPage === totalPages
                ? 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900'
                : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800'
            }`}
          >
            <ChevronRight
              size={16}
              color={safeCurrentPage === totalPages ? disabledIcon : navyIcon}
            />
          </TouchableOpacity>
        </View>
      </View>
    ) : null;

  // Declined claims (including "Not the Owner") open read-only (the web Review modal shows no Approve / Decline / Schedule controls for them). ClaimVerification should read `route.params.readOnly` and hide its action buttons when it's true.
  const handleReviewItem = useCallback((item) => {
    // Keeps the current tab and toggle when the user comes back.
    openingDetailRef.current = true;
    if (activeFilter === 'claimed') {
      navigation.navigate('ClaimVerification', { claim: item, readOnly: isDeclined(item) });
    } else {
      navigation.navigate('ItemReview', { item, activeFilter, statusFilter });
    }
  }, [activeFilter, statusFilter, navigation]);

  const handleEditItem = useCallback((item) => {
    // Keeps the current tab and toggle when the user comes back.
    openingDetailRef.current = true;
    navigation.navigate('ItemEdit', { item });
  }, [navigation]);

  // Runs the archive request itself, after the user has confirmed. Success and failure are both reported through the shared feedback modal, with the archived item's title/ticket kept in the "detail" box on success — the same info the old bespoke success modal showed.
  const handleConfirmArchive = useCallback(async (item) => {
    if (isArchiving) return;

    setIsArchiving(true);

    try {
      await archiveItem(item.id);
      loadData(activeFilter, statusFilter);

      showFeedback({
        title: 'Item Archived',
        message: 'This item has been moved to archived records.',
        tone: 'success',
        detail: { label: 'ARCHIVED ITEM', value: item.title || item.ticket_code || 'Untitled item' },
      });
    } catch (error) {
      console.error('Failed to archive item:', error);
      showFeedback({
        title: 'Archive failed',
        message: 'Could not archive this item. Please check your connection and try again.',
        tone: 'error',
      });
    } finally {
      setIsArchiving(false);
    }
  }, [isArchiving, loadData, activeFilter, statusFilter, showFeedback]);

  const handleArchiveItem = useCallback((item) => {
    showConfirm({
      title: 'Archive Item',
      message: `Are you sure you want to archive "${item.title || 'this item'}"? You can still find it in archived records later.`,
      confirmLabel: 'Archive Item',
      destructive: true,
      onConfirm: () => handleConfirmArchive(item),
    });
  }, [showConfirm, handleConfirmArchive]);

  const listEmptyComponent = loading ? (
    <View className="items-center py-12">
      <ActivityIndicator size="large" color={navyIcon} />
      <Text className="mt-3 text-sm text-slate-500 dark:text-slate-400">
        Loading items...
      </Text>
    </View>
  ) : loadError ? (
    <View className="items-center rounded-xl border border-dashed border-rose-300 bg-rose-50 px-4 py-10 dark:border-rose-900 dark:bg-rose-950">
      <Text className="text-center text-sm font-semibold text-rose-700 dark:text-rose-300">
        {loadError}
      </Text>

      <TouchableOpacity
        onPress={handleRefresh}
        className={`mt-4 rounded-lg px-4 py-2 ${PRIMARY_BUTTON}`}
      >
        <Text className="text-xs font-bold text-white">
          Try Again
        </Text>
      </TouchableOpacity>
    </View>
  ) : (
    <View className="items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 dark:border-slate-700 dark:bg-slate-900">
      <Search size={22} color={isDark ? '#64748B' : '#9AA3B5'} />

      <Text className="mt-2 text-sm font-bold text-[#16233F] dark:text-slate-100">
        No items found
      </Text>

      <Text className="mt-1 text-center text-xs text-slate-500 dark:text-slate-400">
        Try another search term or change the selected filter.
      </Text>
    </View>
  );

  return (
    <View className="flex-1 bg-white dark:bg-slate-950">
      <StatusBar
        style="light"
        backgroundColor="#1b2061"
        translucent={false}
      />

      <SafeAreaView
        edges={['top']}
        className="rounded-b-3xl bg-[#1b2061]"
      >
        <View className="px-4 pb-6 pt-2">
          <Text className="text-[12px] font-bold tracking-widest text-white/60">
            Admin
          </Text>

          <Text className="text-2xl font-bold text-white">
            Items
          </Text>
        </View>
      </SafeAreaView>

      <FlatList
        ref={listRef}
        onScroll={handleScroll}
        data={paginatedItems}
        renderItem={({ item }) => (
          <RenderedItemCard
            item={item}
            activeFilter={activeFilter}
            statusFilter={statusFilter}
            onReview={handleReviewItem}
            onEdit={handleEditItem}
            onArchive={handleArchiveItem}
            getStatusStyle={getStatusStyle}
          />
        )}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={listHeader}
        ListFooterComponent={paginationFooter}
        ListEmptyComponent={listEmptyComponent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[isDark ? '#4F46E5' : '#1b2061']}
            tintColor={navyIcon}
            progressBackgroundColor={isDark ? '#1E293B' : '#FFFFFF'}
          />
        }
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 20,
          paddingBottom: tabBarHeight + 24,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={3}
        removeClippedSubviews={Platform.OS === 'android'}
      />

      <Modal
        visible={Boolean(reviewingItem)}
        transparent
        animationType="slide"
        onRequestClose={() => setReviewingItem(null)}
      >
        <View className="flex-1 justify-end bg-black/40 dark:bg-black/60">
          <View className="max-h-[92%] rounded-t-3xl bg-white dark:bg-slate-900">
            <View className="flex-row items-center justify-between rounded-t-3xl bg-[#0E7895] px-5 py-4">
              <View className="flex-1 pr-3">
                <Text className="text-lg font-bold text-white">Item Review</Text>
                <Text className="mt-0.5 text-xs text-white/85">
                  Review {reviewingItem?.type?.toLowerCase() || 'item'} details before approval.
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setReviewingItem(null)}
                className="h-9 w-9 items-center justify-center rounded-full bg-white/15"
              >
                <Text className="text-xl text-white">×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              className="px-4 py-5"
              contentContainerStyle={{ paddingBottom: 18 }}
              showsVerticalScrollIndicator={false}
            >
              <Text className="text-xs font-bold tracking-wide text-[#0E7895] dark:text-cyan-300">
                ITEM DETAILS
              </Text>

              <View className="mt-3 flex-row gap-3">
                <View className="flex-1">
                  <Text className={FIELD_LABEL}>
                    ITEM NAME
                  </Text>
                  <View className={FIELD_BOX}>
                    <Text className="text-sm font-semibold text-[#16233F] dark:text-slate-100">
                      {reviewingItem?.title || 'Untitled item'}
                    </Text>
                  </View>
                </View>

                <View className="flex-1">
                  <Text className={FIELD_LABEL}>
                    REPORTED BY
                  </Text>
                  <View className={FIELD_BOX}>
                    <Text numberOfLines={1} className={FIELD_VALUE}>
                      {`${reviewingItem?.first_name || ''} ${reviewingItem?.last_name || ''}`.trim() || 'Not specified'}
                    </Text>
                  </View>
                </View>
              </View>

              <View className="mt-4 flex-row gap-3">
                <View className="flex-1">
                  <Text className={FIELD_LABEL}>
                    CATEGORY
                  </Text>
                  <View className={FIELD_BOX}>
                    <Text numberOfLines={1} className={FIELD_VALUE}>
                      {reviewingItem?.category || 'Uncategorized'}
                    </Text>
                  </View>
                </View>

                <View className="flex-1">
                  <Text className={FIELD_LABEL}>
                    {reviewingItem?.type === 'Surrendered' ? 'AREA FOUND' : 'AREA LOST'}
                  </Text>
                  <View className={FIELD_BOX}>
                    <Text numberOfLines={1} className={FIELD_VALUE}>
                      {reviewingItem?.location || 'Not specified'}
                    </Text>
                  </View>
                </View>
              </View>

              <View className="mt-4 flex-row gap-3">
                <View className="flex-1">
                  <Text className={FIELD_LABEL}>
                    DATE REPORTED
                  </Text>
                  <View className={FIELD_BOX}>
                    {/* Date on the first line, time on the second. No line
                        limit, so a "From to To" range is shown in full. */}
                    <Text className={FIELD_VALUE}>
                      {getDateRangeLabel(reviewingItem || {}) || 'Not specified'}
                    </Text>
                    {getTimeRangeLabel(reviewingItem || {}) ? (
                      <Text className={`mt-1 ${FIELD_VALUE}`}>
                        {getTimeRangeLabel(reviewingItem || {})}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View className="flex-1">
                  <Text className={FIELD_LABEL}>
                    STATUS
                  </Text>
                  <View className={FIELD_BOX}>
                    <View className={`self-start rounded-md px-2 py-1 ${getStatusStyle(reviewingItem?.status).bg}`}>
                      <Text className={`text-[10px] font-bold ${getStatusStyle(reviewingItem?.status).text}`}>
                        {(reviewingItem?.status || 'Pending').toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              <Text className={`mt-4 ${FIELD_LABEL}`}>
                DESCRIPTION
              </Text>
              <View className={`min-h-24 ${FIELD_BOX}`}>
                <Text className="text-sm leading-5 text-[#16233F] dark:text-slate-100">
                  {reviewingItem?.description || 'No description provided.'}
                </Text>
              </View>
            </ScrollView>

            <View className="flex-row gap-3 border-t border-slate-200 px-4 py-4 dark:border-slate-800">
              <TouchableOpacity
                activeOpacity={0.6}
                onPress={() =>
                  showFeedback({
                    title: 'Approve item',
                    message: 'The approval workflow has not been connected to this screen yet.',
                    tone: 'info',
                  })
                }
                className={`flex-1 flex-row items-center justify-center rounded-xl py-3.5 ${PRIMARY_BUTTON}`}
              >
                <CheckCircle2 size={17} color="#FFFFFF" />
                <Text className="ml-2 text-xs font-bold text-white">APPROVE ITEM</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.6}
                onPress={() =>
                  showFeedback({
                    title: 'Decline item',
                    message: 'The decline workflow has not been connected to this screen yet.',
                    tone: 'info',
                  })
                }
                className="flex-1 flex-row items-center justify-center rounded-xl bg-slate-200 py-3.5 dark:bg-slate-800"
              >
                <Text className="text-xs font-bold text-slate-600 dark:text-slate-300">DECLINE</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {confirmationModal}
    </View>
  );
}