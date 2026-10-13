import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FiCalendar,
  FiEye,
  FiSearch,
  FiX,
  FiCheck,
  FiArrowRight,
  FiChevronLeft,
  FiChevronRight,
  FiArrowLeft,
  FiAlertTriangle,
  FiUserX,
  FiSliders,
} from "react-icons/fi";
import {
  getClaims,
  getItemById,
  scheduleMeeting,
  declineClaim,
  getBlockedSlots,
} from "../api/api";
import ManageSlotsModal from "../components/ManageSlotsModal";
import { logActivity } from "../utils/Activitylog";
import Pagination from "../components/Pagination";
import { isClaimAutoArchived } from "../utils/claimArchive";

// Saturdays: 8 AM - 11 AM only. Sundays: no meeting slots.
// (The server enforces the same rule.)
const SATURDAY_SLOTS = ["8:00 AM - 9:00 AM", "9:00 AM - 10:00 AM", "10:00 AM - 11:00 AM"];

const weekdayOf = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`);
  return isNaN(d.getTime()) ? null : d.getDay(); // 0 = Sunday, 6 = Saturday
};

const slotsAllowedOn = (dateStr, slots) => {
  const day = weekdayOf(dateStr);
  if (day === 0) return [];
  if (day === 6) return slots.filter((s) => SATURDAY_SLOTS.includes(s));
  return slots;
};

import { confirmAction } from "../components/ConfirmDialog";

// ==========================================================
// ANSWER COMPARISON (STAFF-ONLY)
//
// ClaimModal.jsx intentionally never receives the "correct" answer for
// a verification question — only the option list (verification_options_N)
// is sent to the claimant, so there is nothing for them to reverse-engineer
// from the network tab. The correct answer only ever needs to be compared
// here, on the authenticated staff view, once a claim has already been
// submitted.
//
// ASSUMPTION: the recorded correct answer for question N lives on the
// item as `verification_answer_N` (mirroring the existing
// verification_question_N / verification_options_N naming). If your
// backend/serializer uses a different field name (e.g. correct_answer_N),
// update `getRecordedAnswer` below to match.
// ==========================================================

const normalize = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase();

// Flexible ID lookup across MongoDB / PostgreSQL formats.
const getClaimId = (claim) => claim?.id ?? claim?._id ?? claim?.claim_id ?? null;

// `itemOverride`, when provided, is a FULL item record fetched fresh via
// getItemById() (see fetchFullItem below) — the same source of truth
// FoundItems.jsx reads from when staff edits an item's verification
// answers. It's preferred over claim.item_details/claim.item because
// the claims list endpoint (getClaims()) is not guaranteed to return
// verification_answer_N on the embedded item. Falls back to whatever's
// already on the claim if the fetch hasn't completed yet or failed, so
// something still renders.
const getRecordedAnswer = (claim, index, itemOverride) => {
  const n = index + 1;
  const item = itemOverride || claim?.item_details || claim?.item || {};

  return (
    item[`verification_answer_${n}`] ??
    item[`correct_answer_${n}`] ??
    null
  );
};

// FALLBACK FOR LEGACY CLAIMS (pre-dating question_1..4 columns)
//
// ClaimModal.jsx has always built a `proof_description` string shaped like:
//   "1. <question>\nAnswer: <answer>\n\n2. <question>\nAnswer: <answer>..."
// Any claim submitted before the question_N/answer_N columns were added
// has them blank, so this parses proof_description back into the same
// {index, question, answer} shape so the panel still shows something.
//
// There is no admin-recorded correct answer to compare against in this
// legacy shape, so every parsed row is always isMatch: null ("Not
// auto-checked") — this never invents a false mismatch, and a legacy
// claim is never blocked from scheduling by the mismatch rule.
const parseLegacyProof = (proofDescription) => {
  if (!proofDescription || typeof proofDescription !== "string") return [];

  const blocks = proofDescription.split(/\n\n+/);
  const parsed = [];

  blocks.forEach((block) => {
    const match = block.match(/^\s*(\d+)\.\s*([\s\S]*?)\nAnswer:\s*([\s\S]*)$/i);
    if (!match) return; // skips the "Other Unique Description" block too — no "Answer:" line there

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

// Builds a per-question comparison list for the Review modal (and the
// Schedule modal's answer-check panel). Only questions that actually
// have a recorded correct answer to compare against get a match/
// mismatch flag — free-text category-fallback questions (Accessories,
// ID, etc., which have no admin-defined correct answer) are shown as
// "not auto-checked" instead of silently treated as a mismatch.
//
// Falls back to parseLegacyProof() when question_1..4 are all empty.
const buildAnswerComparison = (claim, itemOverride) => {
  if (!claim) return [];

  const structured = [1, 2, 3, 4]
    .map((n) => {
      const question = claim[`question_${n}`];
      const answer = claim[`answer_${n}`];

      if (!question) return null;

      const recorded = getRecordedAnswer(claim, n - 1, itemOverride);
      const hasRecorded =
        recorded !== null && recorded !== undefined && String(recorded).trim() !== "";

      const isMatch = hasRecorded
        ? normalize(recorded) === normalize(answer)
        : null; // null = no recorded answer to check against

      return {
        index: n,
        question,
        answer,
        recorded,
        hasRecorded,
        isMatch,
      };
    })
    .filter(Boolean);

  if (structured.length > 0) return structured;

  return parseLegacyProof(claim.proof_description);
};

// Number of questions on this claim flagged against the item's recorded
// correct answer. Used both for the warning banners and — since the
// mismatch rule BLOCKS scheduling rather than merely advising — as the
// gate on every scheduling control.
const countMismatches = (claim, itemOverride) =>
  buildAnswerComparison(claim, itemOverride).filter((a) => a.isMatch === false).length;

// A claim is "pending review" ONLY while it has no meeting slot yet.
// This mainly covers legacy/edge cases — under the current
// ClaimModal.jsx, every claim submits with a claimant-picked slot
// regardless of whether their answers matched. See needsAttention below
// for the fuller rule.
const isPendingReview = (claim) =>
  !!claim && (!claim.meeting_date || !claim.meeting_time);

// True when at least one of this claim's answers was flagged against
// the item's recorded correct answer — regardless of whether a meeting
// slot exists yet.
const hasMismatch = (claim) => countMismatches(claim) > 0;

// True once staff has explicitly approved a flagged claim and scheduled
// it anyway (persisted via scheduleMeeting's
// `staff_approved_despite_mismatch` field).
//
// ASSUMPTION: scheduleMeeting's serializer accepts and RETURNS
// `staff_approved_despite_mismatch` on the claim object from
// getClaims(). Otherwise an approved-and-scheduled mismatched claim will
// keep reappearing as Pending every time the list refreshes.
const isMismatchApproved = (claim) => !!claim?.staff_approved_despite_mismatch;

// True once an admin/moderator has confirmed this claim's meeting through
// Continue to Schedule -> Confirm Schedule (or Approve). schedule_meeting in
// claim/views.py saves staff_scheduled = True. The claim stays in the
// Schedule Meeting table and is marked "Scheduled by Staff".
const isStaffScheduled = (claim) => claim?.staff_scheduled === true;

// How many earlier meetings this claimant missed for this same item
// (backend claim/noshow.py). Shown as "Missed N previous meeting(s)".
const missedMeetings = (claim) => Number(claim?.missed_meetings || 0);

// Declined with the "Not the Owner" button (backend Claim.not_owner).
// These are listed in the Declined tab together with every other
// declined claim; a remark tells the two kinds apart.
const isNotOwner = (claim) => claim?.not_owner === true;
const missedLabel = (n) => `Missed ${n} previous meeting${n === 1 ? "" : "s"}`;

// True once staff has explicitly declined a claim through the Review
// modal's "Decline" button (see handleDecline below).
//
// Claim.STATUS_CHOICES in models.py uses "Declined", but older data /
// backends may store "rejected", "declined" or "denied", and the value
// may live on `status` or `claim_status` (or a boolean flag), so all of
// those are accepted here (normalize() lower-cases before comparing).
const DECLINED_STATUSES = ["rejected", "declined", "decline", "denied"];

const isDeclined = (claim) =>
  !!claim &&
  (DECLINED_STATUSES.includes(normalize(claim.status)) ||
    DECLINED_STATUSES.includes(normalize(claim.claim_status)) ||
    claim.is_declined === true ||
    claim.declined === true);

// ==========================================================
// LOCAL DECLINED-CLAIMS STORE (safety net)
//
// The Declined tab is driven by whatever getClaims() returns. If the
// backend's declineClaim endpoint doesn't persist status "Declined"
// (or the claims list endpoint filters declined claims out), declined
// claims would vanish from every tab and never reach the Declined tab.
//
// To guarantee a declined claim always lands in the Declined tab, each
// successful decline is also remembered in this browser's localStorage
// (keyed by claim id, with a snapshot of the claim). On every load():
//   - a claim the server still returns but not as declined is marked
//     "Declined" locally, and
//   - a claim the server no longer returns at all is re-added from the
//     snapshot.
//
// NOTE: this is per-browser. The real fix is for the backend to save
// status = "Declined" and keep returning those claims from getClaims().
// ==========================================================
const DECLINED_STORE_KEY = "claimRequests.declinedClaims";

const readDeclinedStore = () => {
  try {
    const raw = localStorage.getItem(DECLINED_STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const saveDeclinedClaim = (id, snapshot) => {
  try {
    const store = readDeclinedStore();
    store[String(id)] = snapshot;
    localStorage.setItem(DECLINED_STORE_KEY, JSON.stringify(store));
  } catch (err) {
    console.error("Could not remember declined claim locally:", err);
  }
};

// True when a saved snapshot is NOT the same claim as the one the server
// returned under that id. Claim ids can be reused after the database is
// reset or recreated, so a brand-new claim could get the id of a claim
// declined earlier in this browser — and would then wrongly be shown as
// declined. The claim_date (set once, when the claim is created) tells
// them apart.
const isStaleSnapshot = (saved, serverClaim) => {
  const savedDate = saved?.claim_date;
  const serverDate = serverClaim?.claim_date;
  if (!savedDate || !serverDate) return false;
  const savedTime = new Date(savedDate).getTime();
  const serverTime = new Date(serverDate).getTime();
  if (Number.isNaN(savedTime) || Number.isNaN(serverTime)) {
    return String(savedDate) !== String(serverDate);
  }
  return savedTime !== serverTime;
};

const forgetDeclinedClaims = (ids) => {
  if (!ids.length) return;
  try {
    const store = readDeclinedStore();
    ids.forEach((id) => delete store[String(id)]);
    localStorage.setItem(DECLINED_STORE_KEY, JSON.stringify(store));
  } catch (err) {
    console.error("Could not clean up the local declined store:", err);
  }
};

const mergeDeclinedStore = (serverClaims) => {
  const store = readDeclinedStore();
  const storedIds = Object.keys(store);
  if (storedIds.length === 0) return serverClaims;

  const seen = new Set();
  const staleIds = [];

  const merged = serverClaims.map((c) => {
    const id = String(getClaimId(c));
    seen.add(id);
    let saved = store[id];

    // A different (newer) claim that reuses an old declined claim's id:
    // never mark it declined, and drop the old entry.
    if (saved && isStaleSnapshot(saved, c)) {
      staleIds.push(id);
      saved = null;
    }

    if (saved && !isDeclined(c)) {
      return {
        ...c,
        status: "Declined",
        decline_reason: c.decline_reason || saved.decline_reason,
        decline_date: c.decline_date || saved.decline_date,
      };
    }
    return c;
  });

  // Claims the server stopped returning (e.g. it filters out declined
  // ones) are restored from the saved snapshot.
  storedIds.forEach((id) => {
    if (!seen.has(id)) merged.push({ ...store[id], status: "Declined" });
  });

  forgetDeclinedClaims(staleIds);
  return merged;
};

// A claim belongs in "Needs Attention" (status: Pending) while it's
// still waiting on staff — either it has no meeting slot yet
// (isPendingReview), OR it has a flagged mismatch staff hasn't
// explicitly approved yet (hasMismatch && !isMismatchApproved).
//
// A declined claim is never pending — staff has already made the call,
// and it lives in the Declined tab instead.
const needsAttention = (claim) =>
  !isDeclined(claim) &&
  (isPendingReview(claim) || (hasMismatch(claim) && !isMismatchApproved(claim)));

// ==========================================================
// ITEM-ALREADY-CLAIMED DETECTION
//
// FoundItems.jsx's "Mark as Claimed" button sets the ITEM's status
// straight to "Claimed" via editLostItem — completely outside this
// claim-request flow. Those claims are filtered OUT of the Needs
// Attention and Schedule Meeting tabs entirely (see visibleClaims
// below), since the item is already resolved and nothing on this
// screen can act on it.
//
// `itemOverride`, when provided, is the full item record fetched via
// getItemById() for whichever claim is open in the Review/Schedule
// modals — the most current source of truth. Table rows fall back to
// the item payload getClaims() embedded on the claim.
// ==========================================================
const getItemStatus = (claim, itemOverride) => {
  const item = itemOverride || claim?.item_details || claim?.item || {};
  return item?.status || null;
};

const isItemAlreadyClaimed = (claim, itemOverride) =>
  normalize(getItemStatus(claim, itemOverride)) === "claimed";

// ==========================================================
// SHARED COMPARISON UI
//
// One two-column, divider-separated card per question: claimant's
// submitted answer on the left, the admin-recorded correct answer (set
// in FoundItems.jsx) on the right. Used by both the Review modal and
// the Schedule modal's inline "Answer Check" panel.
//
// `compact`: renders a tighter version for the Schedule modal.
//
// Mismatches are flagged in RED, while both the claimant's answer and
// the staff-recorded answer stay visible side-by-side underneath.
// ==========================================================

const AnswerComparisonList = ({ comparisons, compact = false }) => {
  const sorted = [...comparisons].sort((a, b) => {
    // Mismatches first, then matches, then not-auto-checked — keeps the
    // questions that need a human look at the top of the list.
    const rank = (isMatch) => (isMatch === false ? 0 : isMatch === true ? 1 : 2);
    return rank(a.isMatch) - rank(b.isMatch);
  });

  return (
    <div className={compact ? "space-y-2" : "space-y-3"}>
      {sorted.map((a) => (
        <div
          key={a.index}
          className={`overflow-hidden rounded-xl border ${
            a.isMatch === false
              ? "border-red-300"
              : a.isMatch === true
              ? "border-emerald-200"
              : "border-slate-200"
          }`}
        >
          {/* Question header */}
          <div
            className={`flex items-center justify-between gap-3 px-3 py-2 ${
              a.isMatch === false
                ? "bg-red-50"
                : a.isMatch === true
                ? "bg-emerald-50"
                : "bg-slate-50"
            }`}
          >
            <p
              className={`font-bold text-slate-600 ${
                compact ? "text-[10px] truncate" : "text-[11px]"
              }`}
            >
              {a.isMatch === false && (
                <FiAlertTriangle
                  className="mr-1 inline-block shrink-0 text-red-600"
                  size={compact ? 11 : 12}
                />
              )}
              {a.index}. {a.question}
            </p>
            <span
              className={`shrink-0 inline-flex items-center gap-1 rounded-full font-black uppercase ${
                compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"
              } ${
                a.isMatch === false
                  ? "bg-red-200 text-red-800"
                  : a.isMatch === true
                  ? "bg-emerald-200 text-emerald-800"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              {a.isMatch === false ? "Mismatch" : a.isMatch === true ? "Match" : "Not auto-checked"}
            </span>
          </div>

          {/* Two-column comparison, divided down the middle — always
              shows BOTH the claimant's answer and the staff-recorded
              answer, whether or not this question is flagged. */}
          <div className="grid grid-cols-1 divide-y divide-slate-200 bg-white sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <div className={compact ? "p-2" : "p-3"}>
              <p
                className={`mb-1 font-black uppercase tracking-wide text-slate-400 ${
                  compact ? "text-[9px]" : "text-[10px]"
                }`}
              >
                Claimant's Answer
              </p>
              <p
                className={`break-words font-bold ${
                  a.isMatch === false ? "text-red-700" : "text-slate-800"
                } ${compact ? "text-xs" : "text-sm"}`}
              >
                {a.answer || "—"}
              </p>
            </div>
            <div className={compact ? "p-2" : "p-3"}>
              <p
                className={`mb-1 font-black uppercase tracking-wide ${
                  a.isMatch === false ? "text-red-600" : "text-blue-600"
                } ${compact ? "text-[9px]" : "text-[10px]"}`}
              >
                Recorded Answer (Staff Only)
              </p>
              <p
                className={`break-words font-bold text-slate-800 ${
                  compact ? "text-xs" : "text-sm"
                }`}
              >
                {a.hasRecorded ? String(a.recorded) : "Not auto-checked"}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// Decline reasons sent along with declineClaim() (and included in the
// email to the claimant). Staff do not type these in.
//
// AUTO_DECLINE_REASON is used when the claim has flagged (mismatched)
// answers. GENERIC_DECLINE_REASON is used when a claim WITHOUT flagged
// answers is declined, so the claimant isn't told their answers were
// wrong when they weren't.
const AUTO_DECLINE_REASON = "The answers provided did not match our records.";
const GENERIC_DECLINE_REASON = "We were unable to verify your claim to this item.";
// Used by the "Not the Owner" button (staff found at/after verification
// that the claimant does not own the item).
const NOT_OWNER_REASON = "After verification, you were found not to be the owner of this item.";

// Why a declined claim was declined, used for the remark in the Declined
// table and at the top of the Review modal:
//   "notOwner" — declined with the "Not the Owner" button
//   "mismatch" — declined because answers didn't match the records
//   "other"    — declined without flagged answers (couldn't verify)
const getDeclineCategory = (claim) => {
  const reason = claim?.decline_reason || claim?.remarks || "";
  if (isNotOwner(claim) || reason === NOT_OWNER_REASON) return "notOwner";
  if (reason === AUTO_DECLINE_REASON || hasMismatch(claim)) return "mismatch";
  return "other";
};

const DECLINE_CATEGORY_LABEL = {
  notOwner: "Not the Owner",
  mismatch: "Mismatch",
  other: "Unable to Verify",
};


const ClaimRequests = () => {
  const navigate = useNavigate();
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selected, setSelected] = useState(null);
  const [showReview, setShowReview] = useState(false);

  // Full item record for whichever claim is currently open in the
  // Review/Schedule modals — fetched via getItemById() the same way
  // FoundItems.jsx does, so verification_answer_N (the staff-recorded
  // correct answers) is guaranteed to be present. Cleared whenever the
  // modal closes or a different claim is opened.
  const [fullItem, setFullItem] = useState(null);
  const [fullItemLoading, setFullItemLoading] = useState(false);

  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [sending, setSending] = useState(false);

  // True once staff has approved a claim with flagged (mismatched)
  // answers, overriding the automatic block so scheduling can continue
  // anyway. Initialized from the claim's own persisted
  // staff_approved_despite_mismatch flag when a claim is opened (see
  // openReview), but can also be set fresh via handleApprove.
  const [approvedMismatch, setApprovedMismatch] = useState(false);

  // Loading flag for the "Decline" action, separate from `sending`.
  const [declining, setDeclining] = useState(false);

  // Controls the decline confirmation modal shown before a decline is
  // actually submitted. The reason is automatic — there is no text box.
  // Decline is only available from inside the Review modal, so the
  // claim being declined is always `selected`.
  const [showDeclineConfirm, setShowDeclineConfirm] = useState(false);

  // True when Decline was clicked straight from a Needs Attention row
  // (no Review modal open). Keeps the Schedule modal hidden behind the
  // decline confirmation and lets "No" clear the selection.
  const [rowDecline, setRowDecline] = useState(false);

  // True when the decline confirmation was opened from the "Not the
  // Owner" button (changes the wording and the reason sent).
  const [notOwnerDecline, setNotOwnerDecline] = useState(false);

  // Claim currently being approved from a Needs Attention row.
  const [approvingId, setApprovingId] = useState(null);

  // The Review modal has the fresh full item record (`fullItem`), so the
  // mismatch check uses it for the most accurate answer comparison.
  const declineHasMismatch =
    !!selected && countMismatches(selected, fullItem) > 0;
  const declineReason = declineHasMismatch ? AUTO_DECLINE_REASON : GENERIC_DECLINE_REASON;

  const [search, setSearch] = useState("");

  // "Manage Slots" calendar + the upcoming disabled days/slots (used to
  // hide them in the Schedule modal's time picker).
  const [showManageSlots, setShowManageSlots] = useState(false);
  const [blockedSlots, setBlockedSlots] = useState([]);

  // Which table is currently visible — "attention" (default: Pending
  // claims), "resolved" (Scheduled + Approved claims) or "declined"
  // (claims staff has declined).
  const [activeTab, setActiveTab] = useState("attention");

  const [resolvedPage, setResolvedPage] = useState(1);
  const [attentionPage, setAttentionPage] = useState(1);
  const [declinedPage, setDeclinedPage] = useState(1);
  // Declined tab filter: "all" | "mismatch" | "notOwner" | "other".
  const [declineFilter, setDeclineFilter] = useState("all");

  const [notification, setNotification] = useState(null);

  // Fixed set of bookable time slots.
  const TIME_OPTIONS = [
    "8:00 AM - 9:00 AM",
    "9:00 AM - 10:00 AM",
    "10:00 AM - 11:00 AM",
    "11:00 AM - 12:00 PM",
    "1:00 PM - 2:00 PM",
    "2:00 PM - 3:00 PM",
    "3:00 PM - 4:00 PM",
    "4:00 PM - 5:00 PM",
  ];

  // Upcoming days / time slots staff disabled in Manage Slots.
  const loadBlockedSlots = async () => {
    try {
      const data = await getBlockedSlots();
      setBlockedSlots(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load disabled slots:", err);
    }
  };

  // Whole-day block for a date, or the block covering date + time slot.
  const findBlock = (date, time) => {
    const day = String(date || "").slice(0, 10);
    if (!day) return null;
    const onDay = blockedSlots.filter((b) => String(b.date).slice(0, 10) === day);
    return onDay.find((b) => !b.time_slot) || (time ? onDay.find((b) => b.time_slot === time) : null) || null;
  };
  const isWholeDayBlocked = (date) => !!findBlock(date, null);

  useEffect(() => {
    load();
    loadBlockedSlots();

    // A claimant can submit a new claim from the public board's
    // ClaimModal at any time. Poll in the background (same 5s interval
    // PublicBoard.jsx uses for items) so all tabs pick up new/updated
    // claims without a manual refresh. `silent` keeps this from
    // flashing the full-page loading spinner over the tables — or over
    // an open Review/Schedule modal — on every tick.
    //
    // This poll is also what makes a claim disappear from the tables
    // shortly after its item is marked "Claimed" over in Found Items.
    const interval = setInterval(() => {
      load(true);
      loadBlockedSlots();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const showNotification = (message, type = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // `silent`: when true, skips the loading spinner and error toast so
  // background polling doesn't disrupt whatever the staff member is
  // currently doing.
  //
  // getClaims() can return either a plain array or a DRF-paginated
  // object ({ count, next, previous, results: [...] }). Both shapes are
  // normalized here so `claims` is always an array.
  //
  // The result is passed through mergeDeclinedStore() so claims staff
  // has declined always end up in the Declined tab, even if the backend
  // doesn't persist/return the "Declined" status.
  const load = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const response = await getClaims();

      const data = Array.isArray(response)
        ? response
        : Array.isArray(response?.results)
        ? response.results
        : [];

      setClaims(mergeDeclinedStore(data));
    } catch (err) {
      console.error(err);
      if (!silent) showNotification("Failed to load claim requests", "error");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // --- Review -> Schedule flow ---

  // Fetches the full item record for a claim, same call FoundItems.jsx
  // uses when opening its Edit modal (getItemById).
  const fetchFullItem = async (claim) => {
    const itemId =
      claim?.item_details?.id ??
      claim?.item?.id ??
      claim?.item_id ??
      claim?.item;

    if (!itemId) {
      setFullItem(null);
      return;
    }

    try {
      setFullItemLoading(true);
      const response = await getItemById(itemId);
      const data = Array.isArray(response)
        ? response[0]
        : response?.results
        ? response.results[0]
        : response;
      setFullItem(data || null);
    } catch (err) {
      console.error("Failed to load full item details for claim review:", err);
      setFullItem(null);
    } finally {
      setFullItemLoading(false);
    }
  };

  // Opens the Review modal. For a DECLINED claim (opened from the
  // Declined tab's Action column) the modal is read-only: staff can see
  // the claimant's answers next to the recorded answers, but there are
  // no Approve/Decline/Schedule controls — a decline is final.
  const openReview = (claim) => {
    setSelected(claim);
    setShowReview(true);
    setFullItem(null);
    // Restore from the claim's own persisted flag rather than always
    // resetting to false. A claim that isn't in "Needs Attention"
    // (Scheduled / Approved) is treated as already decided, so opening
    // it from the Schedule Meeting tab skips Approve/Decline and shows
    // "Continue to Schedule" instead.
    setApprovedMismatch(isMismatchApproved(claim) || !needsAttention(claim));
    fetchFullItem(claim);
  };

  // ----------------------------------------------------------
  // OPEN A CLAIM FROM THE DASHBOARD CALENDAR
  // Dashboard.jsx navigates here with state { openClaimId }. Once the
  // claims are loaded, switch to the tab that claim lives in and open
  // its Claim Verification window.
  // ----------------------------------------------------------
  const location = useLocation();
  const pendingOpenClaimRef = useRef(location.state?.openClaimId ?? null);

  useEffect(() => {
    if (location.state?.openClaimId != null) {
      pendingOpenClaimRef.current = location.state.openClaimId;
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  useEffect(() => {
    const wanted = pendingOpenClaimRef.current;
    if (wanted == null || !claims.length) return;
    const claim = claims.find((cl) => String(getClaimId(cl)) === String(wanted));
    pendingOpenClaimRef.current = null;
    if (!claim) {
      showNotification("That claim could not be found.", "error");
      return;
    }
    if (isDeclined(claim)) setActiveTab("declined");
    else setActiveTab(needsAttention(claim) ? "attention" : "resolved");
    openReview(claim);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claims]);

  const closeReview = () => {
    setShowReview(false);
    setSelected(null);
    setFullItem(null);
    setRowDecline(false);
    setApprovedMismatch(false);
  };

  const continueToSchedule = () => {
    // A declined claim can never be scheduled.
    if (selected && isDeclined(selected)) return;

    // Guard in addition to the disabled button below — a flagged claim
    // never reaches the Schedule step unless staff has explicitly
    // approved it via handleApprove.
    if (countMismatches(selected, fullItem) > 0 && !approvedMismatch) {
      showNotification(
        "Scheduling is unavailable while an answer doesn't match the recorded answer.",
        "error"
      );
      return;
    }

    setShowReview(false);
    setMeetingDate(selected?.meeting_date || "");
    setMeetingTime(selected?.meeting_time || "");
  };

  // Staff override for a flagged claim: acknowledges the mismatch and
  // moves straight on to the Schedule step anyway.
  //
  // NOTE: continuing alone doesn't persist anything — the claim only
  // becomes "Approved" once staff confirms in the Schedule modal (see
  // send() below), which is what actually writes
  // staff_approved_despite_mismatch to the backend.
  const handleApprove = () => {
    setApprovedMismatch(true);
    setShowReview(false);
    setMeetingDate(selected?.meeting_date || "");
    setMeetingTime(selected?.meeting_time || "");
  };

  // Rejects a claim outright instead of scheduling a meeting for it.
  // Only available from the Review modal's Decline button (uses
  // `selected`). The claim then shows up in the Declined tab.
  //
  // ASSUMPTION: api.js exposes a `declineClaim(id, remarks)` helper that
  // persists the claim's `status` as "Declined" (see isDeclined above).
  //
  // Even if it doesn't, the claim is (1) updated in local state right
  // away and (2) remembered in the local declined store, so it appears
  // in the Declined tab immediately and stays there across refreshes.
  const handleDecline = async () => {
    if (!selected) return;

    const remarks = notOwnerDecline ? NOT_OWNER_REASON : declineReason;

    const targetId = getClaimId(selected);
    if (!targetId) {
      showNotification("Error: Invalid or missing Claim ID", "error");
      return;
    }

    try {
      setDeclining(true);
      await declineClaim(targetId, remarks, notOwnerDecline ? { not_owner: true } : {});

      // Snapshot of the claim as it should look once declined.
      const declinedSnapshot = {
        ...selected,
        status: "Declined",
        decline_reason: remarks,
        decline_date: new Date().toISOString(),
        not_owner: notOwnerDecline,
      };

      saveDeclinedClaim(targetId, declinedSnapshot);

      // Optimistic update so the Declined tab reflects it instantly,
      // before the next getClaims() round trip.
      setClaims((prev) => {
        const exists = prev.some((c) => String(getClaimId(c)) === String(targetId));
        return exists
          ? prev.map((c) =>
              String(getClaimId(c)) === String(targetId) ? declinedSnapshot : c
            )
          : [...prev, declinedSnapshot];
      });

      try {
        await logActivity({
          action: notOwnerDecline ? "Not the Owner" : "Decline Claim",
          details: `Declined claim for ${selected.claimant_name || "claimant"}: ${remarks}`,
        });
      } catch (logErr) {
        console.error("Activity log error:", logErr);
      }

      showNotification(
        notOwnerDecline ? "Claim marked as not the owner." : "Claim declined.",
        "success"
      );
      setNotOwnerDecline(false);
      closeReview();
      await load();
    } catch (err) {
      console.error(err);
      showNotification("Failed to decline claim", "error");
    } finally {
      setDeclining(false);
    }
  };

  // ==========================================================
  // NEEDS ATTENTION ROW ACTIONS
  // ==========================================================

  // Decline straight from the row: asks for confirmation first (same
  // confirmation modal and automatic reason as the Review modal).
  const declineFromRow = (claim) => {
    setSelected(claim);
    setShowReview(false);
    setFullItem(null);
    setRowDecline(true);
    setShowDeclineConfirm(true);
    fetchFullItem(claim);
  };

  const cancelDecline = () => {
    setShowDeclineConfirm(false);
    setNotOwnerDecline(false);
    if (rowDecline) {
      setSelected(null);
      setFullItem(null);
      setRowDecline(false);
    }
  };

  // Approve (row or Claim Verification modal) NEVER schedules on its own.
  // It opens the Schedule step ("Continue to Schedule"), pre-filled with
  // the slot the claimant requested, so staff confirm the date and time
  // there. Only after Confirm Schedule (send()) is the claim marked
  // "Scheduled by Staff" — and only then do Not the Owner / Review show.
  const approveFromRow = (claim) => {
    if (isDeclined(claim)) return;
    setSelected(claim);
    setShowReview(false);
    setFullItem(null);
    setApprovedMismatch(true);
    setMeetingDate(claim?.meeting_date || "");
    setMeetingTime(claim?.meeting_time || "");
    fetchFullItem(claim);
  };

  // Approve button inside the Claim Verification modal.
  const approveFromModal = () => {
    if (!selected) return;
    handleApprove();
  };

  const backToReview = () => {
    setShowReview(true);
  };

  const send = async () => {
    if (!selected) return;

    // A declined claim can never be scheduled.
    if (isDeclined(selected)) return;

    // Support flexible ID lookups across MongoDB / PostgreSQL formats
    const targetId = getClaimId(selected);
    if (!targetId) {
      showNotification("Error: Invalid or missing Claim ID", "error");
      return;
    }

    // MISMATCH BLOCKS SCHEDULING — unless staff has explicitly approved
    // the flagged claim via handleApprove (see approvedMismatch state).
    // Final backstop behind the disabled Confirm button.
    if (countMismatches(selected, fullItem) > 0 && !approvedMismatch) {
      showNotification(
        "Scheduling is blocked — this claim has mismatched answers.",
        "error"
      );
      return;
    }

    // DATE/TIME ARE LOCKED: when the claimant already requested a slot,
    // admins and moderators can't change it — always send the claim's
    // own meeting_date / meeting_time. Only a claim with no slot at all
    // (legacy "Awaiting Slot") uses the date/time picked in the modal.
    // Exception: if staff disabled the requested slot in Manage Slots,
    // a new slot has to be picked.
    const slotLocked = !isPendingReview(selected) && !requestedSlotBlocked;
    const finalDate = slotLocked ? selected.meeting_date : meetingDate;
    const finalTime = slotLocked ? selected.meeting_time : meetingTime;

    if (!finalDate || !finalTime) {
      showNotification("Please select both a date and a time slot", "error");
      return;
    }

    if (findBlock(finalDate, finalTime)) {
      showNotification("That slot is disabled in Manage Slots — please pick another one.", "error");
      return;
    }

    // Only a claim that actually has flagged answers AND was approved
    // counts as "Approved"; a clean claim is simply "Scheduled".
    const isApprovedMismatch =
      approvedMismatch && countMismatches(selected, fullItem) > 0;

    // Remember whether this was an approve-despite-mismatch confirm so
    // we can jump to the "Schedule Meeting" tab after it succeeds.
    const wasApprovedMismatch = isApprovedMismatch;

    if (
      !(await confirmAction({
        message: `Confirm the verification meeting on ${finalDate} (${finalTime}) for ${selected.claimant_name || "this claimant"}?`,
        confirmLabel: "Confirm Meeting",
      }))
    ) {
      return;
    }

    try {
      setSending(true);

      // `staff_scheduled: true` marks this meeting as explicitly
      // confirmed by a moderator/admin through this Review → Schedule →
      // Confirm flow. Dashboard.jsx's ClaimScheduleCalendar filters on
      // this flag.
      //
      // `needs_manual_review: false` clears the submission-time flag
      // ClaimModal.jsx set for mismatched/unverified claims.
      //
      // `staff_approved_despite_mismatch: true` is only sent for an
      // approved mismatch.
      await scheduleMeeting(targetId, {
        meeting_date: finalDate,
        meeting_time: finalTime,
        staff_scheduled: true,
        needs_manual_review: false,
        ...(isApprovedMismatch ? { staff_approved_despite_mismatch: true } : {}),
      });

      try {
        await logActivity({
          action: "Schedule Verification Meeting",
          details: `Scheduled meeting for ${selected.claimant_name || "claimant"} on ${finalDate} at ${finalTime}`,
        });
      } catch (logErr) {
        console.error("Activity log error:", logErr);
      }

      setSelected(null);
      setFullItem(null);
      setMeetingDate("");
      setMeetingTime("");
      await load();

      // The confirmed claim stays in the Schedule Meeting table, now
      // marked "Scheduled by Staff" — switch there so staff can see it.
      if (wasApprovedMismatch || activeTab !== "resolved") {
        setActiveTab("resolved");
        setResolvedPage(1);
      }
      setApprovedMismatch(false);

      showNotification("Meeting scheduled successfully!", "success");
    } catch (err) {
      console.error(err);
      showNotification("Failed to schedule meeting", "error");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 w-full items-center justify-center p-6 text-[#7B8AA6]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0B6B8A] border-t-transparent" />
          <p className="text-sm font-semibold tracking-wide">Loading claim requests...</p>
        </div>
      </div>
    );
  }

  const ITEMS_PER_PAGE = 10;

  const sortedClaims = [...claims].sort(
    (a, b) => new Date(b.claim_date) - new Date(a.claim_date)
  );

  const searchText = search.toLowerCase();
  const matchesSearch = (c) =>
    c.claimant_name?.toLowerCase().includes(searchText) ||
    c.claimant_email?.toLowerCase().includes(searchText) ||
    String(c.claimant_contact || "").toLowerCase().includes(searchText);

  // ==========================================================
  // ALREADY-CLAIMED ITEMS ARE EXCLUDED — DECLINED CLAIMS GET THEIR OWN TAB
  //
  // A claim whose item was already marked "Claimed" (e.g. by hand via
  // FoundItems.jsx) is resolved outside this flow entirely, so it's
  // dropped from the Needs Attention and Schedule Meeting tabs.
  //
  // Declined claims are excluded from those two tabs too, and are
  // listed in the Declined tab instead (see declinedClaims below).
  // ==========================================================
  // Claims whose meeting date was 3+ days ago are auto-archived and
  // shown under Archive -> Scheduled Meetings instead (see
  // utils/claimArchive.js).
  const visibleClaims = sortedClaims.filter(
    (c) => !isItemAlreadyClaimed(c) && !isDeclined(c) && !isClaimAutoArchived(c)
  );

  // ==========================================================
  // THREE TABS
  //
  //   - attentionClaims (status: Pending) — no schedule yet, or a
  //     flagged mismatch staff hasn't approved/declined yet.
  //   - resolvedClaims (status: Scheduled or Approved) — everything
  //     else that isn't declined.
  //   - declinedClaims (status: Declined) — claims staff rejected.
  // ==========================================================
  const resolvedClaims = visibleClaims.filter((c) => !needsAttention(c) && matchesSearch(c));
  const attentionClaims = visibleClaims.filter((c) => needsAttention(c) && matchesSearch(c));
  // Includes claims declined with "Not the Owner" — no separate tab.
  const allDeclinedClaims = sortedClaims.filter((c) => isDeclined(c) && matchesSearch(c));
  const declineCounts = allDeclinedClaims.reduce(
    (acc, c) => {
      acc[getDeclineCategory(c)] += 1;
      return acc;
    },
    { mismatch: 0, notOwner: 0, other: 0 }
  );
  const declinedClaims =
    declineFilter === "all"
      ? allDeclinedClaims
      : allDeclinedClaims.filter((c) => getDeclineCategory(c) === declineFilter);

  const resolvedTotalPages = Math.ceil(resolvedClaims.length / ITEMS_PER_PAGE) || 1;
  const attentionTotalPages = Math.ceil(attentionClaims.length / ITEMS_PER_PAGE) || 1;
  const declinedTotalPages = Math.ceil(declinedClaims.length / ITEMS_PER_PAGE) || 1;

  const resolvedStart = (resolvedPage - 1) * ITEMS_PER_PAGE;
  const attentionStart = (attentionPage - 1) * ITEMS_PER_PAGE;
  const declinedStart = (declinedPage - 1) * ITEMS_PER_PAGE;

  const paginatedResolved = resolvedClaims.slice(resolvedStart, resolvedStart + ITEMS_PER_PAGE);
  const paginatedAttention = attentionClaims.slice(attentionStart, attentionStart + ITEMS_PER_PAGE);
  const paginatedDeclined = declinedClaims.slice(declinedStart, declinedStart + ITEMS_PER_PAGE);

  const todayDate = new Date().toLocaleDateString("en-CA");

  // Per-question comparison for whichever claim is currently open in the
  // Review modal (and reused in the Schedule modal below).
  const answerComparison = buildAnswerComparison(selected, fullItem);
  const selectedMismatchCount = answerComparison.filter((a) => a.isMatch === false).length;

  // True when the claim open in the Review modal was declined — the
  // modal is then a read-only record (no Approve/Decline/Schedule).
  const selectedIsDeclined = !!selected && isDeclined(selected);

  // Any flagged answer disables the whole scheduling path UNLESS staff
  // has explicitly approved the flagged claim via handleApprove. Never
  // applies to a declined claim (nothing to decide any more).
  const schedulingBlocked =
    !selectedIsDeclined && selectedMismatchCount > 0 && !approvedMismatch;

  // True when the claim currently open in the Review/Schedule modals
  // already has a meeting_date & meeting_time set (the claimant's
  // requested slot). In that case the date and time are LOCKED — staff
  // can only confirm them, not edit them.
  const selectedAlreadyScheduled = !!selected && !isPendingReview(selected);

  // The claimant's requested slot was disabled in Manage Slots after
  // they booked it — staff must pick a new slot instead of confirming.
  const requestedSlotBlock = selectedAlreadyScheduled
    ? findBlock(selected.meeting_date, selected.meeting_time)
    : null;
  const requestedSlotBlocked = !!requestedSlotBlock;

  // Meetings already booked (for the "N booked" counts in Manage Slots).
  const bookedClaims = claims.filter(
    (c) =>
      c.meeting_date &&
      c.meeting_time &&
      !isDeclined(c) &&
      ["pending", "scheduled", "approved"].includes(normalize(c.status))
  );

  // True when the item behind the open claim has already been marked
  // "Claimed" directly from Found Items.
  const selectedItemAlreadyClaimed = isItemAlreadyClaimed(selected, fullItem);

  // Reason shown for a declined claim in the Review modal banner.
  const selectedDeclineCategory = selectedIsDeclined ? getDeclineCategory(selected) : null;
  const selectedDeclineReason =
    selected?.decline_reason ||
    selected?.remarks ||
    (selectedDeclineCategory === "notOwner"
      ? NOT_OWNER_REASON
      : selectedDeclineCategory === "mismatch"
      ? AUTO_DECLINE_REASON
      : GENERIC_DECLINE_REASON);

  // Shared row renderer for the Needs Attention and Schedule Meeting tabs.
  // The Action column only has "Review" — Decline lives inside the
  // Review modal.
  const renderClaimRow = (c, index) => {
    const pending = isPendingReview(c);
    // A slot exists, but it's still just the claimant's REQUEST — one or
    // more answers were flagged and staff hasn't Approved/Declined yet.
    const mismatchUnapproved =
      !pending && hasMismatch(c) && !isMismatchApproved(c);

    return (
      <tr key={getClaimId(c) || index} className={`h-[56px] ${index % 2 === 0 ? "bg-white" : "bg-[#F6FAFF]"} hover:bg-[#EAF4FF]`}>
        <td className="border border-gray-300 p-4 text-center align-middle font-bold text-[#0B6B8A] text-[13px]">
          {c.claimant_name || "N/A"}
          {missedMeetings(c) > 0 && (
            <span
              title="This claimant missed earlier verification meetings for this item. After 3, they must claim in person."
              className="mt-1 mx-auto flex w-fit items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-orange-700"
            >
              <FiAlertTriangle size={11} />
              {missedLabel(missedMeetings(c))}
            </span>
          )}
        </td>
        <td className="border border-gray-300 p-4 text-center align-middle text-slate-700 text-[13px]">{c.claimant_email || "N/A"}</td>
        <td className="border border-gray-300 p-4 text-center align-middle text-slate-700 text-[13px]">{c.claimant_contact || "—"}</td>
        <td className="border border-gray-300 p-4 text-center align-middle text-[13px]">
          {pending ? (
            <span
              title="Submitted with no claimant-picked meeting slot — needs staff review first"
              className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-bold uppercase text-blue-700"
            >
              Awaiting Slot
            </span>
          ) : mismatchUnapproved ? (
            <span className="inline-flex flex-col items-center gap-1">
              <span
                title="Claimant requested this slot, but an answer doesn't match our records — needs Approve or Decline"
                className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-bold uppercase text-red-700"
              >
                <FiAlertTriangle size={11} />
                Needs Review
              </span>
              <span className="text-[11px] font-semibold text-slate-500">
                {c.meeting_date} ({c.meeting_time}) requested
              </span>
            </span>
          ) : (
            <span className="inline-flex flex-col items-center gap-1">
              <span className="text-[#0B6B8A] font-semibold">{`${c.meeting_date} (${c.meeting_time})`}</span>
              {isStaffScheduled(c) ? (
                <span
                  title="An admin or moderator already confirmed this meeting"
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700"
                >
                  <FiCheck size={11} />
                  Scheduled by Staff
                </span>
              ) : (
                <span
                  title="The claimant picked this slot — not confirmed by staff yet"
                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-amber-700"
                >
                  Awaiting Confirmation
                </span>
              )}
            </span>
          )}
        </td>
        <td className="border border-gray-300 p-2 text-center align-middle">
            <div className="flex items-center justify-center gap-1.5">
              {isStaffScheduled(c) ? (
                // Already confirmed by an admin/moderator: the button reads
                // "Scheduled" (still opens the details).
                <button
                  onClick={() => openReview(c)}
                  title="Meeting already scheduled by staff — view details"
                  aria-label="Scheduled — view details"
                  className="inline-flex h-9 px-3 items-center gap-1.5 rounded bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700 transition-colors"
                >
                  <FiCheck size={16} />
                  <span>Scheduled</span>
                </button>
              ) : (
                <button
                  onClick={() => openReview(c)}
                  title="Review Claim"
                  aria-label="Review Claim"
                  className="inline-flex h-9 px-3 items-center gap-1.5 rounded bg-[#0B6B8A] text-xs font-bold text-white hover:bg-[#095A74] transition-colors"
                >
                  <FiEye size={16} />
                  <span>Review</span>
                </button>
              )}
            </div>
        </td>
      </tr>
    );
  };

  // Row renderer for the Declined tab. Declined claims are final, so the
  // Action column only offers "Review" — it opens the same Review modal
  // in read-only mode.
  const renderDeclinedRow = (c, index) => {
    const itemTitle =
      c.item_details?.title ||
      c.item_title ||
      c.item?.title ||
      (c.item ? `Item #${c.item}` : "—");

    const ticketCode = c.item_details?.ticket_code || c.item?.ticket_code || null;

    // ASSUMPTION: no dedicated "declined at" timestamp is confirmed on
    // the claim model yet — falls back to whatever's available.
    const declinedDate = c.declined_at || c.decline_date || c.updated_at || c.claim_date || null;
    const category = getDeclineCategory(c);

    return (
      <tr key={getClaimId(c) || index} className={`h-[56px] ${index % 2 === 0 ? "bg-white" : "bg-[#F6FAFF]"} hover:bg-[#EAF4FF]`}>
        <td className="border border-gray-300 p-4 text-center align-middle font-bold text-[#0B6B8A] text-[13px]">
          {c.claimant_name || "N/A"}
        </td>
        <td className="border border-gray-300 p-4 text-center align-middle text-slate-700 text-[13px]">{c.claimant_email || "N/A"}</td>
        <td className="border border-gray-300 p-4 text-center align-middle text-slate-700 text-[13px]">{c.claimant_contact || "—"}</td>
        <td className="border border-gray-300 p-4 text-center align-middle text-slate-700 text-[13px]">
          <span className="block font-semibold">{itemTitle}</span>
          {ticketCode && <span className="block text-xs text-slate-400">{ticketCode}</span>}
        </td>
        <td className="border border-gray-300 p-4 text-center align-middle">
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-slate-700">
            {category === "notOwner" ? <FiUserX size={12} /> : <FiX size={12} />}
            {DECLINE_CATEGORY_LABEL[category]}
          </span>
        </td>
        <td className="border border-gray-300 p-4 text-center align-middle text-slate-700 text-[13px]">
          {declinedDate ? new Date(declinedDate).toLocaleDateString("en-CA") : "—"}
        </td>
        <td className="border border-gray-300 p-2 text-center align-middle">
          <div className="flex items-center justify-center gap-1.5">
            <button
              onClick={() => openReview(c)}
              title="Review Answers"
              aria-label="Review Answers"
              className="inline-flex h-9 px-3 items-center gap-1.5 rounded bg-[#0B6B8A] text-xs font-bold text-white hover:bg-[#095A74] transition-colors"
            >
              <FiEye size={16} />
              <span>Review</span>
            </button>
          </div>
        </td>
      </tr>
    );
  };

  const renderPagination = (page, setPage, totalPages, totalCount) => (
    <Pagination
      currentPage={page}
      totalItems={totalCount}
      pageSize={ITEMS_PER_PAGE}
      onPageChange={setPage}
    />
  );

  // Which bucket is currently on screen, driven by the pill toggle.
  const isAttentionTab = activeTab === "attention";
  const isResolvedTab = activeTab === "resolved";
  const isDeclinedTab = activeTab === "declined";

  const visibleRows = isAttentionTab
    ? paginatedAttention
    : isResolvedTab
    ? paginatedResolved
    : paginatedDeclined;

  const visibleEmptyText = isAttentionTab
    ? "Nothing needs attention right now."
    : isResolvedTab
    ? "No scheduled meetings found."
    : declineFilter === "all"
    ? "No declined claims found."
    : `No declined claims marked "${
        declineFilter === "mismatch" ? "Mismatch" : declineFilter === "notOwner" ? "Not the Owner" : "Unable to Verify"
      }".`;

  const visiblePagination = isAttentionTab
    ? renderPagination(attentionPage, setAttentionPage, attentionTotalPages, attentionClaims.length)
    : isResolvedTab
    ? renderPagination(resolvedPage, setResolvedPage, resolvedTotalPages, resolvedClaims.length)
    : renderPagination(declinedPage, setDeclinedPage, declinedTotalPages, declinedClaims.length);

  return (
    <div className="bg-white rounded-[18px] border border-[#D8E2EF] shadow-[0_8px_24px_rgba(45,54,109,0.08)] overflow-hidden flex flex-col h-[calc(100vh-135px)]">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-5 right-5 z-[100] flex items-center gap-3 rounded-xl px-5 py-3.5 text-sm font-bold shadow-lg transition-all ${
            notification.type === "error" ? "bg-rose-600 text-white" : "bg-[#0B6B8A] text-white"
          }`}
        >
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            title="Close Notification"
            aria-label="Close Notification"
            className="ml-2 text-white/80 hover:text-white"
          >
            <FiX size={16} />
          </button>
        </div>
      )}

      {/* Header + search + tab switcher */}
      <div className="bg-white px-6 sm:px-8 py-4 border-b border-[#D8E2EF] shrink-0">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div>
              <h3 className="text-base sm:text-lg font-black uppercase tracking-[0.16em] text-[#071E3D]">
                Claim Requests
              </h3>
              <p className="text-xs sm:text-sm text-[#7B8AA6] italic mt-0.5">
                Review ownership claims and schedule verification appointments.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowManageSlots(true)}
              className="inline-flex items-center gap-2 rounded-full border border-[#0B6B8A] bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wide text-[#0B6B8A] hover:bg-[#EAF4FF] transition-colors"
            >
              <FiCalendar size={14} />
              <span>Manage Slots</span>
              {blockedSlots.length > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-100 px-1.5 text-[10px] font-black text-rose-600">
                  {blockedSlots.length}
                </span>
              )}
            </button>
            <div className="relative w-full sm:w-[300px]">
              <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-[#0B6B8A]" size={15} />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setResolvedPage(1);
                  setAttentionPage(1);
                  setDeclinedPage(1);
                }}
                placeholder="Search claimant..."
                className="w-full rounded-full border border-[#CBD8E8] bg-white py-2.5 pl-10 pr-9 text-sm text-[#071E3D] outline-none placeholder:text-[#8A98B3] focus:border-[#0B6B8A] focus:ring-2 focus:ring-[#0B6B8A]/20"
              />
              {search && (
                <button
                  onClick={() => {
                    setSearch("");
                    setResolvedPage(1);
                    setAttentionPage(1);
                    setDeclinedPage(1);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#7B8AA6] hover:text-[#071E3D]"
                  title="Clear Search"
                >
                  <FiX size={16} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* TAB SWITCHER (pill toggle) */}
        <div className="mt-4 flex justify-end">
          <div className="inline-flex items-center gap-1 rounded-full bg-[#F1F4F9] p-1">
            <button
              type="button"
              onClick={() => setActiveTab("attention")}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black uppercase tracking-wide transition-all ${
                isAttentionTab
                  ? "bg-white text-red-700 shadow-sm"
                  : "text-[#7B8AA6] hover:text-[#475569]"
              }`}
            >
              <FiAlertTriangle size={14} />
              <span>Needs Attention</span>
              <span
                className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black ${
                  isAttentionTab ? "bg-red-100 text-red-700" : "bg-white text-[#7B8AA6]"
                }`}
              >
                {attentionClaims.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("resolved")}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black uppercase tracking-wide transition-all ${
                isResolvedTab
                  ? "bg-white text-[#0B6B8A] shadow-sm"
                  : "text-[#7B8AA6] hover:text-[#475569]"
              }`}
            >
              <FiCalendar size={14} />
              <span>Schedule Meeting</span>
              <span
                className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black ${
                  isResolvedTab ? "bg-[#0B6B8A]/10 text-[#0B6B8A]" : "bg-white text-[#7B8AA6]"
                }`}
              >
                {resolvedClaims.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("declined")}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black uppercase tracking-wide transition-all ${
                activeTab === "declined"
                  ? "bg-white text-rose-600 shadow-sm"
                  : "text-[#7B8AA6] hover:text-[#475569]"
              }`}
            >
              <FiX size={14} />
              <span>Declined</span>
              <span
                className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black ${
                  activeTab === "declined" ? "bg-rose-100 text-rose-600" : "bg-white text-[#7B8AA6]"
                }`}
              >
                {allDeclinedClaims.length}
              </span>
            </button>
          </div>
        </div>

        {/* DECLINED FILTER — Mismatch / Not the Owner */}
        {activeTab === "declined" && (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <span className="mr-1 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-[#7B8AA6]">
              <FiSliders size={13} /> Filter
            </span>
            {[
              { key: "all", label: "All", count: allDeclinedClaims.length },
              { key: "mismatch", label: "Mismatch", count: declineCounts.mismatch },
              { key: "notOwner", label: "Not the Owner", count: declineCounts.notOwner },
              ...(declineCounts.other > 0
                ? [{ key: "other", label: "Unable to Verify", count: declineCounts.other }]
                : []),
            ].map((opt) => {
              const active = declineFilter === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => {
                    setDeclineFilter(opt.key);
                    setDeclinedPage(1);
                  }}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
                    active
                      ? "border-[#0B6B8A] bg-[#0B6B8A] text-white"
                      : "border-[#CBD8E8] bg-white text-[#475569] hover:border-[#0B6B8A]/60"
                  }`}
                >
                  {opt.key === "notOwner" && <FiUserX size={12} />}
                  {opt.key === "mismatch" && <FiAlertTriangle size={12} />}
                  {opt.label}
                  <span
                    className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black ${
                      active ? "bg-white/25 text-white" : "bg-[#F1F4F9] text-[#7B8AA6]"
                    }`}
                  >
                    {opt.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ACTIVE TABLE */}
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-auto bg-white">
          <table className="w-full min-w-[980px] table-fixed border-collapse">
            <thead className="sticky top-0 z-10">
              {isDeclinedTab ? (
                <tr>
                  <th className="w-[17%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Claimant Name</th>
                  <th className="w-[20%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Email Address</th>
                  <th className="w-[12%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Contact Number</th>
                  <th className="w-[16%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Item</th>
                  <th className="w-[13%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Remarks</th>
                  <th className="w-[11%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Declined On</th>
                  <th className="w-[11%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Action</th>
                </tr>
              ) : (
                <tr>
                  <th className="w-[20%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Claimant Name</th>
                  <th className="w-[24%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Email Address</th>
                  <th className="w-[14%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Contact Number</th>
                  <th className="w-[24%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Scheduled Date/Time</th>
                  <th className="w-[18%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Action</th>
                </tr>
              )}
            </thead>
            <tbody className="bg-white">
              {visibleRows.length > 0 ? (
                visibleRows.map((c, index) =>
                  isDeclinedTab ? renderDeclinedRow(c, index) : renderClaimRow(c, index)
                )
              ) : (
                <tr>
                  <td colSpan={isDeclinedTab ? 7 : 5} className="bg-white py-24 text-center text-[#7B8AA6] font-bold uppercase">
                    {visibleEmptyText}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {visiblePagination}
      </div>

      {/* REVIEW CLAIM MODAL */}
      {showReview && selected && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#071E3D]/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col">
            <div className="bg-[#0B6B8A] px-6 py-5 text-white shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-black">Claim Verification</h2>
                  <p className="mt-1 text-xs text-white/80">
                    {selectedIsDeclined
                      ? "This claim was declined. Below is a read-only record of the answers."
                      : "Review the claimant's ownership information before continuing."}
                  </p>
                </div>
                <button
                  onClick={closeReview}
                  title="Close Modal"
                  aria-label="Close Modal"
                  className="rounded-full bg-white/10 p-2 hover:bg-white/20 transition-colors"
                >
                  <FiX size={18} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* DECLINED BANNER */}
              {/* Remarks say WHY it was declined: Not the Owner, Mismatch
                  or Unable to Verify. */}
              {selectedIsDeclined && (
                <div className="flex items-start gap-3 rounded-xl border border-slate-300 bg-slate-50 p-4 text-slate-700">
                  {selectedDeclineCategory === "notOwner" ? (
                    <FiUserX className="mt-0.5 shrink-0" size={18} />
                  ) : (
                    <FiX className="mt-0.5 shrink-0" size={18} />
                  )}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider opacity-70">Remarks</p>
                    <p className="text-sm font-black uppercase tracking-wide">
                      Declined — {DECLINE_CATEGORY_LABEL[selectedDeclineCategory]}
                    </p>
                    <p className="mt-1 text-[12px] font-semibold leading-relaxed opacity-90">
                      {selectedDeclineReason}
                    </p>
                  </div>
                </div>
              )}

              {/* ITEM-ALREADY-CLAIMED BANNER */}
              {!selectedIsDeclined && selectedItemAlreadyClaimed && (
                <div className="flex items-start gap-3 rounded-xl border border-purple-300 bg-purple-50 p-4">
                  <FiCheck className="mt-0.5 shrink-0 text-purple-600" size={18} />
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-purple-700">
                      Item Already Marked Claimed
                    </p>
                    <p className="mt-1 text-[12px] font-semibold text-purple-700/90 leading-relaxed">
                      This item's status was already set to "Claimed" (e.g. from Surrendered Items).
                      This claim request may be outdated or refer to a claimant who was not the
                      one who ultimately picked it up. It will drop off this list on the next
                      refresh — double-check before acting on it further.
                    </p>
                  </div>
                </div>
              )}

              {/* MISSED MEETINGS BANNER (re-claim after a no-show) */}
              {!selectedIsDeclined && missedMeetings(selected) > 0 && (
                <div className="flex items-start gap-3 rounded-xl border border-orange-300 bg-orange-50 p-4">
                  <FiAlertTriangle className="mt-0.5 shrink-0 text-orange-600" size={18} />
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-orange-700">
                      {missedLabel(missedMeetings(selected))}
                    </p>
                    <p className="mt-1 text-[12px] font-semibold text-orange-700/90 leading-relaxed">
                      This is a re-claim: the claimant did not show up for an earlier meeting for
                      this item. Their ownership answers are the same as the original claim. After 3
                      missed meetings they can no longer claim it online.
                    </p>
                  </div>
                </div>
              )}

              {/* RED "WRONG ANSWER" BANNER */}
              {!selectedIsDeclined && selectedMismatchCount > 0 && (
                <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4">
                  <FiAlertTriangle className="mt-0.5 shrink-0 text-red-600" size={18} />
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-red-700">
                      {selectedMismatchCount} Answer{selectedMismatchCount > 1 ? "s" : ""} Don't Match Records
                    </p>
                    <p className="mt-1 text-[12px] font-semibold text-red-700/90 leading-relaxed">
                      One or more of the claimant's answers don't match the answer recorded on the
                      item. Compare both answers side-by-side in the Answer Comparison section
                      below, then either{" "}
                      <span className="font-black">Approve</span> to proceed anyway,
                      or <span className="font-black">Decline</span> to reject this claim.
                    </p>
                  </div>
                </div>
              )}

              {/* REQUESTED / SCHEDULED SLOT NOTICE — the claimant's
                  requested date and time. Staff can confirm it but can't
                  change it. */}
              {!selectedIsDeclined && selectedAlreadyScheduled && (
                <div className="flex items-start gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
                  <FiCalendar className="mt-0.5 shrink-0 text-emerald-600" size={18} />
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-emerald-700">
                      {schedulingBlocked || !isStaffScheduled(selected)
                        ? "Claimant Requested This Slot"
                        : "Meeting Already Scheduled by Staff"}
                    </p>
                    <p className="mt-1 text-[12px] font-semibold text-emerald-700/90 leading-relaxed">
                      {schedulingBlocked ? (
                        <>
                          The claimant requested{" "}
                          <span className="font-black">{selected.meeting_date}</span> at{" "}
                          <span className="font-black">{selected.meeting_time}</span>, but it isn't
                          confirmed yet — resolve the mismatch above first (Approve
                          or Decline).
                        </>
                      ) : (
                        isStaffScheduled(selected) ? (
                          <>
                            An admin or moderator already confirmed the meeting on{" "}
                            <span className="font-black">{selected.meeting_date}</span> at{" "}
                            <span className="font-black">{selected.meeting_time}</span>. The claimant has
                            been notified — nothing else is needed here.
                          </>
                        ) : (
                          <>
                            The claimant requested{" "}
                            <span className="font-black">{selected.meeting_date}</span> at{" "}
                            <span className="font-black">{selected.meeting_time}</span>. Continue to
                            Schedule to confirm it — staff can't change this date or time.
                          </>
                        )
                      )}
                    </p>
                  </div>
                </div>
              )}

              {/* Pending Review notice — no claimant-picked slot at all. */}
              {!selectedIsDeclined && isPendingReview(selected) && (
                <div className="flex items-start gap-3 rounded-xl border border-blue-300 bg-blue-50 p-4">
                  <FiAlertTriangle className="mt-0.5 shrink-0 text-blue-600" size={18} />
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-blue-700">
                      Pending Review — No Meeting Scheduled
                    </p>
                    <p className="mt-1 text-[12px] font-semibold text-blue-700/90 leading-relaxed">
                      This claim was submitted with no meeting slot at all. Review their answers
                      below, then use "Approve" to set a meeting yourself once you're
                      satisfied.
                    </p>
                  </div>
                </div>
              )}

              {/* Item */}
              <div className="rounded-xl border border-[#D8E2EF] bg-[#F8FAFC] p-4">
                <p className="mb-3 text-xs font-black uppercase tracking-wider text-[#0B6B8A]">
                  Item Being Claimed
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-400">Item</p>
                    <p className="font-bold text-[#071E3D]">
                      {selected.item_details?.title ||
                        selected.item_title ||
                        selected.item?.title ||
                        `Item #${selected.item}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Category</p>
                    <p className="font-bold text-[#0B6B8A]">
                      {selected.item_details?.category ||
                        selected.item_category ||
                        selected.item?.category ||
                        "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Location</p>
                    <p className="font-semibold text-slate-700">
                      {selected.item_details?.location ||
                        selected.item_location ||
                        selected.item?.location ||
                        "N/A"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Item Type</p>
                    <p className="font-semibold text-slate-700">
                      {selected.item_details?.type || "Surrendered"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Claimant */}
              <div>
                <p className="mb-3 text-xs font-black uppercase tracking-wider text-[#0B6B8A]">
                  Claimant Information
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-slate-400">Name</p>
                    <p className="font-bold text-slate-800">{selected.claimant_name || "N/A"}</p>
                  </div>
                  <div className="rounded-xl border p-3">
                    <p className="text-xs text-slate-400">Contact</p>
                    <p className="font-bold text-slate-800">{selected.claimant_contact || "N/A"}</p>
                  </div>
                  <div className="rounded-xl border p-3 sm:col-span-2">
                    <p className="text-xs text-slate-400">Email</p>
                    <p className="font-bold text-slate-800">{selected.claimant_email || "N/A"}</p>
                  </div>
                </div>
              </div>

              {/* ANSWER COMPARISON (STAFF ONLY) */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-wider text-[#0B6B8A]">
                    Answer Comparison (Staff Only)
                  </p>
                  {selectedMismatchCount > 0 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700">
                      <FiAlertTriangle size={12} />
                      {selectedMismatchCount} mismatch{selectedMismatchCount > 1 ? "es" : ""}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                      <FiCheck size={12} />
                      No flags
                    </span>
                  )}
                </div>

                {fullItemLoading ? (
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-400">
                    <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
                    Loading recorded answers...
                  </div>
                ) : answerComparison.length > 0 ? (
                  <AnswerComparisonList comparisons={answerComparison} />
                ) : (
                  <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm italic text-slate-400">
                    No answers were recorded for this claim.
                  </p>
                )}

                <p className="mt-2 text-[10px] font-semibold text-slate-400">
                  {selectedIsDeclined
                    ? "Claimants never see this comparison. This claim has already been declined, so no further action is available."
                    : "Claimants never see this comparison. A flagged mismatch requires you to either Approve or Decline before this claim can proceed."}
                </p>
              </div>
            </div>

            {/* FOOTER — three layouts:
                  - Declined: no footer at all (read-only).
                  - Needs attention: "Decline" / "Approve".
                  - Clean or already approved: "Continue to Schedule". */}
            {!selectedIsDeclined && (
              <div className="flex gap-3 border-t bg-slate-50 p-4 justify-end shrink-0">
                {needsAttention(selected) ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowDeclineConfirm(true)}
                      disabled={declining}
                      className="flex h-10 px-5 items-center justify-center gap-2 rounded-xl bg-rose-600 text-white font-bold text-xs hover:bg-rose-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    >
                      {declining ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        <span>Decline</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={approveFromModal}
                      disabled={declining || approvingId !== null}
                      title={
                        isPendingReview(selected)
                          ? "Approve this claim and pick a meeting date/time"
                          : "Approve this claim and confirm the requested meeting slot"
                      }
                      className="flex h-10 px-5 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                    >
                      <span>{approvingId !== null ? "Approving..." : "Approve"}</span>
                    </button>
                  </>
                ) : (
                  <>
                {/* "Not the Owner": declines a claim whose claimant turned
                    out not to own the item (found out at the meeting). Only
                    shown once staff have done Continue to Schedule. */}
                {isStaffScheduled(selected) && (
                  <button
                    type="button"
                    onClick={() => { setNotOwnerDecline(true); setShowDeclineConfirm(true); }}
                    disabled={declining}
                    title="The claimant turned out not to be the owner — decline this claim"
                    className="flex h-10 px-5 items-center justify-center gap-2 rounded-xl border border-rose-300 bg-white text-rose-600 font-bold text-xs hover:bg-rose-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    <FiUserX size={16} />
                    <span>Not the Owner</span>
                  </button>
                )}
                {isStaffScheduled(selected) ? (
                  // Already confirmed by an admin/moderator: opens this
                  // item's Review modal on the Surrendered (Found) Items
                  // page, where staff can mark it as claimed after the
                  // meeting. See the reviewItemId handling in FoundItems.jsx.
                  <button
                    type="button"
                    onClick={() => {
                      const itemId =
                        selected?.item_details?.id ?? selected?.item?.id ?? selected?.item;
                      closeReview();
                      navigate("/dashboard/surrendered-items", {
                        state: { reviewItemId: itemId },
                      });
                    }}
                    title="Open this item's Review in Surrendered Items"
                    className="flex h-10 px-5 items-center justify-center gap-2 rounded-xl bg-[#0B6B8A] text-white font-bold text-xs hover:bg-[#095A74] transition-colors"
                  >
                    <FiEye size={16} />
                    <span>Review</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={continueToSchedule}
                    className="flex h-10 px-5 items-center justify-center gap-2 rounded-xl bg-[#0B6B8A] text-white font-bold text-xs hover:bg-[#095A74] transition-colors"
                  >
                    <span>Continue to Schedule</span>
                    <FiArrowRight size={16} />
                  </button>
                )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SCHEDULE MEETING MODAL — never shown for a declined claim. */}
      {selected && !showReview && !selectedIsDeclined && !rowDecline && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071E3D]/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="bg-[#0B6B8A] px-6 py-4 text-white flex items-center justify-between">
              <div>
                <h2 className="text-lg font-extrabold">Schedule Verification</h2>
                <p className="text-xs opacity-80">Claimant: {selected.claimant_name}</p>
              </div>
              <button
                type="button"
                onClick={backToReview}
                className="flex items-center gap-1 text-xs bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded-lg transition-colors"
                title="Back to Review"
              >
                <FiArrowLeft size={14} /> Back
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Compact purple banner — item already claimed. */}
              {selectedItemAlreadyClaimed && (
                <div className="flex items-start gap-2 rounded-xl border border-purple-300 bg-purple-50 p-3">
                  <FiCheck className="mt-0.5 shrink-0 text-purple-600" size={15} />
                  <p className="text-[11px] font-bold text-purple-700 leading-relaxed">
                    This item is already marked "Claimed" — double-check this claim is still
                    relevant before confirming a meeting.
                  </p>
                </div>
              )}

              {/* Compact amber banner — approved mismatch. */}
              {approvedMismatch && selectedMismatchCount > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3">
                  <p className="text-[11px] font-bold text-amber-700 leading-relaxed">
                    {selectedMismatchCount} mismatch{selectedMismatchCount > 1 ? "es were" : " was"}{" "}
                    approved by staff — see the comparison below.
                  </p>
                </div>
              )}

              {/* ANSWER COMPARISON OVERVIEW (inline, staff-only) */}
              {answerComparison.length > 0 && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Answer Comparison
                    </p>
                    {selectedMismatchCount > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                        <FiAlertTriangle size={11} />
                        {selectedMismatchCount} mismatch{selectedMismatchCount > 1 ? "es" : ""}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        <FiCheck size={11} />
                        No flags
                      </span>
                    )}
                  </div>

                  <AnswerComparisonList comparisons={answerComparison} compact />
                </div>
              )}

              {requestedSlotBlocked && (
                <div className="flex items-start gap-3 rounded-xl border border-rose-300 bg-rose-50 p-3">
                  <FiAlertTriangle className="mt-0.5 shrink-0 text-rose-600" size={16} />
                  <p className="text-[12px] font-semibold text-rose-700 leading-relaxed">
                    The claimant's requested slot ({selected.meeting_date}, {selected.meeting_time}) was
                    disabled in Manage Slots{requestedSlotBlock?.reason ? ` — ${requestedSlotBlock.reason}` : ""}.
                    Pick a new date and time below.
                  </p>
                </div>
              )}

              {selectedAlreadyScheduled && !requestedSlotBlocked ? (
                /* READ-ONLY: the claimant's requested slot can't be
                   edited by admins or moderators — only confirmed. */
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#071E3D] mb-1">Meeting Date</label>
                    <div className="w-full rounded-xl border bg-slate-100 p-3 text-sm font-semibold text-slate-700 cursor-not-allowed">
                      {selected.meeting_date}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#071E3D] mb-1">Meeting Time Slot</label>
                    <div className="w-full rounded-xl border bg-slate-100 p-3 text-sm font-semibold text-slate-700 cursor-not-allowed">
                      {selected.meeting_time}
                    </div>
                  </div>
                  <p className="col-span-2 text-[11px] font-semibold text-slate-500">
                    This is the slot the claimant requested. It can't be changed.
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-bold text-[#071E3D] mb-1">Meeting Date</label>
                    <input
                      type="date"
                      value={meetingDate}
                      min={todayDate}
                      onChange={(e) => {
                        setMeetingDate(e.target.value);
                        setMeetingTime("");
                      }}
                      className="w-full rounded-xl border p-3 text-sm outline-none focus:border-[#0B6B8A]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#071E3D] mb-1">Meeting Time Slot</label>
                    <select
                      value={meetingTime}
                      onChange={(e) => setMeetingTime(e.target.value)}
                      disabled={!meetingDate}
                      className="w-full rounded-xl border p-3 text-sm outline-none focus:border-[#0B6B8A] disabled:bg-slate-100 disabled:cursor-not-allowed"
                    >
                      <option value="">Select available time</option>
                      {slotsAllowedOn(meetingDate, TIME_OPTIONS).map((slot) => {
                        const off = !!findBlock(meetingDate, slot);
                        return (
                          <option key={slot} value={slot} disabled={off}>
                            {slot}
                            {off ? " (Disabled)" : ""}
                          </option>
                        );
                      })}
                    </select>
                    {isWholeDayBlocked(meetingDate) && (
                      <p className="mt-1 text-[11px] font-semibold text-red-600">
                        This day is disabled in Manage Slots
                        {findBlock(meetingDate, null)?.reason ? ` (${findBlock(meetingDate, null).reason})` : ""} —
                        please pick another date.
                      </p>
                    )}
                    {weekdayOf(meetingDate) === 0 && (
                      <p className="mt-1 text-[11px] font-semibold text-red-600">
                        No meeting slots on Sundays — please pick another date.
                      </p>
                    )}
                    {weekdayOf(meetingDate) === 6 && (
                      <p className="mt-1 text-[11px] font-semibold text-amber-600">
                        Saturday meetings are only from 8:00 AM to 11:00 AM.
                      </p>
                    )}
                  </div>
                </>
              )}

              <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
                <p className="text-xs text-blue-700">
                  The claimant will receive an email containing the verification meeting date, time, and location.
                </p>
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setFullItem(null);
                    setMeetingDate("");
                    setMeetingTime("");
                    setApprovedMismatch(false);
                  }}
                  className="flex h-10 flex-1 items-center justify-center rounded-xl bg-slate-100 text-slate-600 font-bold text-xs hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={send}
                  disabled={
                    sending ||
                    (selectedAlreadyScheduled && !requestedSlotBlocked
                      ? false
                      : !meetingDate || !meetingTime || !!findBlock(meetingDate, meetingTime))
                  }
                  className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0B6B8A] text-white font-bold text-xs hover:bg-[#095A74] disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
                >
                  {sending ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <>
                      <FiCheck size={16} />
                      <span>Confirm Schedule</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MANAGE SLOTS (calendar) */}
      <ManageSlotsModal
        open={showManageSlots}
        onClose={() => setShowManageSlots(false)}
        bookedClaims={bookedClaims}
        onChanged={loadBlockedSlots}
        notify={showNotification}
      />

      {/* DECLINE CONFIRMATION MODAL */}
      {showDeclineConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#071E3D]/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-[28px] bg-white px-8 py-8 text-center shadow-2xl">
            <div className="mx-auto mb-7 flex h-16 w-16 items-center justify-center rounded-full bg-rose-50 text-rose-600">
              {notOwnerDecline ? (
                <FiUserX size={30} strokeWidth={2.5} />
              ) : (
                <FiAlertTriangle size={30} strokeWidth={2.5} />
              )}
            </div>

            <h5 className="mb-3 text-lg font-black text-[#144B70]">
              {notOwnerDecline ? "Not the Owner" : "Decline Claim"}
            </h5>

            <p className="mx-auto mb-6 max-w-[280px] text-sm font-medium leading-6 text-[#5F6F8C]">
              {notOwnerDecline ? (
                <>
                  {selected?.claimant_name
                    ? `Mark ${selected.claimant_name} as not the owner of this item? `
                    : "Mark this claimant as not the owner? "}
                  Their claim will be declined and moved to the Declined tab, and the
                  item stays available for its real owner.
                </>
              ) : (
                <>
                  {selected?.claimant_name
                    ? `Decline ${selected.claimant_name}'s claim? `
                    : "Decline this claim? "}
                  {declineHasMismatch
                    ? "They will be emailed that their answers did not match our records."
                    : "They will be emailed that we couldn't verify their claim."}
                </>
              )}
            </p>

            <div className="space-y-3">
              <button
                onClick={async () => {
                  if (declining) return;
                  await handleDecline();
                  setShowDeclineConfirm(false);
                }}
                disabled={declining}
                className={`h-12 w-full rounded-xl text-sm font-black uppercase tracking-wide text-white shadow-md transition active:scale-[0.98] ${
                  declining
                    ? "cursor-not-allowed bg-slate-300"
                    : "bg-rose-600 hover:bg-rose-700"
                }`}
              >
                {declining ? "Declining..." : notOwnerDecline ? "Yes, Not the Owner" : "Yes, Decline"}
              </button>

              <button
                onClick={cancelDecline}
                disabled={declining}
                className="h-12 w-full rounded-xl border border-[#0B6B8A] bg-white text-sm font-black uppercase tracking-wide text-[#0B6B8A] transition hover:bg-[#EAF4F8] disabled:opacity-60"
              >
                No
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClaimRequests;