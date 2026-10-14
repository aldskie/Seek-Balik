import React, {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useApp,
} from "../context/AppContext";

import {
  API_URL,
} from "../api/api";

import { toLocalContactNumber, contactNumberError } from "../utils/contactNumber";
import { narrowOptionsForItem, setQuestionBankGroups } from "../utils/itemOptionGroups";



// Parses a 'YYYY-MM-DD' string into a local Date at midnight, avoiding the
// UTC-parsing shift `new Date("YYYY-MM-DD")` does (which can land on the
// wrong local day depending on timezone).
const parseDateOnly = (value) => {
  if (!value || typeof value !== "string") return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};


// Works out the Date/time a scheduled claim's slot ends, e.g. for
// meetingDate "2026-09-05" and meetingTime "9:00 AM - 10:00 AM" this
// returns a Date for 2026-09-05 10:00 AM local time. Returns null if
// either input is missing or unparseable, in which case the caller
// should treat the claim as never expiring (safer than guessing).
// Mirrors the same helper in PublicBoard.jsx so both components agree
// on when a claimant becomes eligible to submit a new/rescheduled
// claim for the same item.
const parseSlotEnd = (meetingDate, meetingTimeSlot) => {
  if (!meetingDate || !meetingTimeSlot) return null;

  const endLabel = meetingTimeSlot.split("-")[1]?.trim();
  if (!endLabel) return null;

  const match = endLabel.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3].toUpperCase();

  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;

  const parsedDate = parseDateOnly(meetingDate);
  if (!parsedDate) return null;

  parsedDate.setHours(hours, minutes, 0, 0);
  return parsedDate;
};


// De-duplicates a raw options array (trim + case-insensitive compare,
// keeping the first occurrence's original casing/spacing). Order is
// preserved otherwise. No cap is applied — every distinct option the
// admin/moderator configured for this item is shown in the dropdown.
const dedupeAndCapOptions = (options) => {
  const seen = new Set();
  const deduped = [];

  for (const option of options) {
    if (typeof option !== "string") continue;

    const trimmed = option.trim();
    if (!trimmed) continue;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    deduped.push(trimmed);
  }

  return deduped;
};

// Parses a verification_options_N value into a usable options array, or
// null if there isn't one. FoundItems.jsx submits this as a JSON string
// (multipart form fields must be strings), but this also accepts an
// already-parsed array in case the backend serializer returns it that
// way (e.g. a real JSONField). Anything empty, malformed, or missing
// resolves to null, which tells the caller to fall back to free text.
// The surviving array is de-duplicated (order preserved, no cap) before
// being returned — see dedupeAndCapOptions above.
const parseOptionList = (value) => {
  let rawOptions = null;

  if (Array.isArray(value)) {
    rawOptions = value;
  } else if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      rawOptions = Array.isArray(parsed) ? parsed : null;
    } catch (e) {
      console.error("Failed to parse verification options:", e);
      return null;
    }
  }

  if (!rawOptions || rawOptions.length === 0) {
    return null;
  }

  const cleaned = dedupeAndCapOptions(rawOptions);
  return cleaned.length > 0 ? cleaned : null;
};


// Fallback time slots shown to claimants when staff hasn't configured
// any AvailableSchedule slots for the selected date yet. Mirrors
// ClaimRequests.jsx's TIME_OPTIONS so both sides stay in sync. Only
// used when the schedules API call succeeds but legitimately returns
// nothing for that date — NOT used on a fetch error (slotsLoadError),
// since an error means we genuinely don't know what's available and
// showing defaults there would be misleading rather than helpful.
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

// Saturdays: 8 AM - 11 AM only. Sundays: no meeting slots.
// (The server enforces the same rule.)
const SATURDAY_SLOTS = ["8:00 AM - 9:00 AM", "9:00 AM - 10:00 AM", "10:00 AM - 11:00 AM"];

