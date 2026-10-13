// ==========================================================
// CLAIM AUTO-ARCHIVE RULE
//
// A claim with a meeting date is automatically archived 3 days after
// that date — e.g. a meeting on October 3 is archived on October 6.
//
// Nothing is written to the database: the rule is computed from the
// claim's own meeting_date every time the claims are loaded, so it
// happens "automatically" without a background job, and it can never
// get out of sync.
//
//   - Claimrequests.jsx hides these claims from its Needs Attention and
//     Schedule Meeting tabs.
//   - Archive.jsx lists them under the "Scheduled Meetings" filter.
//
// Declined claims are never auto-archived; they stay in the Declined
// tab of Claim Requests.
// ==========================================================

export const CLAIM_ARCHIVE_AFTER_DAYS = 3;

const DECLINED_STATUSES = ["rejected", "declined", "decline", "denied"];

const norm = (v) => String(v ?? "").trim().toLowerCase();

export const isClaimDeclined = (claim) =>
  !!claim &&
  (DECLINED_STATUSES.includes(norm(claim.status)) ||
    DECLINED_STATUSES.includes(norm(claim.claim_status)) ||
    claim.is_declined === true ||
    claim.declined === true);

// Date (local midnight) on which the claim moves to the archive, or null
// when the claim has no meeting date.
export const claimArchiveDate = (claim) => {
  if (!claim?.meeting_date) return null;
  const d = new Date(`${String(claim.meeting_date).slice(0, 10)}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + CLAIM_ARCHIVE_AFTER_DAYS);
  return d;
};

// A claim whose meeting was missed ("Timed Out", see backend
// claim/noshow.py) is finished: it goes straight to the archive. The
// claimant's re-claim, if any, is a new claim.
export const isClaimTimedOut = (claim) => norm(claim?.status) === "timed out";

// Closed because the item went to another claimant (backend
// claim/closing.py) — finished, so archived right away too.
export const isClaimClosed = (claim) => norm(claim?.status) === "closed";

// Item handed to this claimant (backend claim/closing.py) — finished.
export const isClaimReleased = (claim) => norm(claim?.status) === "released";

export const isClaimAutoArchived = (claim, now = new Date()) => {
  if (!claim || isClaimDeclined(claim)) return false;
  if (isClaimTimedOut(claim) || isClaimClosed(claim) || isClaimReleased(claim)) return true;
  const archiveOn = claimArchiveDate(claim);
  return !!archiveOn && now >= archiveOn;
};

// "YYYY-MM-DD" in local time.
export const formatYMD = (date) =>
  date ? date.toLocaleDateString("en-CA") : "—";
