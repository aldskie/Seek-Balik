import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Clock,
  ThumbsUp,
  UserX,
  XCircle,
} from 'lucide-react-native';

import { declineClaim, getItemById, scheduleMeeting } from '../../api/api';
import { useConfirmationModal } from '../../components/ConfirmationModal';
import { useAppearance } from '../../hooks/Appearance';

// ==========================================================
// CLAIM LOGIC — ported from ClaimRequests.jsx (web), used as reference
// only. Kept self-contained here so this screen doesn't depend on the
// item payload shape matching exactly what ItemsScreen's list sends —
// it re-fetches the full item itself (see the effect below), the same
// way the web Review modal does via getItemById().
// ==========================================================

const normalize = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase();

// Small delay helper — keeps the loading overlay on screen long enough to be
// seen (and lets the confirmation modal finish closing) even on a fast
// connection. Same helper ItemReview uses.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Decline reasons sent with declineClaim(), the same wording the website
// uses. The first is for a claim with mismatched answers; the second is for
// a claim without any, so the claimant isn't told their answers were wrong
// when they weren't.
const AUTO_DECLINE_REASON = 'The answers provided did not match our records.';
const GENERIC_DECLINE_REASON = 'We were unable to verify your claim to this item.';

// The backend's own message for a failed request. Its views answer with
// { detail: "..." }; { error: "..." } is read too in case one doesn't.
const getServerMessage = (error) => {
  const data = error?.response?.data;
  if (!data || typeof data !== 'object') return '';
  if (typeof data.detail === 'string') return data.detail;
  if (typeof data.error === 'string') return data.error;
  return '';
};

// Reason sent when staff mark a scheduled claim as "Not the Owner".
const NOT_OWNER_REASON =
  'Staff confirmed at the verification meeting that the claimant is not the owner of this item.';

// Statuses a declined claim can carry. "rejected" is the value older
// declined claims were saved with.
const DECLINED_STATUSES = ['declined', 'rejected', 'decline', 'denied'];

const getClaimItem = (claim) => claim?.item_details || claim?.item || {};

const getRecordedAnswer = (claim, index, itemOverride) => {
  const n = index + 1;
  const item = itemOverride || getClaimItem(claim);

  return item[`verification_answer_${n}`] ?? item[`correct_answer_${n}`] ?? null;
};

const parseLegacyProof = (proofDescription) => {
  if (!proofDescription || typeof proofDescription !== 'string') return [];

  const parsed = [];

  proofDescription.split(/\n\n+/).forEach((block) => {
    const match = block.match(/^\s*(\d+)\.\s*([\s\S]*?)\nAnswer:\s*([\s\S]*)$/i);
    if (!match) return;

    const [, indexStr, question, answer] = match;
    const index = parseInt(indexStr, 10);
    if (!index || !question.trim()) return;

    parsed.push({
      index,
      question: question.trim(),
      answer: answer.trim(),
      recorded: null,
      hasRecorded: false,
      isMatch: null,
    });
  });

  return parsed;
};

const buildAnswerComparison = (claim, itemOverride) => {
  if (!claim) return [];

  const structured = [1, 2, 3, 4]
    .map((n) => {
      const question = claim[`question_${n}`];
      const answer = claim[`answer_${n}`];

      if (!question) return null;

      const recorded = getRecordedAnswer(claim, n - 1, itemOverride);
      const hasRecorded =
        recorded !== null &&
        recorded !== undefined &&
        String(recorded).trim() !== '';

      return {
        index: n,
        question,
        answer,
        recorded,
        hasRecorded,
        isMatch: hasRecorded ? normalize(recorded) === normalize(answer) : null,
      };
    })
    .filter(Boolean);

  if (structured.length > 0) return structured;

  return parseLegacyProof(claim.proof_description);
};

const isMismatchApproved = (claim) => !!claim?.staff_approved_despite_mismatch;

// Item already resolved by hand from Found Items ("Mark as Claimed"),
// which never touches the Claim record — this claim may be stale.
const isItemAlreadyClaimed = (claim, itemOverride) =>
  normalize((itemOverride || getClaimItem(claim))?.status) === 'claimed';