const weekdayOf = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`);
  return isNaN(d.getTime()) ? null : d.getDay(); // 0 = Sunday, 6 = Saturday
};

// Shortest typed answer that counts as answered. Typed answers need at
// least two characters so a stray key press isn't accepted.
const MIN_TYPED_ANSWER_LENGTH = 2;

// A question counts as answered when:
//   - it has dropdown options and one of them is picked (any length, so
//     one-letter choices like "S", "M" or "L" are accepted), or
//   - it is a typed answer with at least MIN_TYPED_ANSWER_LENGTH characters.
// Same rule as the mobile app's Claim Request screen.
const isAnswerComplete = (answer, options) => {
  const value = typeof answer === "string" ? answer.trim() : "";
  if (!value) return false;
  if (Array.isArray(options) && options.length) {
    return options.some((option) => option.trim() === value);
  }
  return value.length >= MIN_TYPED_ANSWER_LENGTH;
};

const slotsAllowedOn = (dateStr, slots) => {
  const day = weekdayOf(dateStr);
  if (day === 0) return [];
  if (day === 6) return slots.filter((s) => SATURDAY_SLOTS.includes(s));
  return slots;
};


const CATEGORY_QUESTIONS = {
  Accessories: {
    title: "Accessory Details",

    questions: [
      "What color and design does it have?",
      "What brand or model is it?",
      "Are there any unique marks, scratches, or decorations?",
      "When or where did you last see or use it?",
    ],

    placeholders: [
      "Example: Black with a silver frame",
      "Example: Casio / Ray-Ban",
      "Example: Small scratch on the right lens",
      "Example: Left on the library desk yesterday",
    ],
  },

  ID: {
    title: "ID Details",

    questions: [
      "What type of ID is it?",
      "What full name is printed on the ID?",
      "What ID or student number is shown?",
      "What other details can confirm that the ID belongs to you?",
    ],

    placeholders: [
      "Example: Student ID / Driver's License",
      "Example: Juan Dela Cruz",
      "Example: 2024-12345",
      "Example: Blue lanyard attached, current year validation sticker",
    ],
  },

  "Academic Materials": {
    title: "Academic Material Details",

    questions: [
      "What item is it?",
      "What subject, title, or brand is associated with it?",
      "What color, cover design, or appearance does it have?",
      "Are there written names, notes, or unique marks on or inside it?",
    ],

    placeholders: [
      "Example: Scientific Calculator / Textbook / Notebook",
      "Example: Casio fx-991EX / General Chemistry",
      "Example: Blue hardcover notebook with stickers",
      "Example: Name written on the inside cover / Yellow highlighter on back",
    ],
  },

  "Bags & Wallets": {
    title: "Bag & Wallet Details",

    questions: [
      "What color, material, and style is it?",
      "What brand or logo is on it?",
      "What items or contents were inside it?",
      "Are there any unique patches, keychains, or damage?",
    ],

    placeholders: [
      "Example: Navy blue canvas backpack / Leather bi-fold wallet",
      "Example: Herschel / Nike",
      "Example: Two notebooks, pencil case, and a water bottle",
      "Example: Bear keychain attached to zipper, small tear near side pocket",
    ],
  },

  Clothing: {
    title: "Clothing Details",

    questions: [
      "What type of clothing or wearable item is it?",
      "What brand, size, or material is it?",
      "What color or pattern does it have?",
      "Are there any distinct marks, stains, or custom features?",
    ],

    placeholders: [
      "Example: Jacket / Cap / Hoodie / Umbrella",
      "Example: Uniqlo, Size M / Denim",
      "Example: Dark grey with a white logo on the chest",
      "Example: Small bleach mark on the right sleeve",
    ],
  },

  Electronic: {
    title: "Electronic Device Details",

    questions: [
      "What type of device, brand, and model is it?",
      "What color is the device and its case?",
      "What wallpaper, lock screen, or cover does it have?",
      "Are there any unique scratches, stickers, or identifying features?",
    ],

    placeholders: [
      "Example: iPhone 15 / iPad Air / Asus Laptop",
      "Example: Space Gray with a clear protective case",
      "Example: Dog photo on lock screen",
      "Example: Sticker on top right corner, small dent near charging port",
    ],
  },

  Keys: {
    title: "Key Details",

    questions: [
      "How many keys are attached?",
      "What type of key holder or keychain is attached?",
      "What color or design is the keychain?",
      "Are there any unique tags, accessories, or distinct keys?",
    ],

    placeholders: [
      "Example: Three keys (2 silver, 1 brass)",
      "Example: Black metal carabiner / Leather strap",
      "Example: Red and black woven lanyard",
      "Example: Small tag labeled 'Room 302'",
    ],
  },
};

const ClaimModal = ({
  item,
  onClose,
  onSuccess,
}) => {

  const {
    currentUser,
    submitClaimRequest,
  } = useApp();


  // ==========================================================
  // STATE
  // ==========================================================

  const [submitted, setSubmitted] =
    useState(false);

  // How long the inline "submitted" confirmation screen stays up before
  // ClaimModal closes itself automatically. Gives the claimant enough
  // time to actually read the confirmation (meeting date/time, or the
  // pending-review notice) without needing to click anything.
  const AUTO_CLOSE_DELAY_MS = 3000;

  const [loading, setLoading] =
    useState(false);

  const [validationError, setValidationError] =
    useState("");

  const [claimLocked, setClaimLocked] = useState(false);
  const [claimLockMessage, setClaimLockMessage] = useState("");
  // Whether the existing claim behind claimLocked already has a
  // meeting scheduled (true), is still awaiting staff review (false),
  // or hasn't been determined yet (null). Drives which icon/tone the
  // lock banner and the "already submitted" screen use, independent of
  // the wording in claimLockMessage itself.
  const [existingClaimScheduled, setExistingClaimScheduled] = useState(null);
  const [checkingClaim, setCheckingClaim] = useState(true);

  // Shows the "review before you submit" modal. This is the ONE place
  // actual submission happens, for BOTH paths (mismatched/pending-
  // review and matched/verified-with-schedule). Reached from the main
  // "Review & Submit" button once validateForm() passes — a claimant
  // now always has to have already picked a date/time in the Schedule
  // section above, regardless of whether their answers matched, since
  // that section is shown unconditionally once every question is
  // answered (see the render section below). The actual API call only
  // happens once the claimant explicitly confirms from THIS modal via
  // confirmAndSubmitClaim.
  //
  // NOTE: there used to be a separate "Confirm Your Schedule" modal
  // that popped up the instant a time was picked, before this one.
  // That extra step was removed — picking a time now just fills the
  // field, and the single Review & Submit button (already a supported
  // path for both cases) opens this modal directly, with no
  // in-between confirmation and no chance of getting bounced back to
  // the form after picking a time.
  const [showConfirmModal, setShowConfirmModal] =
    useState(false);


  // ==========================================================
  // AUTO-CLOSE AFTER SUCCESSFUL SUBMISSION
  //
  // Once submitClaim() succeeds and flips `submitted` to true, the
  // claimant briefly sees the inline "Claim Submitted" / "Claim
  // Submitted for Review" confirmation screen (with the meeting
  // details or pending-review notice), then this closes ClaimModal
  // for them automatically — calling the same onClose() the "Done"
  // button uses, which in PublicBoard just clears claimItem and
  // reveals the board underneath (see PublicBoard.jsx's onClose prop).
  // The claimant can still close it sooner by clicking "Done" directly.
  useEffect(() => {
    if (!submitted) return;

    const timer = setTimeout(() => {
      onClose();
    }, AUTO_CLOSE_DELAY_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitted]);


  const [answers, setAnswers] =
    useState([
      "",
      "",
      "",
      "",
    ]);


  // ==========================================================
  // LIVE ANSWER VERIFICATION (STAFF-SAFE)
  //
  // 'idle'    — not all questions answered yet, nothing to check
  // 'checking'— a check request is in flight (debounced)
  // 'correct' — every item-specific question matched the recorded
  //             answer (checked server-side; the correct answer itself
  //             is NEVER sent to this component)
  // 'mismatch'— at least one answer didn't match
  //
  // This only ever applies to item-specific questions
  // (verification_question_N), since only those have an admin-recorded
  // correct answer to compare against. Generic category fallback
  // questions have nothing to check, so they're treated as 'correct'
  // (i.e. always eligible for the normal schedule-a-meeting flow).
  //
  // IMPORTANT: this calls POST {API_URL}/claim/verify-answers/<item.id>/
  // expecting a response shaped like { all_correct: true|false } and
  // NOTHING else identifying — no correct-answer text should ever come
  // back in this response.
  //
  // NOTE: this status is now PURELY INFORMATIONAL for staff (via
  // needs_manual_review sent at submission time) — it no longer
  // changes what the claimant sees or does in this form. The Schedule
  // section is shown and required either way; a mismatch just means
  // the claim staff sees in ClaimRequests.jsx will be flagged for
  // manual approval before that claimant-picked meeting is treated as
  // final. See handleSubmit/submitClaim below.
  //
  // UI NOTE: the mismatch state is intentionally NOT surfaced to the
  // claimant anywhere in the form (no banner, no inline warning). This
  // is deliberate — telling someone their answers are wrong would let
  // them keep guessing until they land on the recorded answer. The
  // claimant only ever sees the same neutral scheduling flow either
  // way; whether a mismatch happened is not distinguishable from the
  // UI.
  // ==========================================================

  const [verificationStatus, setVerificationStatus] = useState("idle");

  // Guards against a stale/out-of-order response overwriting a newer
  // one (e.g. user edits an answer again while an older check is still
  // in flight).
  const verificationRequestId = useRef(0);


  // Loads the Question Bank's item-type links (choices an admin linked
  // to e.g. "Mobile Phone") so narrowOptionsForItem keeps them. Bumping
  // `questionBankVersion` re-renders once they're in.
  const [questionBankVersion, setQuestionBankVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL.replace(/\/$/, "")}/questions/`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (cancelled) return;
        setQuestionBankGroups(Array.isArray(data) ? data : data?.results || []);
        setQuestionBankVersion((v) => v + 1);
      })
      .catch((err) => console.error("Could not load Question Bank choices:", err));
    return () => {
      cancelled = true;
    };
  }, []);

  const [form, setForm] =
    useState({

      first_name: "",
      last_name: "",

      claimant_contact: "",
      school_id: "",

      meeting_date: "",
      meeting_time: "",

      // Free-text, optional. Not part of the numbered Q&A set and not
      // checked by allQuestionsAnswered — purely extra context the
      // claimant can offer if the fixed questions don't cover something
      // distinctive about the item.
      other_description: "",
    });


  const today =
    new Date().toLocaleDateString(
      "en-CA"
    );


  // ==========================================================
  // CATEGORY (fallback question set)
  // ==========================================================

  const category =
    item?.category &&
    CATEGORY_QUESTIONS[
      item.category
    ]
      ? item.category
      : "All";


  const categoryInfo =
    CATEGORY_QUESTIONS[
      category
    ];


  // ==========================================================
  // PER-ITEM VERIFICATION QUESTIONS
  //
  // Admin/moderator can define up to 4 item-specific ownership
  // verification questions (item.verification_question_1..4) when
  // logging the found item. When present, these replace the generic
  // per-category question set below, since not every item shares the
  // same identifying details. If none are set, we fall back to the
  // generic per-category questions so older/unconfigured items still
  // work.
  //
  // Each question's dropdown options (item.verification_options_N) come
  // from that SAME found item and are paired up by index below, so a
  // question always renders with the exact preset choices the
  // admin/moderator's Correct-answer dropdown used for it — never a
  // shared or mismatched list. These arrive as JSON strings (see
  // FoundItems.jsx's handleSave), so parseOptionList() decodes them
  // back into arrays; anything unparsable or empty falls back to null,
  // which renders the question as free text instead.
  //
  // NOTE: these predefined choices are shown purely to make answering
  // easier/consistent for the claimant — the CORRECT answer itself is
  // never sent to this component. Whether an answer is right is
  // resolved by calling the verify-answers endpoint (see
  // verificationStatus above), which returns only true/false.
  // ==========================================================

  const customQuestionPairs =
    [1, 2, 3, 4]
      .map((n) => ({
        question: item?.[`verification_question_${n}`],
        // Only the choices that fit this kind of item (e.g. phone
        // brands for a Mobile Phone) — see utils/itemOptionGroups.js.
        options: narrowOptionsForItem(
          item?.[`verification_question_${n}`],
          parseOptionList(item?.[`verification_options_${n}`]),
          item?.title,
          item?.category
        ),
      }))
      .filter(
        (pair) =>
          typeof pair.question === "string" &&
          pair.question.trim().length > 0
      );

  const usingCustomQuestions =
    customQuestionPairs.length > 0;

  const activeQuestions =
    usingCustomQuestions
      ? customQuestionPairs.map((pair) => pair.question)
      : categoryInfo.questions;

  // Parallel array to activeQuestions: an options array for questions that
  // should render as a predefined-choice dropdown, or null for questions
  // that stay free text (category fallback questions, or an item-specific
  // question with no admin-defined answer to build choices from).
  const activeOptions =
    usingCustomQuestions
      ? customQuestionPairs.map((pair) => pair.options)
      : activeQuestions.map(() => null);

  const activePlaceholders =
    usingCustomQuestions
      ? activeQuestions.map(
          () => "Type your answer here"
        )
      : categoryInfo.placeholders;


  // ==========================================================
  // GET USER INFORMATION
  // ==========================================================

  // Checks whether the claimant already has a claim for this item and,
  // if so, locks the form so they can't submit a duplicate.
  //
  // IMPORTANT: this used to also try to guess when a claim had
  // "expired" (its scheduled meeting slot already passed) and unlock
  // the form again in that case, on the assumption that the backend
  // would allow a fresh/rescheduled claim once the old meeting time
  // had passed. It doesn't — the create-claim endpoint enforces a
  // flat "You already submitted a claim request for this item."
  // uniqueness check with no time-based exception, so that client-side
  // unlock let claimants reach the Submit button, fill the form out
  // again, and get a 400 back. Backend and frontend now agree: if
  // `has_claim` is true, the item stays locked, full stop. (If the
  // backend later adds real support for reclaiming after a missed
  // meeting, e.g. by excluding expired/cancelled claims from its
  // uniqueness check, this can re-introduce a matching expiry check
  // here.)
  //
  // FIX: previously, a claim with no meeting_date/meeting_time yet
  // (i.e. still pending staff review — see submitClaim's null
  // meeting_date/time below) fell into the SAME message template as a
  // scheduled one, producing "already scheduled on undefined
  // (undefined)." That not only looked broken, it also failed to tell
  // the claimant the one thing they actually need to know here: they
  // already answered the verification questions and already submitted
  // this claim, so submitting again would just be a duplicate. The two
  // cases are now split out explicitly below.
  //
  // Always resolves `checkingClaim` back to `false` — including when
  // there's no item.id yet — so the Submit button never gets stuck
  // disabled on "Checking...".
  useEffect(() => {
    if (!item?.id) {
      setCheckingClaim(false);
      setClaimLocked(false);
      setClaimLockMessage("");
      setExistingClaimScheduled(null);
      return;
    }

    let cancelled = false;

    const checkExistingClaim = async () => {
      try {
        setCheckingClaim(true);

        const token = localStorage.getItem("accessToken");

        const res = await fetch(
          `${API_URL.replace(/\/$/, "")}/claim/check-item/${item.id}/`,
          {
            headers: token
              ? {
                  Authorization: `Bearer ${token}`,
                }
              : {},
          }
        );

        if (!res.ok) {
          throw new Error(`Claim check failed with status ${res.status}`);
        }

        const data = await res.json();

        if (cancelled) return;

        if (data.has_claim) {
          const hasSchedule = Boolean(data.meeting_date && data.meeting_time);

          // Always lock when the backend reports an existing claim —
          // see the note above checkExistingClaim for why this no
          // longer tries to unlock based on a client-guessed "slot
          // already passed" rule.
          setClaimLocked(true);
          setExistingClaimScheduled(hasSchedule);
          setClaimLockMessage(
            hasSchedule
              ? `You've already submitted a claim for this item, and a verification meeting is scheduled on ${data.meeting_date} (${data.meeting_time}).`
              : "You've already submitted your ownership verification answers for this item. Your claim is currently pending review — a moderator will contact you to schedule a verification meeting once it's been checked."
          );
        } else {
          setClaimLocked(false);
          setClaimLockMessage("");
          setExistingClaimScheduled(null);
        }
      } catch (err) {
        console.error("Claim schedule check failed:", err);

        // Fail open: if we can't confirm a claim exists, don't leave the
        // claimant permanently locked out by a network/server hiccup.
        if (!cancelled) {
          setClaimLocked(false);
          setClaimLockMessage("");
          setExistingClaimScheduled(null);
        }
      } finally {
        if (!cancelled) {
          setCheckingClaim(false);
        }
      }
    };

    checkExistingClaim();

    return () => {
      cancelled = true;
    };
  }, [item?.id]);

  useEffect(() => {

    if (!currentUser) {
      return;
    }


    /*
     * These fallbacks allow this component to work
     * with slightly different Account serializer names.
     */

    const firstName =
      currentUser.first_name ||
      currentUser.firstName ||
      "";


    const lastName =
      currentUser.last_name ||
      currentUser.lastName ||
      "";


    const schoolId =
      currentUser.student_id ||
      currentUser.school_id ||
      currentUser.schoolId ||
      currentUser.username ||
      "";


    let contact =
      currentUser.contact_number ||
      currentUser.contact ||
      currentUser.phone ||
      currentUser.phone_number ||
      "";


    /*
     * Always the 11-digit form (09xxxxxxxxx), even if the account
     * still stores an older +63 format.
     */

    contact = toLocalContactNumber(contact);


    setForm((previous) => ({
      ...previous,

      first_name:
        firstName,

      last_name:
        lastName,

      school_id:
        String(schoolId)
          .replace(/\D/g, "")
          .slice(0, 8),

      claimant_contact:
        contact,
    }));

  }, [currentUser]);


  // ==========================================================
  // ITEM SUMMARY (top of the form)
  //
  // A short reminder of which item is being claimed. Only public
  // board details are shown (name, category, where/when it was found,
  // ticket) — never the item's description or anything that could
  // hint at the verification answers.
  // ==========================================================

  const toTitle = (text) =>
    String(text || "")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const itemFoundDate = (() => {
    const d = parseDateOnly(item?.start_date || item?.created_date);
    return d
      ? d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : "";
  })();

  // ==========================================================
  // MINIMUM MEETING DATE
  //
  // The claimant can pick any calendar date for the verification
  // meeting, but it must fall after the date this item was
  // surrendered/found (item.created_date), and can never be in the past.
  // ==========================================================

  const minMeetingDate = (() => {

    const surrenderDate =
      parseDateOnly(item?.created_date);

    if (!surrenderDate) {
      return today;
    }

    surrenderDate.setDate(
      surrenderDate.getDate() + 1
    );

    const dayAfterSurrender =
      surrenderDate.toLocaleDateString(
        "en-CA"
      );

    return dayAfterSurrender > today
      ? dayAfterSurrender
      : today;
  })();


  // ==========================================================
  // ALL QUESTIONS ANSWERED
  //
  // True once every ownership question has a real answer (any dropdown
  // selection, including one-letter choices like "S", or free text of at
  // least 2 characters — see isAnswerComplete). This just makes
  // sure nothing is left blank — it says nothing about correctness.
  // Correctness is resolved separately by verificationStatus, via the
  // live check below.
  //
  // other_description is intentionally excluded — it's optional and
  // never gates anything.
  // ==========================================================

  const allQuestionsAnswered =
    activeQuestions.every(
      (_, index) => isAnswerComplete(answers[index], activeOptions[index])
    );


  // ==========================================================
  // LIVE VERIFY CHECK (debounced)
  //
  // Fires whenever the answers change and every question is filled in.
  // Only actually calls the backend for item-specific questions — there
  // is no recorded correct answer for the generic category fallback
  // questions, so those are treated as automatically 'correct'.
  //
  // Purely informational for staff now (via needs_manual_review sent
  // at submission time, see submitClaim) — it no longer changes
  // anything the claimant sees or does in this form. The Schedule
  // section is shown and required on both the matched and mismatched
  // paths; see the render section below.
  // ==========================================================

  useEffect(() => {

    if (!allQuestionsAnswered) {
      setVerificationStatus("idle");
      return;
    }

    if (!usingCustomQuestions || !item?.id) {
      // Nothing admin-recorded to compare against.
      setVerificationStatus("correct");
      return;
    }

    const requestId = ++verificationRequestId.current;
    let cancelled = false;

    setVerificationStatus("checking");

    const timer = setTimeout(async () => {
      try {
        const token = localStorage.getItem("accessToken");

        const res = await fetch(
          `${API_URL.replace(/\/$/, "")}/claim/verify-answers/${item.id}/`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({
              answer_1: (answers[0] || "").trim(),
              answer_2: (answers[1] || "").trim(),
              answer_3: (answers[2] || "").trim(),
              answer_4: (answers[3] || "").trim(),
            }),
          }
        );

        if (!res.ok) {
          throw new Error(`Verify-answers failed with status ${res.status}`);
        }

        const data = await res.json();

        // A newer check has already started (or this effect was
        // cleaned up) — ignore this now-stale response.
        if (cancelled || requestId !== verificationRequestId.current) return;

        setVerificationStatus(data.all_correct ? "correct" : "mismatch");
      } catch (err) {
        console.error("Answer verification check failed:", err);

        if (cancelled || requestId !== verificationRequestId.current) return;

        // Fail safe: if we can't confirm correctness, flag it for
        // manual review the same way a mismatch would be, rather than
        // silently treating an unverifiable answer as correct.
        setVerificationStatus("mismatch");
      }
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, allQuestionsAnswered, usingCustomQuestions, item?.id]);

  const answersVerified = verificationStatus === "correct";
  const answersMismatched = verificationStatus === "mismatch";
  const checkingAnswers = verificationStatus === "checking";


  // ==========================================================
  // AVAILABLE TIME SLOTS FOR SELECTED DATE
  //
  // Pulls from the SAME staff-curated slot system ClaimRequests.jsx
  // manages ("Manage Slots" → AvailableSchedule model) — not a
  // hardcoded local list. Re-fetches whenever the claimant picks a
  // meeting_date, filtering GET {API_URL}/claim/schedules/ down to
  // that date via ?date=YYYY-MM-DD (the view already excludes inactive
  // and past-dated slots; the date param narrows it further).
  //
  // If staff hasn't configured any slots for that date, this now falls
  // back to DEFAULT_TIME_OPTIONS — the same default list
  // ClaimRequests.jsx's own Schedule modal already falls back to when
  // scheduling manually — rather than leaving the claimant with
  // nothing pickable. usingDefaultSlots tracks which case we're in so
  // the dropdown can label default entries, matching the "(Default)"
  // suffix ClaimRequests.jsx uses.
  //
  // This only kicks in on a legitimately-empty (but successful)
  // response. A genuine fetch/network error still fails CLOSED
  // (empty list + slotsLoadError), since in that case we don't
  // actually know what's available and showing defaults would be
  // misleading rather than helpful.
  //
  // NOTE: this does not yet exclude a slot that's already been booked
  // by another claimant for that exact date/time — scheduling a
  // meeting (schedule_meeting view) doesn't currently deactivate the
  // corresponding AvailableSchedule row, and the same gap exists in
  // ClaimRequests.jsx's own schedule picker. Flagging this in case
  // double-booking prevention is wanted; not changed here since it
  // wasn't part of what was asked.
  // ==========================================================

  const [availableTimeSlots, setAvailableTimeSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsLoadError, setSlotsLoadError] = useState(false);
  const [usingDefaultSlots, setUsingDefaultSlots] = useState(false);
  // Days / slots staff disabled in Claim Requests → Manage Slots.
  // wholeDayBlock: the block for the whole selected day (or null).
  const [wholeDayBlock, setWholeDayBlock] = useState(null);
  const [blockedSlotCount, setBlockedSlotCount] = useState(0);

  // Drop a picked time that isn't offered on the newly chosen date
  // (e.g. a 2 PM slot after switching to a Saturday).
  useEffect(() => {
    if (form.meeting_time && !loadingSlots && !availableTimeSlots.includes(form.meeting_time)) {
      setForm((prev) => ({ ...prev, meeting_time: "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableTimeSlots, loadingSlots]);

  useEffect(() => {
    if (!form.meeting_date) {
      setAvailableTimeSlots([]);
      setSlotsLoadError(false);
      setUsingDefaultSlots(false);
      setWholeDayBlock(null);
      setBlockedSlotCount(0);
      return;
    }

    let cancelled = false;

    const fetchAvailableSlots = async () => {
      try {
        setLoadingSlots(true);
        setSlotsLoadError(false);

        const token = localStorage.getItem("accessToken");

        const res = await fetch(
          `${API_URL.replace(/\/$/, "")}/claim/schedules/?date=${form.meeting_date}`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          }
        );

        if (!res.ok) {
          throw new Error(`Schedules fetch failed with status ${res.status}`);
        }

        const data = await res.json();
        if (cancelled) return;

        const times = Array.isArray(data)
          ? data.map((slot) => slot.time_slot).filter(Boolean)
          : [];

        // Slots staff disabled for this date (Manage Slots). If this
        // lookup fails the server still rejects a disabled slot on
        // submit, so it's safe to carry on without it.
        let blocks = [];
        try {
          const blockedRes = await fetch(
            `${API_URL.replace(/\/$/, "")}/claim/blocked-slots/?date=${form.meeting_date}`
          );
          if (blockedRes.ok) {
            const blockedData = await blockedRes.json();
            blocks = Array.isArray(blockedData) ? blockedData : [];
          }
        } catch (blockErr) {
          console.error("Failed to load disabled slots:", blockErr);
        }
        if (cancelled) return;

        const dayBlock = blocks.find((b) => !b.time_slot) || null;
        const blockedTimes = new Set(blocks.map((b) => b.time_slot).filter(Boolean));
        const openOnly = (list) =>
          dayBlock ? [] : list.filter((t) => !blockedTimes.has(t));

        setWholeDayBlock(dayBlock);

        if (times.length > 0) {
          const allowed = slotsAllowedOn(form.meeting_date, times);
          setAvailableTimeSlots(openOnly(allowed));
          setBlockedSlotCount(dayBlock ? 0 : allowed.filter((t) => blockedTimes.has(t)).length);
          setUsingDefaultSlots(false);
        } else {
          // No staff-configured slots for this date — offer the same
          // default options staff themselves fall back to when
          // scheduling manually, rather than leaving the claimant with
          // nothing to pick.
          const allowed = slotsAllowedOn(form.meeting_date, DEFAULT_TIME_OPTIONS);
          setAvailableTimeSlots(openOnly(allowed));
          setBlockedSlotCount(dayBlock ? 0 : allowed.filter((t) => blockedTimes.has(t)).length);
          setUsingDefaultSlots(true);
        }
      } catch (err) {
        console.error("Failed to load available time slots:", err);

        if (!cancelled) {
          setAvailableTimeSlots([]);
          setSlotsLoadError(true);
          setUsingDefaultSlots(false);
          setWholeDayBlock(null);
          setBlockedSlotCount(0);
        }
      } finally {
        if (!cancelled) {
          setLoadingSlots(false);
        }
      }
    };

    fetchAvailableSlots();

    return () => {
      cancelled = true;
    };
  }, [form.meeting_date]);


  // ==========================================================
  // SET FORM
  // ==========================================================

  const set = (
    key,
    value
  ) => {

    setValidationError("");

    setForm(
      (previous) => ({
        ...previous,
        [key]: value,
      })
    );
  };


  // ==========================================================
  // SET ANSWER
  // ==========================================================

  const setAnswer = (
    index,
    value
  ) => {

    setValidationError("");

    setAnswers(
      (previous) => {

        const updated = [
          ...previous,
        ];

        updated[index] =
          value;

        return updated;
      }
    );
  };


  // ==========================================================
  // VALIDATE FORM
  //
  // All the checks needed before opening the "Review Your Claim"
  // modal. Runs for both paths: mismatched and matched answers now
  // both require a picked meeting date/time — see the SCHEDULE check
  // below — since the Schedule section is shown unconditionally once
  // every question is answered. Sets validationError and returns
  // false on the first failing check; clears validationError and
  // returns true once everything passes.
  //
  // A wrong guess (or a still-in-flight/unavailable live check) never
  // blocks submission outright — it only affects what staff sees on
  // their end (a flagged mismatch requiring Approve/Decline in
  // ClaimRequests.jsx) via needs_manual_review, set in submitClaim
  // below.
  // ------------------------------------------------------
  const validateForm = () => {

    if (claimLocked) {
      setValidationError(
        existingClaimScheduled
          ? "A verification meeting has already been scheduled for this item."
          : "You've already submitted a claim for this item — it's pending review."
      );
      return false;
    }

    // ------------------------------------------------------
    // USER
    // ------------------------------------------------------

    if (!currentUser) {

      setValidationError(
        "You must be logged in to submit a claim."
      );

      return false;
    }


    // ------------------------------------------------------
    // ACCOUNT INFORMATION
    // ------------------------------------------------------

    if (
      !form.first_name.trim() ||
      !form.last_name.trim() ||
      !form.school_id.trim()
    ) {

      setValidationError(
        "Your account information is incomplete. Please update your account profile."
      );

      return false;
    }


    // ------------------------------------------------------
    // SCHOOL ID
    // ------------------------------------------------------

    if (
      form.school_id.length !== 8
    ) {

      setValidationError(
        "Your school ID must contain 8 digits."
      );

      return false;
    }


    // ------------------------------------------------------
    // CONTACT
    // ------------------------------------------------------

    // Contact number is optional — only checked when one is on file.
    if (contactNumberError(form.claimant_contact)) {

      setValidationError(
        "Your contact number must be exactly 11 digits. Update it in My Profile."
      );

      return false;
    }


    // ------------------------------------------------------
    // ANSWERS
    //
    // Only checks that every question has been answered: any dropdown
    // choice counts (even one letter, like "S"), and typed answers need
    // at least 2 characters. Correctness is a separate concern, already
    // tracked in verificationStatus — and it no longer gates
    // submission at all (see note above).
    // ------------------------------------------------------

    for (
      let index = 0;
      index < activeQuestions.length;
      index++
    ) {

      if (
        !answers[index].trim()
      ) {

        setValidationError(
          `Please answer Question ${index + 1}.`
        );

        return false;
      }


      if (
        !isAnswerComplete(answers[index], activeOptions[index])
      ) {

        setValidationError(
          `Please provide more detail for Question ${index + 1}.`
        );

        return false;
      }
    }

    // ------------------------------------------------------
    // STILL VERIFYING
    //
    // Pauses submission only during the brief in-flight "checking"
    // state itself, so needs_manual_review (sent in submitClaim) is
    // computed off a settled result rather than a stale one. It
    // always settles to 'correct' or 'mismatch' within ~600ms + one
    // request (the effect's catch block falls back to 'mismatch' on
    // any error), so this never stalls indefinitely — it's just a
    // brief pause, not a block.
    // ------------------------------------------------------

    if (checkingAnswers) {
      setValidationError(
        "Still verifying your answers — please wait a moment."
      );
      return false;
    }

    // ------------------------------------------------------
    // SCHEDULE
    //
    // Required on BOTH paths now — matched or mismatched — since the
    // Schedule section is always shown once every question is
    // answered (see the render section below). A mismatched claim
    // still gets flagged for staff review in ClaimRequests.jsx (via
    // needs_manual_review, set in submitClaim below), but the
    // claimant's requested slot goes along with it either way, rather
    // than leaving staff to pick one from scratch.
    // ------------------------------------------------------

    if (!form.meeting_date || !form.meeting_time) {

      setValidationError(
        "Please select a verification date and time."
      );

      return false;
    }

    // other_description is deliberately NOT validated here — it's
    // optional and submission must succeed whether or not it's filled.

    setValidationError("");
    return true;
  };


  // ==========================================================
  // MAIN "REVIEW & SUBMIT" BUTTON
  //
  // The single entry point into the "Review Your Claim" modal, for
  // BOTH paths. Runs validateForm(); on success, opens the Review
  // modal instead of submitting right away, so the claimant gets one
  // last look before anything is actually sent. Real submission
  // happens in submitClaim(), triggered from that modal's "Confirm &
  // Submit".
  //
  // validateForm() itself now requires form.meeting_date/meeting_time
  // to already be set on both paths — so the claimant naturally has
  // to pick a date and time in the Schedule section above before this
  // button will let them through. No separate confirmation step in
  // between picking a time and pressing this button is needed.
  // ------------------------------------------------------
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setShowConfirmModal(true);
  };


  // ==========================================================
  // SUBMIT CLAIM (shared)
  //
  // The actual API call — everything above it has already been
  // validated (via validateForm(), called from handleSubmit), so this
  // trusts the current form/answers state as-is. This is the ONLY
  // place a claim is actually submitted, reached from the "Review Your
  // Claim" modal's "Confirm & Submit" button for BOTH paths.
  // On success, shows the inline "submitted" screen within this same
  // modal so the claimant sees a confirmation before choosing to close
  // it themselves via "Done".
  //
  // meeting_date/meeting_time are now ALWAYS the claimant's picked
  // slot, regardless of whether their answers matched — validateForm()
  // already guarantees both are set before this runs. needs_manual_review
  // still carries the match/mismatch signal separately, so staff in
  // ClaimRequests.jsx still see a flagged claim requiring an explicit
  // Approve/Decline — they just see it with the claimant's requested
  // meeting slot already attached instead of nothing.
  // ==========================================================

  const submitClaim = async () => {

    if (loading) {
      return;
    }

    setLoading(true);
    setValidationError("");


    // ------------------------------------------------------
    // CLAIMANT
    // ------------------------------------------------------

    const fullEmail =
      currentUser.email ||
      `${form.school_id}@slc-sflu.edu.ph`;


    const fullName =
      `${form.first_name.trim()} ${form.last_name.trim()}`;


    // ------------------------------------------------------
    // LEGACY DESCRIPTION
    //
    // We still create this for compatibility with old UI/API.
    // The real data is question_1...answer_4. The optional "Other
    // Unique Description" text, if provided, is appended at the end
    // so staff still see it even though it has no dedicated field.
    // ------------------------------------------------------

    const trimmedOtherDescription =
      (form.other_description || "").trim();

    const legacyProof =
      activeQuestions
        .map(
          (question, index) =>
            `${index + 1}. ${question}\nAnswer: ${answers[index].trim()}`
        )
        .join("\n\n") +
      (trimmedOtherDescription
        ? `\n\nOther Unique Description:\n${trimmedOtherDescription}`
        : "");


    try {

      await submitClaimRequest({

        item:
          item.id,

        claimant_name:
          fullName,

        claimant_contact:
          form.claimant_contact || "",

        claimant_email:
          fullEmail,

        // Always the claimant's picked slot now — validateForm()
        // guarantees both are set before submitClaim runs, whether or
        // not the answers matched. A mismatched-but-scheduled claim
        // still gets flagged via needs_manual_review below, so staff
        // know to review it before treating the slot as confirmed.
        meeting_date:
          form.meeting_date,

        meeting_time:
          form.meeting_time,

        // NOTE: included as an empty string in case the backend Claim
        // model requires "meeting_location" with no default — if so,
        // every submission (matched or mismatched) would 400 with
        // "This field is required." regardless of meeting_date/time,
        // which matches the symptom of every claim failing to submit.
        // Safe to leave blank; staff fill in an actual location when
        // they confirm the meeting from ClaimRequests.jsx. Remove this
        // line if the backend model doesn't require it.
        meeting_location:
          "",


        question_1:
          activeQuestions[0] || "",

        answer_1:
          (answers[0] || "").trim(),


        question_2:
          activeQuestions[1] || "",

        answer_2:
          (answers[1] || "").trim(),


        question_3:
          activeQuestions[2] || "",

        answer_3:
          (answers[2] || "").trim(),


        question_4:
          activeQuestions[3] || "",

        answer_4:
          (answers[3] || "").trim(),


        // NOTE: assumes the backend serializer accepts an
        // "other_description" field. If it doesn't, this will be
        // silently ignored by DRF (or rejected, depending on your
        // serializer's settings) — the text will still make it to
        // staff via proof_description below either way.
        other_description:
          trimmedOtherDescription,


        // This is now the ONLY signal that distinguishes a
        // matched from a mismatched submission — both send a real
        // meeting_date/meeting_time. ClaimRequests.jsx's
        // isPendingReview() treats needs_manual_review as requiring
        // staff to explicitly Approve/Decline before the claimant's
        // picked slot is treated as final, even though the slot is
        // already attached to the claim.
        needs_manual_review:
          !answersVerified,


        proof_description:
          legacyProof,
      });


      setShowConfirmModal(false);

      // Tell the parent (landing page) right away so it can lock the
      // Claim button for this item immediately — don't wait for the
      // next background refetch, and don't gate this on the "Done"
      // button, since the claimant may close the modal another way.
      // Always passes the real slot now, since one is always picked.
      if (onSuccess) {
        onSuccess(
          item.id,
          form.meeting_date,
          form.meeting_time
        );
      }

      // Show the inline "submitted" screen and lock the item so the
      // claimant can't reopen this same flow again — the backend
      // treats any existing claim for this item/claimant as a
      // permanent duplicate block (see checkExistingClaim above), so
      // this lock is not time-limited. A meeting slot is always
      // attached now, so this always reflects the "scheduled" case —
      // a mismatch is still flagged for staff internally via
      // needs_manual_review, but the claimant sees their meeting
      // details either way.
      setSubmitted(true);
      setClaimLocked(true);
      setExistingClaimScheduled(true);
      setClaimLockMessage(
        `You've already submitted a claim for this item, and a verification meeting is scheduled on ${form.meeting_date} (${form.meeting_time}).`
      );

    } catch (err) {

      console.error(
        "Claim submission failed:",
        err
      );

      console.error(
        "Server response:",
        err?.response?.data
      );


      const responseData =
        err?.response?.data;


      const message =
        responseData?.meeting_location?.[0] ||
        responseData?.meeting_date?.[0] ||
        responseData?.meeting_time?.[0] ||
        responseData?.answer_1?.[0] ||
        responseData?.answer_2?.[0] ||
        responseData?.answer_3?.[0] ||
        responseData?.answer_4?.[0] ||
        responseData?.claimant_contact?.[0] ||
        responseData?.claimant_email?.[0] ||
        responseData?.item?.[0] ||
        responseData?.detail ||
        responseData?.non_field_errors?.[0] ||
        "Failed to submit claim request. Please try again.";


      // Close the Review Your Claim modal so the claimant sees the
      // error banner on the underlying form and can correct/retry —
      // the underlying ClaimModal itself stays open, since we only
      // close on SUCCESS.
      setShowConfirmModal(false);

      setValidationError(
        message
      );

      // DEFENSIVE FALLBACK: if the backend rejected this specifically
      // because a claim already exists ("You already submitted a claim
      // request for this item."), lock the form immediately instead of
      // leaving it open for another identical failed attempt. This
      // covers any gap between what checkExistingClaim saw on mount
      // and the backend's live uniqueness check at submit time (e.g. a
      // claim created in another tab/session moments earlier).
      if (
        typeof message === "string" &&
        message.toLowerCase().includes("already submitted a claim")
      ) {
        setClaimLocked(true);
        setClaimLockMessage(message);
      }

    } finally {

      setLoading(false);
    }
  };


  // Thin wrapper for the "Review Your Claim" modal's "Confirm & Submit"
  // button — that modal only opens after validateForm() has already
  // passed (via handleSubmit), so no re-validation needed here.
  const confirmAndSubmitClaim = () => submitClaim();


  // ==========================================================
  // RENDER
  // ==========================================================

  return (

    <>

      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-3 sm:p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget && !loading) {
            onClose();
          }
        }}
      >

        <div
          className={`bg-white w-full ${
            // The confirmation / "already submitted" screens are small
            // cards; only the claim form itself needs the wide window.
            submitted || claimLocked ? "max-w-sm sm:max-w-md" : "max-w-2xl sm:max-w-3xl"
          } max-h-[92vh] rounded-xl sm:rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,.18)] overflow-hidden flex flex-col`}
        >

          {submitted ? (
            <div className="w-full px-6 sm:px-8 py-7 text-center flex flex-col items-center justify-center font-sans">
              <div className="text-5xl mb-6">
                {form.meeting_date && form.meeting_time ? "✅" : "🕓"}
              </div>

              <h3 className="font-bold text-[#184C73] text-[17px] uppercase tracking-wide">
                {form.meeting_date && form.meeting_time
                  ? "Claim Submitted"
                  : "Claim Submitted for Review"}
              </h3>

              <p className="text-slate-500 text-[13px] font-semibold mt-5 leading-relaxed max-w-md">
                {form.meeting_date && form.meeting_time
                  ? "Your ownership information will be reviewed by the Student Affairs Office."
                  : "A moderator will manually review your answers against our records. You'll be contacted to set up a verification meeting once your claim has been reviewed."}
              </p>

              {form.meeting_date && form.meeting_time ? (
                <div className="mt-5 w-full rounded-xl border border-[#B9DCEB] bg-[#F0FAFD] px-5 py-4 text-left">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0B6FA4] mb-2">
                    Verification Meeting
                  </p>

                  <div className="flex items-center justify-between text-[13px]">
                    <span className="font-semibold text-slate-500">Date</span>
                    <span className="font-bold text-slate-800">
                      {parseDateOnly(form.meeting_date)?.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }) || form.meeting_date}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[13px] mt-1.5">
                    <span className="font-semibold text-slate-500">Time</span>
                    <span className="font-bold text-slate-800">{form.meeting_time}</span>
                  </div>

                  <p className="mt-3 text-[11px] font-medium text-slate-400 leading-relaxed">
                    Please arrive on time with a valid school ID. You'll be notified once your claim is approved.
                  </p>

                  {/* Always shown (never only on a mismatch), so this screen
                      can't reveal whether the answers matched. */}
                  <p className="mt-3 text-[11px] font-semibold text-amber-600 leading-relaxed">
                    Your answers will still be checked by a moderator before this meeting is
                    confirmed — you may be contacted if anything needs to be clarified.
                  </p>

                  <p className="mt-3 text-[11px] font-semibold text-[#0B6FA4] leading-relaxed">
                    You won't be able to submit another claim for this item until this meeting time has passed.
                  </p>
                </div>
              ) : (
                <div className="mt-5 w-full rounded-xl border border-amber-300 bg-amber-50 px-5 py-4 text-left">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700 mb-2">
                    Pending Moderator Review
                  </p>
                  <p className="text-[12px] font-semibold text-slate-600 leading-relaxed">
                    You've already answered the ownership verification questions and submitted them —
                    there's no need to submit another claim for this item. The Student Affairs Office
                    will review your answers and reach out to arrange a meeting time.
                  </p>
                </div>
              )}

              <button
                onClick={onClose}
                className="mt-6 w-full bg-gradient-to-r from-[#0B648D] to-[#155F87] text-white py-3 rounded-xl font-bold uppercase tracking-wide text-[13px] hover:opacity-90 transition-all"
              >
                Done
              </button>

              {/* This closes on its own shortly after — see the
                  auto-close effect keyed on `submitted` above. Done
                  just lets the claimant skip the wait. */}
              <p className="mt-3 text-[11px] font-medium text-slate-400">
                Returning to the board automatically...
              </p>
            </div>
          ) : claimLocked ? (
            // ==========================================================
            // ALREADY-CLAIMED SCREEN — this is what renders when the
            // claimant opens the modal via the "View" button (i.e.
            // PublicBoard's hasUserClaimed(item) was already true).
            //
            // Shown INSTEAD of the answer/schedule form the moment
            // checkExistingClaim confirms an active claim already
            // exists for this item — so a returning claimant sees
            // "you already answered and submitted this" immediately on
            // opening the modal, rather than being let back into the
            // question form only to be blocked at the very end by
            // validateForm()'s claimLocked check. Nothing here is
            // editable; it's purely informational, with the same
            // scheduled-vs-pending distinction as the post-submit
            // screen above.
            // ==========================================================
            <div className="w-full px-6 sm:px-8 py-7 text-center flex flex-col items-center justify-center font-sans">
              <div className="text-4xl mb-4">
                {existingClaimScheduled ? "✅" : "🕓"}
              </div>

              <h3 className="font-bold text-[#184C73] text-[17px] uppercase tracking-wide">
                Claim Already Submitted
              </h3>

              <p className="text-slate-500 text-[13px] font-semibold mt-3 leading-relaxed">
                You've already answered the ownership verification questions for this item and
                submitted your claim — there's no need to submit it again.
              </p>

              <div
                className={`mt-5 w-full rounded-xl border px-4 py-3 text-left ${
                  existingClaimScheduled
                    ? "border-[#B9DCEB] bg-[#F0FAFD]"
                    : "border-amber-300 bg-amber-50"
                }`}
              >
                <p
                  className={`text-[10px] font-black uppercase tracking-[0.2em] mb-2 ${
                    existingClaimScheduled ? "text-[#0B6FA4]" : "text-amber-700"
                  }`}
                >
                  {existingClaimScheduled ? "Verification Meeting" : "Pending Moderator Review"}
                </p>

                <p className="text-[12px] font-semibold text-slate-600 leading-relaxed">
                  {claimLockMessage}
                </p>
              </div>

              <button
                onClick={onClose}
                className="mt-6 w-full bg-gradient-to-r from-[#0B648D] to-[#155F87] text-white py-3 rounded-xl font-bold uppercase tracking-wide text-[13px] hover:opacity-90 transition-all"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="bg-gradient-to-r from-[#0B648D] to-[#155F87] text-white px-4 sm:px-6 py-3 sm:py-4 border-b-4 flex justify-between items-start gap-4">
                <div>
                  <h2 className="text-[15px] font-bold">
                    Claim Item
                  </h2>

                  <p className="text-blue-100 text-[13px] mt-1">
                    Submit your ownership request
                  </p>
                </div>

                <button
                  onClick={onClose}
                  disabled={loading}
                  className="w-8 h-8 flex-shrink-0 rounded-full bg-white/15 hover:bg-white/25 transition flex items-center justify-center text-white font-bold text-[15px] disabled:opacity-50"
                >
                  ×
                </button>
              </div>

              {/* Form Container */}
              <form onSubmit={handleSubmit} noValidate className="overflow-y-auto p-4 sm:p-6 space-y-5 font-sans">

                {/* =================================================
                    ERROR
                ================================================= */}

                {validationError && (
                  <div className="rounded-lg border border-red-500 bg-red-50 px-4 py-3 text-red-600 text-[13px] font-semibold">
                    {validationError}
                  </div>
                )}


                {/* =================================================
                    ITEM BEING CLAIMED
                ================================================= */}

                <div className="rounded-lg border border-[#B9DCEB] bg-gradient-to-r from-[#F0FAFD] to-white px-4 py-3.5">

                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0B6B8A] mb-1.5">
                    You're claiming
                  </p>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <p className="text-[15px] font-bold text-slate-800">
                      {toTitle(item?.title || item?.name) || "Unnamed item"}
                    </p>

                    {item?.category && (
                      <span className="rounded-full bg-[#0B6B8A]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#0B6B8A]">
                        {toTitle(item.category)}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-3">
                    {item?.location && (
                      <p className="min-w-0 text-slate-500">
                        <span className="font-semibold text-slate-400">Found at </span>
                        <span className="font-semibold text-slate-700 break-words">{toTitle(item.location)}</span>
                      </p>
                    )}

                    {itemFoundDate && (
                      <p className="text-slate-500">
                        <span className="font-semibold text-slate-400">Found on </span>
                        <span className="font-semibold text-slate-700">{itemFoundDate}</span>
                      </p>
                    )}

                    {item?.ticket_code && (
                      <p className="text-slate-500">
                        <span className="font-semibold text-slate-400">Ticket </span>
                        <span className="font-semibold text-slate-700">{item.ticket_code}</span>
                      </p>
                    )}
                  </div>

                </div>


                {/* =================================================
                    ACCOUNT INFORMATION
                ================================================= */}

                <div className="space-y-1.5">

                  <div className="flex items-center justify-between mb-1.5">

                    <label className="block text-[13px] font-semibold text-slate-500">
                      Claimant Information
                    </label>

                    <span className="text-[11px] font-bold text-emerald-600">
                      ✓ From your account
                    </span>

                  </div>


                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

                    <div className="space-y-1.5">

                      <label className="block text-[13px] font-semibold text-slate-500 mb-1.5">
                        First Name
                      </label>

                      <input
                        type="text"
                        value={form.first_name}
                        readOnly
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-slate-50 text-[13px] font-semibold text-slate-600 outline-none"
                      />

                    </div>


                    <div className="space-y-1.5">

                      <label className="block text-[13px] font-semibold text-slate-500 mb-1.5">
                        Last Name
                      </label>

                      <input
                        type="text"
                        value={form.last_name}
                        readOnly
                        className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-slate-50 text-[13px] font-semibold text-slate-600 outline-none"
                      />

                    </div>


                    <div className="space-y-1.5">

                      <label className="block text-[13px] font-semibold text-slate-500 mb-1.5">
                        School ID
                      </label>

                      <div className="flex rounded-lg border border-slate-300 overflow-hidden bg-slate-50">

                        <input
                          type="text"
                          value={form.school_id}
                          readOnly
                          className="w-full px-3.5 py-2.5 outline-none bg-transparent text-[13px] font-semibold text-slate-600"
                        />

                        <span className="bg-slate-200 px-3 flex items-center text-[11px] font-semibold text-slate-600 whitespace-nowrap">
                          @slc-sflu.edu.ph
                        </span>

                      </div>

                    </div>


                    <div className="space-y-1.5">

                      <label className="block text-[13px] font-semibold text-slate-500 mb-1.5">
                        Contact Number <span className="font-normal text-slate-400">(optional)</span>
                      </label>

                      <div className="flex rounded-lg border border-slate-300 overflow-hidden bg-slate-50">

                        <input
                          type="text"
                          value={form.claimant_contact}
                          readOnly
                          placeholder="Not provided"
                          className="w-full px-3.5 py-2.5 outline-none bg-transparent text-[13px] font-semibold text-slate-600 placeholder:font-normal placeholder:text-slate-400"
                        />

                      </div>

                    </div>

                  </div>

                </div>


                {/* =================================================
                    QUESTIONS
                ================================================= */}

                <div className="rounded-lg border border-[#B9DCEB] bg-[#F0FAFD] p-4 sm:p-5">

                  <div className="mb-4">

                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0B6FA4]">
                      Ownership Verification
                    </p>

                    {usingCustomQuestions ? (
                      <p className="mt-1 text-[13px] font-semibold text-slate-600">
                        Please answer the questions below to help us verify you're
                        the true owner of this item.
                      </p>
                    ) : (
                      <p className="mt-1 text-[13px] font-semibold text-slate-600">

                        Since this item is categorized as{" "}

                        <span className="text-slate-800">
                          {item?.category ||
                            "Unknown"}
                        </span>

                        , please answer each question below.

                      </p>
                    )}

                  </div>


                  <div className="space-y-3">

                    {activeQuestions.map(
                      (question, index) => (

                        <div
                          key={index}
                          className="rounded-lg border border-[#B9DCEB] bg-white p-3.5"
                        >

                          <label className="block">

                            <div className="flex gap-2.5 mb-2.5">

                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0B648D] text-[10px] font-black text-white mt-0.5">
                                {index + 1}
                              </span>

                              <span className="text-[13px] font-semibold text-slate-700 leading-5">
                                {question}
                              </span>

                            </div>


                            {activeOptions[index] ? (

                              <select
                                value={
                                  answers[index]
                                }

                                onChange={(e) =>
                                  setAnswer(
                                    index,
                                    e.target.value
                                  )
                                }

                                disabled={loading}

                                className={`w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-[13px] font-semibold outline-none transition-all duration-200 focus:border-[#155F87] focus:ring-2 focus:ring-[#0B648D]/20 ${
                                  answers[index]
                                    ? "text-slate-800"
                                    : "text-slate-400 font-normal"
                                }`}
                              >

                                <option value="">
                                  Select an answer
                                </option>

                                {activeOptions[index].map(
                                  (option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  )
                                )}

                              </select>

                            ) : (

                              <input
                                type="text"
                                value={
                                  answers[index]
                                }

                                onChange={(e) =>
                                  setAnswer(
                                    index,
                                    e.target.value
                                  )
                                }

                                disabled={loading}

                                placeholder={
                                  activePlaceholders[
                                    index
                                  ]
                                }

                                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-[13px] font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal outline-none transition-all duration-200 focus:border-[#155F87] focus:ring-2 focus:ring-[#0B648D]/20"
                              />
                            )}

                          </label>

                        </div>

                      )
                    )}

                    {/* =============================================
                        OTHER UNIQUE DESCRIPTION (OPTIONAL)
                        Free-text add-on, not one of the numbered
                        questions and never required to submit.
                    ============================================= */}

                    <div className="rounded-lg border border-[#B9DCEB] bg-white p-3.5">

                      <label className="block">

                        <div className="flex items-center gap-2.5 mb-2.5">

                          <span className="text-[13px] font-semibold text-slate-700 leading-5">
                            Other Unique Description
                          </span>

                          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            Optional
                          </span>

                        </div>

                        <textarea
                          rows={3}
                          value={form.other_description}
                          onChange={(e) =>
                            set(
                              "other_description",
                              e.target.value
                            )
                          }
                          disabled={loading}
                          placeholder="Anything else that could help confirm this item is yours (optional)"
                          maxLength={300}
                          className="w-full resize-none px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-[13px] font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-normal outline-none transition-all duration-200 focus:border-[#155F87] focus:ring-2 focus:ring-[#0B648D]/20"
                        />

                        <p className="mt-1 text-right text-[11px] text-slate-400">
                          {form.other_description.length}/300 characters
                        </p>

                      </label>

                    </div>
                  </div>

                  {/* Live verification status hint.
                      NOTE: only the "checking" spinner is shown here.
                      The mismatch case is intentionally NOT rendered —
                      telling the claimant their answers didn't match
                      would let them keep guessing toward the recorded
                      answer by trial and error. The form stays neutral
                      either way; the Schedule section below appears
                      the same regardless of match/mismatch, so nothing
                      in the visible flow tips the claimant off. */}
                  {allQuestionsAnswered && checkingAnswers && (
                    <p className="mt-4 flex items-center gap-2 text-[11px] font-semibold text-slate-400">
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-[#0B648D]" />
                      Verifying your answers...
                    </p>
                  )}

                  <p className="mt-4 text-[11px] font-semibold text-slate-400">
                    Be specific. Your answers will be reviewed by the moderator before the claim is granted.
                  </p>

                </div>

                {/* =================================================
                    SCHEDULE
                    Shown once every ownership question is answered —
                    regardless of whether those answers verified
                    correctly. A mismatch no longer skips this section:
                    the claimant always picks a meeting date/time and
                    submits, the same as a matched claimant would. The
                    only difference happens on staff's side afterward —
                    a mismatched submission is flagged for manual
                    Approve/Decline in ClaimRequests.jsx via
                    needs_manual_review (see submitClaim), rather than
                    the claimant being blocked from scheduling at all.

                    Picking a time here just fills form.meeting_time —
                    it does NOT open any confirmation popup. The
                    claimant then presses the single "Review & Submit"
                    button below to move on; validateForm() requires
                    both meeting_date and meeting_time to be set before
                    it'll let them through to the Review modal.
                ================================================= */}

                {allQuestionsAnswered && (

                  <div className="space-y-1.5">

                    <label className="block text-[13px] font-semibold text-slate-500 mb-1.5">
                      Verification Schedule
                    </label>


                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

                      <div className="space-y-1.5">

                        <label className="block text-[13px] font-semibold text-slate-500 mb-1.5">
                          Preferred Date *
                        </label>

                        <input
                          className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-[13px] font-semibold text-slate-800 outline-none transition-all duration-200 focus:border-[#155F87] focus:ring-2 focus:ring-[#0B648D]/20"
                          type="date"
                          value={form.meeting_date}
                          min={minMeetingDate}
                          onChange={(e) => {

                            set(
                              "meeting_date",
                              e.target.value
                            );

                            set(
                              "meeting_time",
                              ""
                            );
                          }}
                          disabled={loading}
                        />

                        <p className="text-[11px] font-medium text-slate-400">
                          Must be after the date this item was surrendered.
                        </p>

                      </div>


                      <div className="space-y-1.5">

                        <label className="block text-[13px] font-semibold text-slate-500 mb-1.5">
                          Preferred Time *
                        </label>

                        <select
                          disabled={
                            !form.meeting_date ||
                            loading ||
                            loadingSlots ||
                            slotsLoadError ||
                            !!wholeDayBlock
                          }

                          value={
                            form.meeting_time
                          }

                          onChange={(e) => {
                            set(
                              "meeting_time",
                              e.target.value
                            );
                          }}

                          className={`w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-[13px] font-semibold outline-none transition-all duration-200 focus:border-[#155F87] focus:ring-2 focus:ring-[#0B648D]/20 disabled:bg-slate-100 ${
                            form.meeting_time ? "text-slate-800" : "text-slate-400 font-normal"
                          }`}
                        >

                          <option value="">

                            {!form.meeting_date
                              ? "Select date first"
                              : loadingSlots
                              ? "Checking availability..."
                              : slotsLoadError
                              ? "Couldn't load slots"
                              : wholeDayBlock
                              ? "Unavailable on this day"
                              : availableTimeSlots.length === 0 && weekdayOf(form.meeting_date) !== 0
                              ? "No slots left on this day"
                              : "Select time slot"}

                          </option>

                          {availableTimeSlots.map(
                            (time) => (

                              <option
                                key={time}
                                value={time}
                              >
                                {time}
                                {usingDefaultSlots ? " (Default)" : ""}
                              </option>
                            )
                          )}
                        </select>

                        {form.meeting_date && !loadingSlots && slotsLoadError && (
                          <p className="text-[11px] font-semibold text-red-600">
                            Couldn't check slot availability — please try again.
                          </p>
                        )}

                        {form.meeting_date && !loadingSlots && wholeDayBlock && (
                          <p className="text-[11px] font-semibold text-red-600">
                            The Student Affairs Office isn't accepting claim meetings on this day
                            {wholeDayBlock.reason ? ` (${wholeDayBlock.reason})` : ""} — please choose another day.
                          </p>
                        )}

                        {form.meeting_date && !loadingSlots && !wholeDayBlock && blockedSlotCount > 0 && (
                          <p className="text-[11px] font-semibold text-amber-600">
                            Some time slots on this day are unavailable and have been hidden.
                          </p>
                        )}

                        {weekdayOf(form.meeting_date) === 0 && (
                          <p className="text-[11px] font-semibold text-red-600">
                            There are no meeting slots on Sundays — please choose another day.
                          </p>
                        )}

                        {weekdayOf(form.meeting_date) === 6 && (
                          <p className="text-[11px] font-semibold text-amber-600">
                            Saturday meetings are only from 8:00 AM to 11:00 AM.
                          </p>
                        )}

                        {form.meeting_date && !loadingSlots && !slotsLoadError && usingDefaultSlots && !wholeDayBlock && weekdayOf(form.meeting_date) !== 0 && (
                          <p className="text-[11px] font-medium text-slate-400">
                            No slots have been configured for this date yet — showing default time options.
                          </p>
                        )}

                        {form.meeting_date && form.meeting_time && (
                          <p className="text-[11px] font-semibold text-[#0B6FA4]">
                            {form.meeting_time} selected — press "Review &amp; Submit" below to continue.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {/* =================================================
                    BUTTONS
                    NOTE: Submit IS disabled while checkingAnswers — but
                    only to avoid the brief race where the mismatch
                    signal sent as needs_manual_review hasn't finished
                    settling yet. This is a short, self-resolving pause;
                    it never blocks on a confirmed mismatch itself —
                    once verificationStatus settles either way, Submit
                    is available.
                ================================================= */}
                <div className="flex gap-3 pt-2">

                  <button
                    type="button"
                    onClick={onClose}
                    disabled={loading}
                    className="flex-1 py-2.5 rounded-lg bg-slate-100 text-slate-500 text-[13px] font-bold uppercase tracking-wide transition duration-200 hover:bg-slate-200 disabled:opacity-50"
                  >
                    Cancel
                  </button>


                  <button
                    type="submit"
                    disabled={loading || checkingClaim || claimLocked || checkingAnswers}
                    className={`flex-1 py-2.5 rounded-lg text-white text-[13px] font-bold uppercase tracking-wide shadow-md transition-all duration-200 ${
                      claimLocked
                        ? "bg-gray-400 cursor-not-allowed"
                        : "bg-gradient-to-r from-[#0B648D] to-[#155F87] hover:opacity-90 active:scale-[0.98]"
                    }`}
                  >
                    {checkingClaim
                      ? "Checking..."
                      : loading
                      ? "Submitting..."
                      : claimLocked
                      ? "Meeting Already Scheduled"
                      : checkingAnswers
                      ? "Verifying..."
                      : "Review & Submit"}
                  </button>

                </div>

              </form>

            </>
          )}

        </div>

      </div>

      {/* =====================================================
          CONFIRMATION MODAL — "Review Your Claim"
          The single place the claim is actually submitted, for BOTH
          paths. Reached from the main form's "Review & Submit" button
          once validateForm() passes — a date/time was already picked
          in the Schedule section above either way. Lets the claimant
          review everything they've entered — one last chance to catch
          a typo in a free-text answer or the wrong meeting slot —
          before committing. "Confirm & Submit" triggers
          confirmAndSubmitClaim(); "Go Back" just closes this and
          returns to the editable form.
      ===================================================== */}

      {showConfirmModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-4">
          <div className="bg-white w-full max-w-lg max-h-[90vh] rounded-xl sm:rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,.25)] overflow-hidden flex flex-col font-sans">

            {/* Header */}
            <div className="bg-gradient-to-r from-[#0B648D] to-[#155F87] text-white px-5 sm:px-6 py-4 border-b-4">
              <h2 className="text-[15px] font-bold">
                Review Your Claim
              </h2>
              <p className="text-blue-100 text-[13px] mt-1">
                Please double-check the details below before submitting.
              </p>
            </div>

            <div className="overflow-y-auto p-5 sm:p-6 space-y-4">

              {/* Item */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">
                  Item
                </p>
                <p className="text-[13px] font-bold text-slate-800">
                  {item?.title || item?.name || "Unnamed item"}
                </p>
                {item?.category && (
                  <p className="text-[12px] font-semibold text-slate-500 mt-0.5">
                    {item.category}
                  </p>
                )}
              </div>

              {/* Claimant */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1">
                  Claimant
                </p>
                <p className="text-[13px] font-bold text-slate-800">
                  {form.first_name} {form.last_name}
                </p>
                <p className="text-[12px] font-semibold text-slate-500 mt-0.5">
                  {form.claimant_contact ? `${form.claimant_contact} · ` : ""}{form.school_id}@slc-sflu.edu.ph
                </p>
              </div>

              {/* Schedule — always shown now, since a slot is always
                  picked and required regardless of match/mismatch. */}
              <div className="rounded-lg border border-[#B9DCEB] bg-[#F0FAFD] px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#0B6FA4] mb-1">
                  Verification Meeting
                </p>
                <div className="flex items-center justify-between text-[13px] mt-1">
                  <span className="font-semibold text-slate-500">Date</span>
                  <span className="font-bold text-slate-800">
                    {parseDateOnly(form.meeting_date)?.toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    }) || form.meeting_date}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[13px] mt-1.5">
                  <span className="font-semibold text-slate-500">Time</span>
                  <span className="font-bold text-slate-800">{form.meeting_time}</span>
                </div>

                {/* Always shown, never only on a mismatch: with "Go Back"
                    right below, a note that appeared only for wrong answers
                    would let a claimant test answers until it disappeared. */}
                <p className="mt-3 pt-3 border-t border-[#B9DCEB] text-[11px] font-semibold text-amber-600 leading-relaxed">
                  A moderator will review your answers against our records before this meeting
                  is confirmed.
                </p>
              </div>

              {/* Answers */}
              <div className="rounded-lg border border-slate-200 px-4 py-3">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">
                  Ownership Verification Answers
                </p>
                <div className="space-y-2">
                  {activeQuestions.map((question, index) => (
                    <div key={index} className="text-[13px]">
                      <p className="font-semibold text-slate-500 leading-snug">
                        {index + 1}. {question}
                      </p>
                      <p className="font-bold text-slate-800 mt-0.5">
                        {answers[index]}
                      </p>
                    </div>
                  ))}
                </div>

                {form.other_description.trim() && (
                  <div className="mt-3 pt-3 border-t border-slate-200 text-[13px]">
                    <p className="font-semibold text-slate-500">
                      Other Unique Description
                    </p>
                    <p className="font-bold text-slate-800 mt-0.5">
                      {form.other_description.trim()}
                    </p>
                  </div>
                )}
              </div>

              <p className="text-[11px] font-semibold text-amber-600 leading-relaxed">
                Once submitted, you won't be able to edit these answers, and you won't be able to
                submit another claim for this item until this meeting time has passed.
              </p>

            </div>

            {/* Buttons */}
            <div className="flex gap-3 px-5 sm:px-6 py-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={loading}
                className="flex-1 py-2.5 rounded-lg bg-slate-100 text-slate-500 text-[13px] font-bold uppercase tracking-wide transition duration-200 hover:bg-slate-200 disabled:opacity-50"
              >
                Go Back
              </button>

              <button
                type="button"
                onClick={confirmAndSubmitClaim}
                disabled={loading}
                className="flex-1 py-2.5 rounded-lg text-white text-[13px] font-bold uppercase tracking-wide shadow-md transition-all duration-200 bg-gradient-to-r from-[#0B648D] to-[#155F87] hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
              >
                {loading
                  ? "Submitting..."
                  : "Confirm & Submit"}
              </button>
            </div>

          </div>
        </div>
      )}

    </>
  );
};


export default ClaimModal;