// Header badge colors per claim status (Claim.STATUS_CHOICES on the backend).
// "rejected" is the value older declined claims were saved with.
const STATUS_BADGE = {
  pending: { box: 'bg-amber-100', text: 'text-amber-700' },
  scheduled: { box: 'bg-emerald-100', text: 'text-emerald-700' },
  approved: { box: 'bg-emerald-100', text: 'text-emerald-700' },
  declined: { box: 'bg-rose-100', text: 'text-rose-700' },
  rejected: { box: 'bg-rose-100', text: 'text-rose-700' },
  // The claimant missed the staff-confirmed meeting (claim/noshow.py).
  'timed out': { box: 'bg-orange-100', text: 'text-orange-700' },
  // The item went to another claimant / was handed to this claimant.
  closed: { box: 'bg-slate-200', text: 'text-slate-600' },
  released: { box: 'bg-violet-100', text: 'text-violet-700' },
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// "2026-10-05" -> "Mon, Oct 5, 2026". Built from the parts (not
// new Date(string)) so the date never shifts a day in UTC+8. Anything
// that isn't YYYY-MM-DD is shown as-is. Display only — the raw value is
// still what gets sent to the backend.
const formatDisplayDate = (value) => {
  if (!value || typeof value !== 'string') return '';
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
};

// One card per question: claimant's answer on the left, the recorded
// answer on the right. Mismatches sort to the top and read red.
// `compact`: tighter version for reuse inside the Schedule Verification
// modal, where space is limited.
function AnswerComparisonCard({ answer, compact = false }) {
  const flagged = answer.isMatch === false;
  const matched = answer.isMatch === true;

  return (
    <View
      className={`overflow-hidden rounded-xl border ${compact ? 'mb-1.5' : 'mb-2'} ${
        flagged ? 'border-rose-300 dark:border-rose-900' : matched ? 'border-emerald-200 dark:border-emerald-900' : 'border-slate-200 dark:border-slate-700'
      }`}
    >
      <View
        className={`flex-row items-center justify-between ${
          compact ? 'px-2.5 py-1.5' : 'px-3 py-2'
        } ${flagged ? 'bg-rose-50 dark:bg-rose-950' : matched ? 'bg-emerald-50 dark:bg-emerald-950' : 'bg-slate-50 dark:bg-slate-800'}`}
      >
        <Text
          className={`mr-2 flex-1 font-bold text-slate-600 dark:text-slate-300 ${
            compact ? 'text-[10px]' : 'text-[11px]'
          }`}
        >
          {answer.index}. {answer.question}
        </Text>
        <Text
          className={`font-bold ${compact ? 'text-[9px]' : 'text-[10px]'} ${
            flagged ? 'text-rose-700 dark:text-rose-300' : matched ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {flagged ? 'Mismatch' : matched ? 'Match' : 'Not auto-checked'}
        </Text>
      </View>

      <View className="flex-row bg-white dark:bg-slate-900">
        <View className={`flex-1 border-r border-slate-100 dark:border-slate-800 ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'}`}>
          <Text className={`font-bold text-slate-400 dark:text-slate-500 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
            Claimant's answer
          </Text>
          <Text
            className={`mt-0.5 font-semibold ${compact ? 'text-xs' : 'text-sm'} ${
              flagged ? 'text-rose-700 dark:text-rose-300' : 'text-[#16233F] dark:text-slate-100'
            }`}
          >
            {answer.answer || '—'}
          </Text>
        </View>

        <View className={`flex-1 ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'}`}>
          <Text className={`font-bold text-slate-400 dark:text-slate-500 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
            Recorded answer (staff only)
          </Text>
          <Text className={`mt-0.5 font-semibold text-[#16233F] dark:text-slate-100 ${compact ? 'text-xs' : 'text-sm'}`}>
            {answer.hasRecorded ? String(answer.recorded) : 'Not auto-checked'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// Read-only field showing the claimant's requested value (date or time).
function RequestedField({ label, value, className = '' }) {
  const { isDark } = useAppearance();

  return (
    <View className={className}>
      <View className="flex-row items-center justify-between">
        <Text className="text-xs font-bold text-[#16233F] dark:text-slate-100">{label}</Text>
        <View className="flex-row items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950 px-2 py-0.5">
          <Clock size={10} color={isDark ? '#FCD34D' : '#B45309'} />
          <Text className="text-[9px] font-extrabold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Requested
          </Text>
        </View>
      </View>
      <View className="mt-2 rounded-xl border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 px-3 py-3">
        <Text className="text-sm font-bold text-[#16233F] dark:text-slate-100">
          {value || 'Not provided'}
        </Text>
      </View>
    </View>
  );
}

export default function ClaimVerificationScreen({ route, navigation }) {
  const { claim, readOnly = false } = route.params || {};
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { isDark } = useAppearance();
  const { confirmationModal, showFeedback, showConfirm } = useConfirmationModal();

  // Read-only: the claimant's requested schedule is what gets saved.
  const requestedDate = claim?.meeting_date || '';
  const requestedTime = claim?.meeting_time || '';
  const hasRequestedSchedule = Boolean(requestedDate && requestedTime);

  const [schedulingModalVisible, setSchedulingModalVisible] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [declining, setDeclining] = useState(false);

  // True while the "Not the Owner" request is in flight (Scheduled claims).
  // Drives the full-screen loading overlay.
  const [markingNotOwner, setMarkingNotOwner] = useState(false);

  // ----------------------------------------------------------
  // SCHEDULE MODAL SIZING
  //
  // The card is header + scrollable body + fixed footer (Cancel /
  // Confirm). The footer is deliberately NOT inside the ScrollView, so
  // the buttons are always fully visible no matter how many answers the
  // comparison list shows.
  //
  // The body's max height is computed in pixels from the card's max
  // height minus the measured header and footer. That's deterministic;
  // relying on flex-shrink inside an auto-height, percentage-capped
  // parent is what left the old layout taller than the card and let
  // `overflow-hidden` slice the buttons in half.
  // ----------------------------------------------------------
  const [modalHeaderHeight, setModalHeaderHeight] = useState(0);
  const [modalFooterHeight, setModalFooterHeight] = useState(0);

  const modalMaxHeight = Math.min(
    windowHeight * 0.85,
    windowHeight - insets.top - insets.bottom - 32
  );
  const modalBodyMaxHeight = Math.max(
    120,
    modalMaxHeight - modalHeaderHeight - modalFooterHeight
  );

  // Full item record for the claim's item, fetched the same way
  // FoundItems.jsx / the web Review modal does, so the answer
  // comparison has the real verification_answer_N values to check
  // against instead of whatever (possibly trimmed) payload the claims
  // list embedded.
  const [fullItem, setFullItem] = useState(null);
  const [itemLoading, setItemLoading] = useState(false);
  const [itemError, setItemError] = useState('');

  // True once staff has pressed "Approve" on this claim (this session),
  // or restored from the claim's own persisted flag. Only used to record
  // `staff_approved_despite_mismatch` when an approved claim had
  // mismatched answers — it no longer decides which buttons are shown.
  const [approvedMismatch, setApprovedMismatch] = useState(
    isMismatchApproved(claim)
  );

  const itemId =
    claim?.item_details?.id ?? claim?.item?.id ?? claim?.item_id ?? claim?.item;

  useEffect(() => {
    if (!itemId) return;

    let cancelled = false;
    setItemLoading(true);
    setItemError('');

    (async () => {
      try {
        const response = await getItemById(itemId);
        const data = Array.isArray(response)
          ? response[0]
          : response?.results
            ? response.results[0]
            : response;

        if (!cancelled) setFullItem(data || null);
      } catch (error) {
        console.error('Failed to load item details for claim review:', error);
        if (!cancelled) {
          setItemError('Could not load the recorded answers for this item.');
        }
      } finally {
        if (!cancelled) setItemLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [itemId]);

  const comparison = useMemo(
    () => buildAnswerComparison(claim, fullItem),
    [claim, fullItem]
  );

  // Mismatches first, then matches, then not-auto-checked — same order
  // as the web AnswerComparisonList.
  const sortedComparison = useMemo(() => {
    const rank = (isMatch) => (isMatch === false ? 0 : isMatch === true ? 1 : 2);
    return [...comparison].sort((a, b) => rank(a.isMatch) - rank(b.isMatch));
  }, [comparison]);

  // Still counted so the warning banner and the comparison cards can show
  // which answers don't match — but it is INFORMATION ONLY now. It does
  // not decide which buttons appear and does not block scheduling.
  const mismatchCount = comparison.filter((a) => a.isMatch === false).length;

  // ----------------------------------------------------------
  // WHICH BUTTONS TO SHOW — based on the claim's STATUS only
  // (Claim.status on the backend: Pending / Scheduled / Approved /
  // Declined):
  //   - Pending   -> DECLINE + APPROVE & SCHEDULE
  //   - Scheduled -> BACK + NOT THE OWNER
  //   - Declined (including "Not the Owner") -> no buttons at all; the
  //     arrow in the header is the way back.
  //   - anything else (Approved / Timed Out / Closed / Released) -> BACK
  //     only, since the claim is already resolved.
  // A claim with no status at all is treated as Pending.
  // ----------------------------------------------------------
  const claimStatus = normalize(claim?.status) || 'pending';
  // Declined claims are opened read-only from the Declined and Not Owner
  // tabs (ItemsScreen passes readOnly for them).
  const isDeclinedClaim = readOnly || DECLINED_STATUSES.includes(claimStatus);
  const isPending = !isDeclinedClaim && claimStatus === 'pending';
  const isScheduled = !isDeclinedClaim && claimStatus === 'scheduled';
  // The claimant missed the staff-confirmed meeting. Like any other
  // resolved claim it only gets the BACK button; the claimant re-claims
  // from My Claim Requests.
  const isTimedOut = claimStatus === 'timed out';
  // Earlier meetings this claimant missed for the same item.
  const missedCount = Number(claim?.missed_meetings || 0);

  // Read straight off the claim record (i.e. only true if this claim
  // was already approved and saved on a PREVIOUS pass), independent of
  // the in-session `approvedMismatch` state. Used by the top banner so
  // it doesn't change label/color the instant "Approve & Schedule" is
  // pressed this session — only once the approval is actually persisted.
  const persistedMismatchApproved = isMismatchApproved(claim);

  if (!claim) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-slate-950 p-4">
        <Text className="text-sm font-semibold text-slate-500 dark:text-slate-400">
          No claim details available.
        </Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="mt-4 rounded-lg bg-[#1b2061] dark:bg-indigo-600 px-4 py-2"
        >
          <Text className="text-xs font-bold text-white">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const itemDetails = fullItem || getClaimItem(claim);
  const alreadyClaimed = isItemAlreadyClaimed(claim, fullItem);
  const statusBadge = STATUS_BADGE[claimStatus] || STATUS_BADGE.pending;

  // Formatted for display; requestedDate itself stays YYYY-MM-DD for saving.
  const requestedDateLabel = formatDisplayDate(requestedDate);
  // Whether a moderator/admin has already confirmed this schedule.
  const staffConfirmed = Boolean(claim.staff_scheduled) || isScheduled;

  const handleApprove = () => {
    setApprovedMismatch(true);
    setSchedulingModalVisible(true);
  };

  // DECLINE — confirm modal -> full-screen loading modal -> success/error
  // modal -> back to the list. Same process as Not the Owner below; the buttons
  // themselves never show a spinner.
  const handleDecline = () => {
    const saveDecline = async () => {
      setDeclining(true);

      let failure = null;

      try {
        // Same request as the website's Decline button: PATCH
        // claim/decline/<id>/ with the reason. The backend sets the
        // status itself, so no status is sent from here.
        // The short wait keeps the loader visible long enough to read,
        // even on a fast connection.
        await Promise.all([
          declineClaim(
            claim.id,
            mismatchCount > 0 ? AUTO_DECLINE_REASON : GENERIC_DECLINE_REASON
          ),
          wait(600),
        ]);
      } catch (error) {
        console.error('Failed to decline claim:', error);
        failure = error;
      } finally {
        // Remove the loader first, then show the result modal.
        setDeclining(false);
      }

      if (failure) {
        showFeedback({
          title: 'Decline failed',
          message:
            getServerMessage(failure) ||
            'Could not decline this claim. Please try again.',
          tone: 'error',
        });
      } else {
        showFeedback({
          title: 'Claim declined',
          message: 'This claim has been declined.',
          tone: 'success',
          onClose: () => navigation.goBack(),
        });
      }
    };

    showConfirm({
      title: 'Decline this claim?',
      message: 'The claimant will not be scheduled for a verification meeting.',
      tone: 'warning',
      confirmLabel: 'Decline',
      cancelLabel: 'Cancel',
      destructive: true,
      // The save promise is deliberately not returned to the confirmation
      // dialog, so its button doesn't switch into its own loading state —
      // the loading modal shows progress instead.
      onConfirm: () => {
        void saveDecline();
      },
    });
  };

  // NOT THE OWNER (Scheduled claims) — confirm modal -> full-screen loading
  // modal -> success/error modal -> back to the list.
  //
  // Same request as the website's "Not the Owner" button: PATCH
  // claim/decline/<id>/ with not_owner: true. The backend saves the claim
  // as Declined with not_owner set, so it moves to the Not Owner tab, and
  // it sends the claimant no email (staff already told them in person).
  const handleNotOwner = () => {
    const saveNotOwner = async () => {
      setMarkingNotOwner(true);

      let failure = null;

      try {
        // The short wait keeps the loader visible long enough to read,
        // even on a fast connection.
        await Promise.all([
          declineClaim(claim.id, NOT_OWNER_REASON, { not_owner: true }),
          wait(600),
        ]);
      } catch (error) {
        console.error('Failed to mark claim as not the owner:', error);
        failure = error;
      } finally {
        // Remove the loader first, then show the result modal.
        setMarkingNotOwner(false);
      }

      if (failure) {
        showFeedback({
          title: 'Could not update claim',
          message: getServerMessage(failure) || 'Please try again.',
          tone: 'error',
        });
      } else {
        showFeedback({
          title: 'Marked as not the owner',
          message: 'This claim has been moved to the Not Owner list.',
          tone: 'success',
          onClose: () => navigation.goBack(),
        });
      }
    };

    showConfirm({
      title: 'Not the owner?',
      message:
        'This claim will be declined and the claimant will not be able to claim this item again.',
      tone: 'warning',
      confirmLabel: 'Not the Owner',
      cancelLabel: 'Cancel',
      destructive: true,
      // The save promise is deliberately not returned to the confirmation
      // dialog, so its button doesn't switch into its own loading state —
      // the loading modal shows progress instead.
      onConfirm: () => {
        void saveNotOwner();
      },
    });
  };

  const handleSaveMeeting = async () => {
    if (!hasRequestedSchedule) {
      showFeedback({
        title: 'No requested schedule',
        message: "The claimant didn't provide a meeting date and time.",
        tone: 'warning',
      });
      return;
    }

    // Shows the loading modal (rendered inside the Schedule modal, on top
    // of it). The Confirm Schedule button itself never shows a spinner.
    setScheduling(true);

    let failure = null;

    try {
      // `staff_scheduled: true` marks this meeting as explicitly
      // confirmed by a moderator/admin through this screen, matching
      // the web Review → Schedule → Confirm flow.
      // `staff_approved_despite_mismatch: true` is only sent when staff
      // approved a claim that actually has mismatched answers, so the
      // record of "approved despite a mismatch" is still kept.
      // The short wait keeps the loader visible long enough to read,
      // even on a fast connection.
      await Promise.all([
        scheduleMeeting(claim.id, {
          meeting_date: requestedDate,
          meeting_time: requestedTime,
          staff_scheduled: true,
          ...(approvedMismatch && mismatchCount > 0
            ? { staff_approved_despite_mismatch: true }
            : {}),
        }),
        wait(600),
      ]);
    } catch (error) {
      console.error('Failed to schedule meeting:', error);
      failure = error;
    } finally {
      // Remove the loader first, then show the result modal.
      setScheduling(false);
    }

    if (failure) {
      showFeedback({
        title: 'Scheduling failed',
        message:
          getServerMessage(failure) ||
          'Could not schedule the meeting. Please try again.',
        tone: 'error',
      });
      return;
    }

    // The Schedule modal stays open underneath this message and is
    // closed together with the screen when the user taps "Okay" —
    // that avoids dismissing one modal and presenting another in the
    // same tick, which iOS can drop.
    showFeedback({
      title: 'Meeting scheduled',
      message:
        'The claimant will receive a confirmation email if an email address was provided.',
      tone: 'success',
      detail: {
        label: 'VERIFICATION MEETING',
        value: `${requestedDateLabel} · ${requestedTime}`,
      },
      onClose: () => {
        setSchedulingModalVisible(false);
        navigation.goBack();
      },
    });
  };

  // ----------------------------------------------------------
  // LOADING MODAL
  //
  // One full-screen loader shared by Decline, Approve & Schedule and
  // Not the Owner, so none of the buttons show a spinner of their own. It is a
  // plain View overlay rather than a Modal, so it can appear right after
  // a confirmation modal closes. While the Schedule modal is open it is
  // rendered inside that modal (see below) so it sits on top of it.
  // ----------------------------------------------------------
  const loadingCopy = declining
    ? {
        title: 'Declining claim...',
        subtitle: 'Please wait while we update this claim.',
      }
    : scheduling
      ? {
          title: 'Scheduling meeting...',
          subtitle: 'Please wait while we confirm the verification meeting.',
        }
      : markingNotOwner
        ? {
            title: 'Updating claim...',
            subtitle: 'Please wait while we mark this claim as not the owner.',
          }
        : null;

  const loadingOverlay = loadingCopy ? (
    <View
      className="absolute inset-0 items-center justify-center bg-[#1b2061]/45 dark:bg-black/60"
      pointerEvents="auto"
    >
      <View className="w-[78%] items-center rounded-2xl bg-white dark:bg-slate-800 px-6 py-7 shadow-lg">
        <ActivityIndicator size="large" color={isDark ? '#C7D2FE' : '#1b2061'} />
        <Text className="mt-4 text-center text-base font-bold text-[#1b2061] dark:text-indigo-200">
          {loadingCopy.title}
        </Text>
        <Text className="mt-1 text-center text-sm text-[#666] dark:text-slate-400">
          {loadingCopy.subtitle}
        </Text>
      </View>
    </View>
  ) : null;

  return (
    <View className="flex-1 bg-white dark:bg-slate-950">
      <StatusBar style="light" backgroundColor="#1b2061" translucent={false} />

      {/* HEADER */}
      <SafeAreaView edges={['top']} className="rounded-b-3xl bg-[#1b2061]">
        <View className="flex-row items-center px-4 pb-6 pt-2">
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={() => navigation.goBack()}
            className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-white/10"
          >
            <ChevronLeft size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View className="flex-1">
            <Text className="text-[12px] font-bold tracking-widest text-white/60 uppercase">
              ADMIN
            </Text>
            <Text className="text-2xl font-bold text-white">
              Claim Verification
            </Text>
          </View>

          {/* Shows the claim's real status, same source as the buttons. */}
          <View className={`rounded-full px-3 py-1 ${statusBadge.box}`}>
            <Text className={`text-[10px] font-bold ${statusBadge.text}`}>
              {claimStatus.toUpperCase()}
            </Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        className="flex-1 px-5 py-4"
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Item already resolved by hand from Found Items — this claim
            may be stale. Mirrors the web Review modal's purple banner. */}
        {alreadyClaimed ? (
          <View className="mb-4 flex-row rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50 dark:bg-violet-950 p-3">
            <CheckCircle2 size={16} color={isDark ? '#C4B5FD' : '#6D28D9'} />
            <Text className="ml-2 flex-1 text-xs font-semibold leading-5 text-violet-700 dark:text-violet-300">
              This item is already marked "Claimed". This claim may be outdated or refer
              to someone other than the person who picked the item up — double-check
              before acting on it further.
            </Text>
          </View>
        ) : null}

        {/* TIMED OUT — the claimant did not show up for the meeting staff
            confirmed. */}
        {isTimedOut ? (
          <View className="mb-4 flex-row rounded-xl border border-orange-300 dark:border-orange-900 bg-orange-50 dark:bg-orange-950 p-3">
            <Clock size={16} color={isDark ? '#FDBA74' : '#C2410C'} />
            <Text className="ml-2 flex-1 text-xs font-semibold leading-5 text-orange-700 dark:text-orange-300">
              This claim timed out: the claimant did not show up for the scheduled
              meeting. They can re-claim the item with a new date and time from My
              Claim Requests.
            </Text>
          </View>
        ) : null}

        {/* MISSED MEETINGS — this is a re-claim after an earlier no-show.
            Mirrors the website's orange banner. */}
        {missedCount > 0 ? (
          <View className="mb-4 flex-row rounded-xl border border-orange-300 dark:border-orange-900 bg-orange-50 dark:bg-orange-950 p-3">
            <AlertTriangle size={16} color={isDark ? '#FDBA74' : '#C2410C'} />
            <Text className="ml-2 flex-1 text-xs font-semibold leading-5 text-orange-700 dark:text-orange-300">
              {`Missed ${missedCount} previous meeting${missedCount === 1 ? '' : 's'} for this item. `}
              The ownership answers are the same as the original claim. After 3 missed
              meetings the claimant can no longer claim it online.
            </Text>
          </View>
        ) : null}

        {/* RED "WRONG ANSWER" BANNER — a warning only. It tells staff that
            some answers don't match, but the buttons below depend on the
            claim's status, not on this.

            Keys off `persistedMismatchApproved` (read straight off
            `claim`), not the in-session `approvedMismatch`, so this
            banner stays put while the Schedule modal is open and only
            changes the next time this claim is opened after a real
            save. */}
        {mismatchCount > 0 ? (
          <View
            className={`mb-4 flex-row rounded-xl border p-3 ${
              persistedMismatchApproved
                ? 'border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950'
                : 'border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950'
            }`}
          >
            <AlertTriangle
              size={16}
              color={
                persistedMismatchApproved
                  ? isDark
                    ? '#FCD34D'
                    : '#B45309'
                  : isDark
                    ? '#FDA4AF'
                    : '#BE123C'
              }
            />
            <Text
              className={`ml-2 flex-1 text-xs font-semibold leading-5 ${
                persistedMismatchApproved ? 'text-amber-700 dark:text-amber-300' : 'text-rose-700 dark:text-rose-300'
              }`}
            >
              {persistedMismatchApproved
                ? `${mismatchCount} answer${mismatchCount > 1 ? 's were' : ' was'} approved by staff despite not matching the recorded answer.`
                : isPending
                  ? `${mismatchCount} answer${mismatchCount > 1 ? "s don't" : " doesn't"} match the answer recorded on this item. Compare both sides below, then Approve to continue to scheduling anyway, or Decline to reject this claim.`
                  : `${mismatchCount} answer${mismatchCount > 1 ? "s don't" : " doesn't"} match the answer recorded on this item.`}
            </Text>
          </View>
        ) : null}

        <Text className="text-xs font-bold tracking-wide text-[#0E7895] dark:text-cyan-300">
          ITEM BEING CLAIMED
        </Text>
        <View className="mt-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3">
          <View className="flex-row">
            <View className="flex-1">
              <Text className="text-[11px] text-slate-400 dark:text-slate-500">Item</Text>
              <Text className="text-sm font-bold text-[#16233F] dark:text-slate-100">
                {itemDetails.title || `Item #${claim.item || ''}`}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-[11px] text-slate-400 dark:text-slate-500">Category</Text>
              <Text className="text-sm font-bold text-[#16233F] dark:text-slate-100">
                {itemDetails.category || 'Uncategorized'}
              </Text>
            </View>
          </View>

          <View className="mt-3 flex-row">
            <View className="flex-1">
              <Text className="text-[11px] text-slate-400 dark:text-slate-500">Location</Text>
              <Text className="text-sm font-bold text-[#16233F] dark:text-slate-100">
                {itemDetails.location || 'Not specified'}
              </Text>
            </View>
            <View className="flex-1">
              <Text className="text-[11px] text-slate-400 dark:text-slate-500">Item type</Text>
              <Text className="text-sm font-bold text-[#16233F] dark:text-slate-100">
                {itemDetails.type || 'Not specified'}
              </Text>
            </View>
          </View>
        </View>

        <Text className="mt-5 text-xs font-bold tracking-wide text-[#0E7895] dark:text-cyan-300">
          CLAIMANT INFORMATION
        </Text>
        <View className="mt-2 flex-row gap-2">
          <View className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 p-3">
            <Text className="text-[11px] text-slate-400 dark:text-slate-500">Name</Text>
            <Text className="text-sm font-bold text-[#16233F] dark:text-slate-100">
              {claim.claimant_name || 'Not specified'}
            </Text>
          </View>
          <View className="flex-1 rounded-xl border border-slate-300 dark:border-slate-700 p-3">
            <Text className="text-[11px] text-slate-400 dark:text-slate-500">Contact</Text>
            <Text className="text-sm font-bold text-[#16233F] dark:text-slate-100">
              {claim.claimant_contact || 'Not specified'}
            </Text>
          </View>
        </View>

        <View className="mt-2 rounded-xl border border-slate-300 dark:border-slate-700 p-3">
          <Text className="text-[11px] text-slate-400 dark:text-slate-500">Email</Text>
          <Text className="text-sm font-bold text-[#16233F] dark:text-slate-100">
            {claim.claimant_email || 'Not provided'}
          </Text>
        </View>

        {/* PREFERRED SCHEDULE — the date and time the claimant picked when
            submitting the claim (claim.meeting_date / claim.meeting_time),
            shown right on the review screen so the moderator has it as a
            basis while checking the answers, without opening the
            Schedule modal first. */}
        <Text className="mt-5 text-xs font-bold tracking-wide text-[#0E7895] dark:text-cyan-300">
          PREFERRED SCHEDULE (FROM CLAIMANT)
        </Text>
        <View className="mt-2 flex-row gap-2">
          <View className="flex-1 rounded-xl border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 p-3">
            <View className="flex-row items-center">
              <Calendar size={12} color={isDark ? '#FCD34D' : '#B45309'} />
              <Text className="ml-1 text-[11px] text-amber-700 dark:text-amber-300">
                Preferred date
              </Text>
            </View>
            <Text className="mt-1 text-sm font-bold text-[#16233F] dark:text-slate-100">
              {requestedDateLabel || 'Not provided'}
            </Text>
          </View>
          <View className="flex-1 rounded-xl border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 p-3">
            <View className="flex-row items-center">
              <Clock size={12} color={isDark ? '#FCD34D' : '#B45309'} />
              <Text className="ml-1 text-[11px] text-amber-700 dark:text-amber-300">
                Preferred time
              </Text>
            </View>
            <Text className="mt-1 text-sm font-bold text-[#16233F] dark:text-slate-100">
              {requestedTime || 'Not provided'}
            </Text>
          </View>
        </View>
        <Text className="mt-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
          {!hasRequestedSchedule
            ? "The claimant didn't provide a complete date and time."
            : isTimedOut
              ? 'The claimant did not show up for this meeting.'
              : staffConfirmed
              ? 'This schedule has been confirmed by staff.'
              : 'Requested by the claimant — not yet confirmed by staff.'}
        </Text>

        {/* ANSWER COMPARISON (STAFF ONLY) — per-question comparison,
            same as the web Review modal: claimant's answer vs. the
            item's recorded answer, matched by question. Falls back to
            the parsed proof_description for legacy claims that predate
            the question_N/answer_N columns. */}
        <View className="mt-5 flex-row items-center justify-between">
          <Text className="text-xs font-bold tracking-wide text-[#0E7895] dark:text-cyan-300">
            ANSWER COMPARISON (STAFF ONLY)
          </Text>
          {mismatchCount > 0 ? (
            <View className="flex-row items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-950 px-2 py-0.5">
              <AlertTriangle size={11} color={isDark ? '#FDA4AF' : '#BE123C'} />
              <Text className="text-[10px] font-bold text-rose-700 dark:text-rose-300">
                {mismatchCount} mismatch{mismatchCount > 1 ? 'es' : ''}
              </Text>
            </View>
          ) : (
            <View className="flex-row items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5">
              <CheckCircle2 size={11} color={isDark ? '#6EE7B7' : '#047857'} />
              <Text className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">No flags</Text>
            </View>
          )}
        </View>

        <View className="mt-2">
          {itemLoading ? (
            <View className="flex-row items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3">
              <ActivityIndicator size="small" color={isDark ? '#C7D2FE' : '#1b2061'} />
              <Text className="ml-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Loading recorded answers…
              </Text>
            </View>
          ) : sortedComparison.length > 0 ? (
            <>
              {itemError ? (
                <Text className="mb-2 text-xs font-semibold text-rose-600 dark:text-rose-300">
                  {itemError}
                </Text>
              ) : null}

              {sortedComparison.map((answer) => (
                <AnswerComparisonCard key={answer.index} answer={answer} />
              ))}

              <Text className="mt-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                Claimants never see this comparison.
              </Text>
            </>
          ) : (
            <View className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3">
              <Text className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                No answers were recorded for this claim.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ACTION FOOTER — decided by the claim's STATUS only:
          - Pending:   Decline / Approve & Schedule
          - Scheduled: Back / Not the Owner
          - Declined or Not the Owner: no footer (header arrow goes back)
          - Anything else already resolved: Back only */}
      {isDeclinedClaim ? null : (
        <SafeAreaView
          edges={['bottom']}
          className="border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 px-4 py-3"
        >
          <View className="flex-row gap-3">
            {isPending ? (
              <>
                <TouchableOpacity
                  disabled={declining}
                  activeOpacity={0.6}
                  onPress={handleDecline}
                  className="flex-1 flex-row items-center justify-center rounded-xl bg-rose-600 py-3.5"
                >
                  <Text className="ml-2 text-xs font-bold text-white">DECLINE</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  disabled={declining}
                  activeOpacity={0.6}
                  onPress={handleApprove}
                  className="flex-[1.35] flex-row items-center justify-center rounded-xl bg-emerald-600 py-3.5"
                >
                  <Text className="ml-2 text-xs font-bold text-white">
                    APPROVE & SCHEDULE
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  disabled={scheduling || markingNotOwner}
                  activeOpacity={0.6}
                  onPress={() => navigation.goBack()}
                  className="flex-1 flex-row items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 py-3.5"
                >
                  <ChevronLeft size={17} color={isDark ? '#94A3B8' : '#64748B'} />
                  <Text className="ml-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                    BACK
                  </Text>
                </TouchableOpacity>

                {/* Scheduled claims: NOT THE OWNER (was ARCHIVE). */}
                {isScheduled ? (
                  <TouchableOpacity
                    disabled={markingNotOwner}
                    activeOpacity={0.6}
                    onPress={handleNotOwner}
                    className="flex-[1.35] flex-row items-center justify-center rounded-xl bg-rose-600 py-3.5"
                  >
                    <UserX size={17} color="#FFFFFF" />
                    <Text className="ml-2 text-xs font-bold text-white">
                      NOT THE OWNER
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </View>
        </SafeAreaView>
      )}

      {/* Scheduling Modal — centered dialog (fade + centered container).
          Three stacked parts: header, scrollable body, fixed footer.
          Only the body scrolls; the Cancel / Confirm buttons stay put. */}
      <Modal
        visible={schedulingModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !scheduling && setSchedulingModalVisible(false)}
      >
        <View className="flex-1 items-center justify-center bg-black/40 dark:bg-black/60 px-4">
          <View
            className="w-full max-w-md overflow-hidden rounded-3xl bg-white dark:bg-slate-900"
            style={{ maxHeight: modalMaxHeight }}
          >
            {/* Header */}
            <View
              onLayout={(e) => setModalHeaderHeight(e.nativeEvent.layout.height)}
              className="flex-row items-center justify-between bg-[#1b2061] px-5 py-4"
            >
              <View>
                <Text className="text-lg font-bold text-white">
                  Schedule Verification
                </Text>
                <Text className="text-xs text-white/85">
                  Claimant: {claim.claimant_name}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => !scheduling && setSchedulingModalVisible(false)}
              >
                <Text className="text-sm font-bold text-white">Close</Text>
              </TouchableOpacity>
            </View>

            {/* Body — the only part that scrolls */}
            <ScrollView
              style={{ maxHeight: modalBodyMaxHeight }}
              contentContainerStyle={{ padding: 20 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Restated here too, so it's clear on this screen why a
                  flagged claim is still schedulable. */}
              {approvedMismatch && mismatchCount > 0 ? (
                <View className="mb-4 flex-row rounded-xl border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 p-3">
                  <ThumbsUp size={15} color={isDark ? '#FCD34D' : '#B45309'} />
                  <Text className="ml-2 flex-1 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                    {mismatchCount} mismatch{mismatchCount > 1 ? 'es were' : ' was'}{' '}
                    approved by staff.
                  </Text>
                </View>
              ) : null}

              {/* Same mismatch / question / answer comparison shown on
                  the Claim Verification screen, so staff doesn't have to
                  close this modal just to re-check what was flagged.
                  Reuses `sortedComparison` and its loading state —
                  nothing is re-fetched. */}
              <View className="mb-5">
                <View className="mb-2 flex-row items-center justify-between">
                  <Text className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Answer Comparison
                  </Text>
                  {mismatchCount > 0 ? (
                    <View className="flex-row items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-950 px-2 py-0.5">
                      <AlertTriangle size={11} color={isDark ? '#FDA4AF' : '#BE123C'} />
                      <Text className="text-[10px] font-bold text-rose-700 dark:text-rose-300">
                        {mismatchCount} mismatch{mismatchCount > 1 ? 'es' : ''}
                      </Text>
                    </View>
                  ) : (
                    <View className="flex-row items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5">
                      <CheckCircle2 size={11} color={isDark ? '#6EE7B7' : '#047857'} />
                      <Text className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">No flags</Text>
                    </View>
                  )}
                </View>

                {itemLoading ? (
                  <View className="flex-row items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3">
                    <ActivityIndicator size="small" color={isDark ? '#C7D2FE' : '#1b2061'} />
                    <Text className="ml-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Loading recorded answers…
                    </Text>
                  </View>
                ) : sortedComparison.length > 0 ? (
                  sortedComparison.map((answer) => (
                    <AnswerComparisonCard key={answer.index} answer={answer} compact />
                  ))
                ) : (
                  <View className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3">
                    <Text className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                      No answers were recorded for this claim.
                    </Text>
                  </View>
                )}
              </View>

              {/* Meeting Date and Meeting Time — read-only. These show
                  the claimant's requested values (claim.meeting_date /
                  claim.meeting_time), and those same values are what
                  handleSaveMeeting sends. Staff can no longer edit them
                  from here. */}
              <RequestedField label="Meeting Date" value={requestedDateLabel} />
              <RequestedField
                label="Meeting Time"
                value={requestedTime}
                className="mt-5"
              />

              <View className="mt-5 rounded-xl bg-blue-50 dark:bg-blue-950 p-3">
                <Text className="text-xs text-blue-700 dark:text-blue-300">
                  The claimant will receive an email containing the verification
                  meeting date, time, and location.
                </Text>
              </View>
            </ScrollView>

            {/* Footer — fixed, outside the ScrollView, so the buttons can
                never be clipped or scrolled out of reach. */}
            <View
              onLayout={(e) => setModalFooterHeight(e.nativeEvent.layout.height)}
              className="flex-row gap-2 border-t border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900 px-5 pb-5 pt-3"
            >
              <TouchableOpacity
                disabled={scheduling}
                onPress={() => setSchedulingModalVisible(false)}
                className="flex-1 items-center rounded-xl bg-slate-100 dark:bg-slate-800 py-3"
              >
                <Text className="text-xs font-bold text-slate-600 dark:text-slate-300">
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={scheduling || !hasRequestedSchedule}
                onPress={handleSaveMeeting}
                className={`flex-1 items-center rounded-xl bg-[#1b2061] dark:bg-indigo-600 py-3 ${
                  !hasRequestedSchedule ? 'opacity-50' : ''
                }`}
              >
                <Text className="text-xs font-bold text-white">
                  Confirm Schedule
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Loading modal for Confirm Schedule — rendered inside the
            Schedule modal so it covers it. */}
        {schedulingModalVisible ? loadingOverlay : null}

        {/* While the Schedule modal is open, messages render INSIDE it so
            they present on top of it (a sibling modal can fail to show
            over another modal on iOS). */}
        {schedulingModalVisible ? confirmationModal : null}
      </Modal>

      {/* Loading modal for Decline and Not the Owner — in this screen's own
          tree. While the Schedule modal is open it is rendered inside
          that modal instead (above). */}
      {schedulingModalVisible ? null : loadingOverlay}

      {/* Everywhere else, the modal lives at the screen level. */}
      {schedulingModalVisible ? null : confirmationModal}
    </View>
  );
}