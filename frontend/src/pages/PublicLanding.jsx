import React, { useState, useEffect, useRef } from 'react';
import { getItems, getMyClaims } from "../api/api";
import ReclaimModal from "../components/ReclaimModal";
import { useApp } from '../context/AppContext';
import Header from "../components/Header";
import NotificationBell from "../components/NotificationBell";
import Leaderboard from "./Leaderboards";
import UserProfile from "../components/UserProfile"; // adjust path if UserProfile lives elsewhere
import {
  FaFileAlt,
  FaSearch,
  FaTrophy,
  FaArrowLeft,
  FaEye,
  FaHandHolding,
  FaExclamationCircle,
  FaBoxOpen,
  FaChevronLeft,
  FaChevronRight,
  FaPlusCircle,
  FaQuestionCircle,
  FaFilter,
  FaUserCircle,
  FaCalendarCheck,
  FaTimes,
  FaChevronDown,
  FaSlidersH,
  FaTags,
  FaRedo,
  FaBan,
} from 'react-icons/fa';


// Components
import ReportLostModal from '../components/ReportLostModal';
import ItemDetailModal from '../components/ItemDetailModal';
import ClaimModal from '../components/ClaimModal';
import TrackItemModal from '../components/TrackItemModal';
import Pagination from "../components/Pagination";
import SessionTimeoutModal from '../components/SessionTimeoutModal';

// How often the board refreshes itself.
const POLL_INTERVAL_MS = 5000;

// ==========================================================
// SESSION TIMEOUT (security)
// A logged-in user is signed out after 5 minutes without any activity
// (mouse, keyboard, scroll, touch). A warning with a countdown appears
// 30 seconds before. The last-activity time is kept in localStorage so
// the timeout also applies after a page reload and is shared by all open
// tabs (activity in one tab keeps the others alive, and logging out in
// one tab logs out the others).
// ==========================================================
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;
const SESSION_WARNING_MS = 30 * 1000;
const LAST_ACTIVITY_KEY = 'lastActivityAt';
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'];

const readLastActivity = () => {
  try {
    const v = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
};

const writeLastActivity = (t = Date.now()) => {
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(t));
  } catch {
    /* storage unavailable: the in-memory timer still works */
  }
};

// Local-storage key for items the current user has already scheduled a
// claim for. Keyed per user id so switching accounts on the same device
// never leaks one user's claimed items into another's.
const claimedStorageKey = (userId) => `claimedItems_${userId}`;

const getItemId = (item) => item?.id ?? item?._id ?? item?.claim_id ?? null;

// ─── "Hide my own surrendered items" helpers ────────────────────────────────
const digitsOnly = (v) => String(v || '').replace(/\D/g, '');

// Every digit string that could be this account's Student ID: the part of
// the email / username before the "@", plus any explicit id fields the
// account object may carry.
const getUserDigitCandidates = (user) =>
  [user?.email, user?.username, user?.id_number, user?.student_id]
    .map((s) => digitsOnly(String(s || '').split('@')[0]))
    .filter(Boolean);

// True when the logged-in user is the person who turned this item in.
const isOwnSurrenderedItem = (item, user) => {
  if (!user) return false;
  if (item?.type?.toLowerCase() !== 'surrendered') return false;

  // Decided by the backend (knows exactly who is logged in).
  if (item.is_mine === true) return true;

  // Local match by finder Student ID.
  const finderId = digitsOnly(item.student_id);
  if (finderId && getUserDigitCandidates(user).includes(finderId)) return true;

  // Local match by the email stored on the item.
  const myEmail = (user.email || '').trim().toLowerCase();
  const itemEmail = (item.email || '').trim().toLowerCase();
  return !!myEmail && myEmail === itemEmail;
};

const parseSlotEnd = (meetingDate, meetingTimeSlot) => {
  if (!meetingDate || !meetingTimeSlot) return null;

  const endLabel = meetingTimeSlot.split('-')[1]?.trim();
  if (!endLabel) return null;

  const match = endLabel.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const meridiem = match[3].toUpperCase();

  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;

  const [y, m, d] = meetingDate.split('-').map(Number);
  if (!y || !m || !d) return null;

  return new Date(y, m - 1, d, hours, minutes, 0, 0);
};

// Item categories offered in the board's category filter (Lost and
// Surrendered tabs alike). Matches the categories used when items are added.
const BOARD_CATEGORIES = [
  'Accessories',
  'ID',
  'Academic Materials',
  'Bags & Wallets',
  'Clothing',
  'Electronic',
  'Keys',
];

const PublicBoard = ({ onOpenLogin }) => {
  // AppContext exposes the logged-in account as `currentUser`, aliased to
  // `user` here for the rest of the file.
  const { isLoggedIn, currentUser: user, logout } = useApp();

  // ---- Session timeout state ----
  const [sessionSecondsLeft, setSessionSecondsLeft] = useState(null); // countdown while warning shows
  const [sessionExpired, setSessionExpired] = useState(false);
  const warningOpenRef = useRef(false);

  const staySignedIn = () => {
    writeLastActivity();
    warningOpenRef.current = false;
    setSessionSecondsLeft(null);
  };

  useEffect(() => {
    if (!isLoggedIn) {
      warningOpenRef.current = false;
      setSessionSecondsLeft(null);
      return undefined;
    }

    // Sessions started before this feature have no timestamp yet.
    if (!readLastActivity()) writeLastActivity();

    const expire = () => {
      warningOpenRef.current = false;
      setSessionSecondsLeft(null);
      setSessionExpired(true);
      logout();
    };

    // Record activity (throttled to once a second). While the warning is
    // open only the "Stay signed in" button extends the session.
    let lastWrite = 0;
    const onActivity = () => {
      if (warningOpenRef.current) return;
      const now = Date.now();
      if (now - lastWrite < 1000) return;
      lastWrite = now;
      writeLastActivity(now);
    };

    const check = () => {
      const last = readLastActivity() ?? Date.now();
      const idle = Date.now() - last;
      if (idle >= SESSION_TIMEOUT_MS) {
        expire();
      } else if (idle >= SESSION_TIMEOUT_MS - SESSION_WARNING_MS) {
        warningOpenRef.current = true;
        setSessionSecondsLeft(Math.ceil((SESSION_TIMEOUT_MS - idle) / 1000));
      } else if (warningOpenRef.current) {
        // Another tab extended the session.
        warningOpenRef.current = false;
        setSessionSecondsLeft(null);
      }
    };

    // Logged out in another tab -> log out here too.
    const onStorage = (e) => {
      if (e.key === 'isLoggedIn' && !e.newValue) logout();
    };

    check(); // catches a session that went stale while the page was closed
    const timer = setInterval(check, 1000);
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true }));
    window.addEventListener('storage', onStorage);
    return () => {
      clearInterval(timer);
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity));
      window.removeEventListener('storage', onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);
  const [reportedItems, setReportedItems] = useState([]);
  const [filter, setFilter] = useState('Lost');
  const [categoryFilter, setCategoryFilter] = useState('All');
  // Search box + date range on the board (Lost and Surrendered tabs).
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [hasPickedFilter, setHasPickedFilter] = useState(false);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const categoryMenuRef = useRef(null);

  // Close the category menu when clicking anywhere else.
  useEffect(() => {
    if (!categoryMenuOpen) return undefined;
    const close = (e) => {
      if (categoryMenuRef.current && !categoryMenuRef.current.contains(e.target)) {
        setCategoryMenuOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setCategoryMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [categoryMenuOpen]);
  const [detailItem, setDetailItem] = useState(null);
  const [claimItem, setClaimItem] = useState(null);
  // Timed-out claim being re-claimed (see components/ReclaimModal.jsx).
  const [reclaimTarget, setReclaimTarget] = useState(null);
  const [claimBlockedNotice, setClaimBlockedNotice] = useState(null);
  const [showReport, setShowReport] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeView, setActiveView] = useState("items");
  const [showTrackModal, setShowTrackModal] = useState(false);
  const [showMyMeetings, setShowMyMeetings] = useState(false);
  // Which claim card in My Claim Requests is expanded (null = all collapsed).
  const [expandedClaimId, setExpandedClaimId] = useState(null);
  const [myClaims, setMyClaims] = useState([]);
  const [claimedItems, setClaimedItems] = useState({});

  const boardRef = useRef(null);
  // True while a fetch is running, so slow/failed requests never pile up.
  const fetchInFlightRef = useRef(false);

  function scrollToBoardTop() {
    setTimeout(() => {
      boardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  }

  // Initial load + polling.
  //  - skips a tick while the tab is hidden
  //  - skips a tick if the previous request hasn't finished yet
  //  - refreshes immediately when the tab becomes visible again
  useEffect(() => {
    fetchItems();

    const interval = setInterval(() => {
      if (document.hidden) return;
      fetchItems();
    }, POLL_INTERVAL_MS);

    const onVisible = () => {
      if (!document.hidden) fetchItems();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setClaimedItems({});
      return;
    }

    try {
      const raw = localStorage.getItem(claimedStorageKey(user.id));
      const parsed = raw ? JSON.parse(raw) : {};

      const isValidMap =
        parsed && typeof parsed === "object" && !Array.isArray(parsed);
      const safeParsed = isValidMap ? parsed : {};

      const now = Date.now();
      const stillActive = Object.fromEntries(
        Object.entries(safeParsed).filter(
          ([, entry]) =>
            entry &&
            typeof entry === "object" &&
            (!entry.expiresAt || entry.expiresAt > now)
        )
      );

      setClaimedItems(stillActive);

      if (
        Object.keys(stillActive).length !==
        Object.keys(safeParsed).length
      ) {
        localStorage.setItem(claimedStorageKey(user.id), JSON.stringify(stillActive));
      }
    } catch (err) {
      console.error("Failed to load claimed items:", err);
      setClaimedItems({});
    }
  }, [user?.id]);

  // Keep the user's own claims loaded so locked items show as Scheduled.
  useEffect(() => {
    if (!user?.id) {
      setMyClaims([]);
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await getMyClaims();
        if (!cancelled) setMyClaims(res.claims || []);
      } catch (err) {
        console.error("Failed to load your claims:", err);
      }
    };
    load();
    const interval = setInterval(load, 10000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [user?.id]);

  const openMyMeetings = async () => {
    try {
      const res = await getMyClaims();
      setMyClaims(res.claims || []);
      setShowMyMeetings(true);
    } catch (err) {
      console.error(err);
    }
  };

  const markItemClaimed = (itemId, meetingDate, meetingTime) => {
    if (!user?.id || !itemId) return;

    const expiresAt = parseSlotEnd(meetingDate, meetingTime)?.getTime() ?? null;

    setClaimedItems((prev) => {
      const updated = {
        ...prev,
        [itemId]: { meetingDate, meetingTime, expiresAt },
      };

      try {
        localStorage.setItem(claimedStorageKey(user.id), JSON.stringify(updated));
      } catch (err) {
        console.error("Failed to persist claimed item:", err);
      }

      return updated;
    });
  };

  async function fetchItems() {
    // Don't start a second request while one is still running.
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;

    try {
      const response = await getItems();

      const data = Array.isArray(response)
        ? response
        : Array.isArray(response?.data)
          ? response.data
          : null;

      if (!data) return;

      // Only replace state when the data actually changed.
      setReportedItems((prev) =>
        JSON.stringify(prev) === JSON.stringify(data) ? prev : data
      );
    } catch (error) {
      console.error('Error fetching items:', error);
    } finally {
      fetchInFlightRef.current = false;
    }
  }

  const requireAuth = (fn) => (...args) => {
    if (!isLoggedIn) {
      if (onOpenLogin) onOpenLogin();
      return;
    }
    return fn(...args);
  };

  // ==========================================================
  // hasUserClaimed — true when the current user has an ACTIVE claim
  // (scheduled meeting slot has not yet ended) for the item. Backend
  // claim data is checked first, then the local optimistic snapshot.
  // A claim with no meeting yet is treated as active.
  // ==========================================================
  const hasUserClaimed = (item) => {
    if (!user) return false;

    const itemId = getItemId(item);
    const now = Date.now();

    const claimsList = item.claims || item.claim_requests;
    const myRemoteClaim = claimsList?.find(
      (claim) => claim && (claim.user_id === user.id || claim.userId === user.id)
    );

    if (myRemoteClaim) {
      const slotEnd = parseSlotEnd(myRemoteClaim.meeting_date, myRemoteClaim.meeting_time);
      const remoteExpired = slotEnd ? slotEnd.getTime() <= now : false;
      if (!remoteExpired) return true;
    }

    const local = itemId !== null ? claimedItems[itemId] : null;
    if (local && (!local.expiresAt || local.expiresAt > now)) return true;

    return false;
  };

  // ------------------------------------------------------------------
  // CLAIM LOCK
  // Once the logged-in user has a claim on an item (waiting for review
  // or with a meeting scheduled), the Claim button is disabled for them.
  // It opens again the day AFTER the meeting date — e.g. a meeting on
  // Oct 5 unlocks claiming on Oct 6. Declined claims never lock.
  // ------------------------------------------------------------------
  const todayKey = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD

  const getClaimLock = (item) => {
    if (!user) return null;
    const itemId = String(getItemId(item));
    const active = myClaims.find((c) => {
      const claimItemId = c.item_details?.id ?? c.item?.id ?? c.item_id ?? c.item;
      if (String(claimItemId) !== itemId) return false;
      const status = String(c.status || '').toLowerCase();
      if (['declined', 'rejected', 'denied', 'cancelled', 'timed out', 'closed'].includes(status)) return false;
      if (!c.meeting_date) return true; // still waiting for staff review
      return todayKey() <= String(c.meeting_date).slice(0, 10);
    });
    if (!active) return null;

    let reopensOn = null;
    if (active.meeting_date) {
      const d = new Date(`${String(active.meeting_date).slice(0, 10)}T00:00:00`);
      d.setDate(d.getDate() + 1);
      reopensOn = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    return { claim: active, reopensOn };
  };

  // ------------------------------------------------------------------
  // MISSED MEETINGS (backend claim/noshow.py)
  // The user's NEWEST claim on this item decides:
  //   - 3 missed meetings -> "Visit SAO": can't claim online any more.
  //   - a missed meeting   -> "Re-claim": pick a new date/time only,
  //                           the original answers are reused.
  // ------------------------------------------------------------------
  const getNoShowState = (item) => {
    if (!user) return null;
    const itemId = String(getItemId(item));
    const latest = myClaims.find((c) => {
      const claimItemId = c.item_details?.id ?? c.item?.id ?? c.item_id ?? c.item;
      return String(claimItemId) === itemId;
    });
    if (!latest) return null;
    if (latest.online_claim_blocked) return { mode: 'blocked', claim: latest };
    if (latest.can_reclaim) return { mode: 'reclaim', claim: latest };
    return null;
  };

  const SAO_IN_PERSON_MESSAGE =
    'You missed 3 meetings for this item, so you can no longer claim it online. Please go to the Student Affairs Office in person.';

  // Single entry point for every "Claim" button on the board.
  const openClaimFor = (item) => {
    const noShow = getNoShowState(item);
    if (noShow?.mode === 'blocked') return;
    if (noShow?.mode === 'reclaim') {
      setReclaimTarget(noShow.claim);
      return;
    }
    setClaimItem(item);
  };

  // ------------------------------------------------------------------
  // CLAIM STATUS SHOWN IN "MY CLAIM REQUESTS"
  // The claimant can come in any time on their meeting day. Once that
  // whole day has passed (e.g. meeting Oct 3 -> from Oct 4 onward) and
  // the item still wasn't released to them, the claim shows as
  // "Session Timed Out". Declined claims and items already marked
  // Claimed keep their own status.
  // ------------------------------------------------------------------
  const getClaimDisplayStatus = (claim) => {
    const status = String(claim?.status || '').trim();
    const lower = status.toLowerCase();
    if (['declined', 'rejected', 'denied', 'cancelled'].includes(lower)) return 'Declined';
    if (lower === 'timed out') return 'Session Timed Out';
    // Item released to another (verified) claimant — backend claim/closing.py.
    if (lower === 'closed') return 'Closed';
    // Item handed to THIS claimant (even if they came after their meeting day).
    if (lower === 'released') return 'Received';

    const itemStatus = String(claim?.item_details?.status || claim?.item?.status || '').toLowerCase();
    if (itemStatus === 'claimed') return 'Claimed';

    // Only a meeting staff confirmed ("Continue to Schedule") can be missed;
    // an unscheduled request just keeps waiting for review.
    if (
      claim?.staff_scheduled &&
      claim?.meeting_date &&
      todayKey() > String(claim.meeting_date).slice(0, 10)
    ) {
      return 'Session Timed Out';
    }
    return status || 'Pending';
  };

  const CLAIM_STATUS_STYLES = {
    Pending: { badge: 'bg-yellow-100 text-yellow-700', note: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
    Scheduled: { badge: 'bg-blue-100 text-blue-700', note: 'bg-blue-50 border-blue-200 text-blue-700' },
    Approved: { badge: 'bg-green-100 text-green-700', note: 'bg-green-50 border-green-200 text-green-700' },
    Claimed: { badge: 'bg-purple-100 text-purple-700', note: 'bg-purple-50 border-purple-200 text-purple-700' },
    Received: { badge: 'bg-green-100 text-green-700', note: 'bg-green-50 border-green-200 text-green-700' },
    'Session Timed Out': { badge: 'bg-slate-200 text-slate-600', note: 'bg-slate-50 border-slate-200 text-slate-600' },
    Closed: { badge: 'bg-slate-200 text-slate-600', note: 'bg-slate-50 border-slate-200 text-slate-600' },
    Declined: { badge: 'bg-red-100 text-red-700', note: 'bg-red-50 border-red-200 text-red-700' },
  };

  const formatMeetingDay = (value) => {
    if (!value) return '';
    const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return isNaN(d.getTime())
      ? String(value)
      : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  const getClaimStatusNote = (claim, displayStatus) => {
    switch (displayStatus) {
      case 'Pending':
        return claim.meeting_date
          ? `Your claim request is waiting for moderator review. You may come in any time on ${formatMeetingDay(claim.meeting_date)} once it's confirmed.`
          : 'Your claim request is waiting for moderator review.';
      case 'Scheduled':
        return `Your meeting has been scheduled. You can claim the item any time on ${formatMeetingDay(claim.meeting_date)}. Please bring your School ID.`;
      case 'Approved':
        return 'Your claim has been approved.';
      case 'Claimed':
        return 'This item has been released.';
      case 'Received':
        return 'You received this item. Thank you for using Seek & Balik!';
      case 'Session Timed Out':
        if (claim.online_claim_blocked) {
          return `You missed your meeting on ${formatMeetingDay(claim.meeting_date)}. ${SAO_IN_PERSON_MESSAGE}`;
        }
        if (claim.can_reclaim) {
          return `You missed your meeting on ${formatMeetingDay(claim.meeting_date)}. Use Re-claim to pick a new date and time; your previous answers will be used.`;
        }
        return `You missed your meeting on ${formatMeetingDay(claim.meeting_date)}.`;
      case 'Declined':
        return 'Your claim request was declined.';
      case 'Closed':
        return 'This item was released to its verified owner, so your claim request is closed. If you believe it is yours, please visit the Student Affairs Office.';
      default:
        return '';
    }
  };

  // "2026-10-02T23:03:50.342172+08:00" -> "Oct 2, 2026, 11:03 PM"
  const formatSubmitted = (value) => {
    if (!value) return '-';
    const d = new Date(value);
    return isNaN(d.getTime())
      ? String(value)
      : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };

  const claimLockTitle = (lock) =>
    lock?.reopensOn
      ? `Your meeting is on ${lock.claim.meeting_date}${lock.claim.meeting_time ? ` (${lock.claim.meeting_time})` : ''}. You can claim again on ${lock.reopensOn}.`
      : 'Your claim is waiting for staff review.';

  const filteredItems = reportedItems.filter((item) => {
    return item.type?.toLowerCase() === filter.toLowerCase();
  });

  function toTitleCase(text) {
    if (!text) return "";

    return text
      .toLowerCase()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  // Surrendered items the logged-in user already had a claim DECLINED
  // for. Staff decided they aren't the owner, so the item is no longer
  // shown to them on the Surrendered board (the backend also refuses a
  // new claim from them — see create_claim in claim/views.py). Other
  // users still see the item as normal.
  const declinedItemIds = new Set(
    user
      ? myClaims
          .filter((c) =>
            ['declined', 'rejected', 'denied'].includes(String(c.status || '').trim().toLowerCase())
          )
          .map((c) => String(c.item_details?.id ?? c.item?.id ?? c.item_id ?? c.item))
      : []
  );

  const isDeclinedForUser = (item) =>
    item.type?.toLowerCase() === 'surrendered' && declinedItemIds.has(String(getItemId(item)));

  // Approved items only, and never the logged-in user's OWN surrendered
  // items (the finder shouldn't see, or try to claim, what they turned in)
  // or items whose claim by this user was declined.
  const typeApprovedItems = filteredItems.filter((item) => {
    const status = item.status?.trim().toUpperCase();
    return status === 'APPROVED' && !isOwnSurrenderedItem(item, user) && !isDeclinedForUser(item);
  });

  // Same category list on both the Lost and Surrendered tabs: only the
  // official item categories. Old category names left on legacy items
  // (e.g. "Personal", "Valuables") are no longer offered as filters.
  const categoryOptions = BOARD_CATEGORIES;

  // Search: item name, category, location or ticket code.
  const searchTerm = searchQuery.trim().toLowerCase();
  const matchesSearch = (item) =>
    !searchTerm ||
    [item.title, item.name, item.category, item.location, item.ticket_code]
      .some((v) => String(v || '').toLowerCase().includes(searchTerm));

  // Date range: uses the item's date (the "Date Logged" column). An item
  // logged as a range (From → To) matches when the range overlaps.
  const matchesDate = (item) => {
    if (!dateFrom && !dateTo) return true;
    const start = String(item.created_date || '').slice(0, 10);
    if (!start) return false;
    const end = String(item.created_date_to || '').slice(0, 10) || start;
    if (dateFrom && end < dateFrom) return false;
    if (dateTo && start > dateTo) return false;
    return true;
  };

  const hasBoardFilters = !!searchTerm || !!dateFrom || !!dateTo;
  // Category counts too, so every active filter is shown and cleared together.
  const hasAnyFilter = hasBoardFilters || categoryFilter !== 'All';
  const clearBoardFilters = () => {
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
    setCategoryFilter('All');
  };
  const clearDates = () => {
    setDateFrom('');
    setDateTo('');
  };
  // The Filters button only holds the category now.
  const activeFilterCount = categoryFilter !== 'All' ? 1 : 0;
  const prettyDate = (value) => {
    const d = new Date(`${value}T00:00:00`);
    return isNaN(d.getTime())
      ? value
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const categoryName = (c) => (String(c).toUpperCase() === 'ID' ? 'ID' : toTitleCase(c));
  // Filled-in filter fields get a highlighted look so it's obvious they're on.
  const activeField = 'border-[#2D366D] bg-[#EEF1FB] text-[#2D366D] font-semibold';
  const idleField = 'border-slate-300 bg-white text-slate-700';

  const approvedItems = typeApprovedItems
    .filter(
      (item) =>
        categoryFilter === 'All' ||
        item.category?.trim().toLowerCase() === categoryFilter.trim().toLowerCase()
    )
    .filter(matchesSearch)
    .filter(matchesDate)
    .sort((a, b) => (b.id || 0) - (a.id || 0));

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.max(1, Math.ceil(approvedItems.length / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;

  const paginatedItems = approvedItems.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, activeView, categoryFilter, searchQuery, dateFrom, dateTo]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F7FE]">
      {/* The Login button only shows while logged out. */}
      <Header
        showLogin={!isLoggedIn}
        onOpenLogin={onOpenLogin}
        rightContent={
          isLoggedIn ? (
            <NotificationBell
              tone="dark"
              onOpen={(n) => {
                const screen = n?.data?.screen;
                if (screen === "MyClaimRequests") openMyMeetings();
                else if (screen === "MySubmissions") setActiveView("profile");
              }}
            />
          ) : undefined
        }
      />

      {/* Main Container */}
      <main className="flex-1 px-4 sm:px-8 mt-12 pb-16">
        <div
          ref={boardRef}
          className="scroll-mt-48 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-180px)] min-h-[520px]"
        >
          {/* Top Controls */}
          <div className="bg-white p-4 sm:p-6 border-b border-slate-100 flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center shrink-0 z-20">
            <div className="min-w-0 flex-1 flex items-center gap-3">
              <button
                onClick={requireAuth(() => setActiveView("profile"))}
                title={!isLoggedIn ? "Log in or register to view your profile" : "My Profile"}
                aria-label="My Profile"
                className={`shrink-0 flex items-center justify-center h-14 w-14 rounded-full transition-all hover:scale-105 ${
                  activeView === "profile"
                    ? "bg-[#2D366D] text-white shadow-md"
                    : "bg-white text-[#2D366D]"
                } ${!isLoggedIn ? "opacity-60" : ""}`}
              >
                <FaUserCircle size={34} />
              </button>

              <div className="min-w-0">
                <h3 className="text-sm font-black tracking-widest text-slate-800 font-sans">
                  {activeView === "leaderboard"
                    ? "Leaderboards"
                    : activeView === "profile"
                      ? "My Profile"
                      : filter === "Lost"
                        ? "Lost Items"
                        : "Surrendered Items"}
                </h3>

                <p className="text-xs text-slate-500 font-sans italic mt-1 max-w-xl">
                  {activeView === "leaderboard"
                    ? "View the top honest finders based on claimed and surrendered items."
                    : activeView === "profile"
                      ? "View and update your account details."
                      : filter === "Lost"
                        ? "Browse reported items missing within the campus."
                        : "View items surrendered and registered in the system."}
                </p>
              </div>
            </div>

            {activeView === "items" ? (
              <div className="w-full lg:w-auto lg:ml-auto flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 sm:flex-wrap">
                <div className="flex items-center gap-3">
                  <button
                    onClick={requireAuth(() => setShowReport(true))}
                    title={!isLoggedIn ? "Log in or register to report an item" : "Report a Lost Item"}
                    aria-label="Report a Lost Item"
                    className={`shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-[#2D366D] text-white shadow-md hover:shadow-lg transition-all ${!isLoggedIn ? "opacity-60" : ""}`}
                  >
                    <FaPlusCircle size={16} />
                  </button>

                  <button
                    onClick={() => window.location.href = "/help"}
                    title="Help Center"
                    aria-label="Help Center"
                    className="shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-white border border-slate-300 text-slate-700 shadow-sm hover:shadow-md transition-all"
                  >
                    <FaQuestionCircle size={16} />
                  </button>

                  <button
                    onClick={requireAuth(() => setShowTrackModal(true))}
                    title={!isLoggedIn ? "Log in or register to track an item" : "Track Item"}
                    aria-label="Track Item"
                    className={`shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-white border border-slate-300 text-slate-700 shadow-sm hover:shadow-md transition-all ${!isLoggedIn ? "opacity-60" : ""}`}
                  >
                    <FaSearch size={16} />
                  </button>

                  <button
                    onClick={requireAuth(openMyMeetings)}
                    title={!isLoggedIn ? "Log in to view your claim requests" : "My Claim Requests"}
                    aria-label="My Claim Requests"
                    className={`shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-white border border-slate-300 text-slate-700 shadow-sm hover:shadow-md transition-all ${
                      !isLoggedIn ? "opacity-60" : ""
                    }`}
                  >
                    <FaCalendarCheck size={16} />
                  </button>

                  <button
                    onClick={requireAuth(() => setActiveView("leaderboard"))}
                    title={!isLoggedIn ? "Log in or register to view leaderboards" : "Leaderboards"}
                    aria-label="Leaderboards"
                    className={`shrink-0 flex items-center justify-center h-10 w-10 rounded-full bg-white border border-slate-300 text-slate-700 shadow-sm hover:shadow-md transition-all ${!isLoggedIn ? "opacity-60" : ""}`}
                  >
                    <FaTrophy size={16} />
                  </button>
                </div>

                <div className="w-full sm:w-auto flex bg-slate-100 p-1 rounded-2xl sm:rounded-full shadow-inner sm:shadow-none">
                  {["Lost", "Surrendered"].map((f) => (
                    <button
                      key={f}
                      // Logged out: only the Lost list can be viewed; switching
                      // to Surrendered asks the user to log in first.
                      onClick={(f === "Lost" ? (fn) => fn : requireAuth)(() => {
                        setFilter(f);
                        setHasPickedFilter(true);
                      })}
                      title={!isLoggedIn && f !== "Lost" ? "Log in or register to view surrendered items" : undefined}
                      className={`flex-1 sm:flex-none px-4 sm:px-6 py-2.5 sm:py-2 rounded-xl sm:rounded-full text-xs font-black uppercase tracking-widest font-sans transition-all min-w-0 sm:min-w-[100px] flex items-center justify-center gap-2 ${
                        filter === f
                          ? "bg-white text-[#2D366D] shadow-sm"
                          : "text-slate-400 hover:text-slate-600"
                      } ${!isLoggedIn && f !== "Lost" ? "opacity-60" : ""}`}
                    >
                      {f === "Lost" ? (
                        <FaExclamationCircle size={12} />
                      ) : (
                        <FaBoxOpen size={12} />
                      )}
                      <span>{f}</span>
                    </button>
                  ))}
                </div>

                {/* "Filters" button (sliders icon + word, like the mobile app);
                    it opens the category list. The date range sits beside
                    the search box below. */}
                <div className="relative" ref={categoryMenuRef}>
                  <button
                    type="button"
                    onClick={requireAuth(() => setCategoryMenuOpen((open) => !open))}
                    title={!isLoggedIn ? "Log in or register to filter by category" : "Filter by category"}
                    aria-label={categoryFilter !== "All" ? `Filters, category ${categoryName(categoryFilter)}` : "Filters"}
                    aria-haspopup="listbox"
                    aria-expanded={categoryMenuOpen}
                    className={`relative inline-flex h-10 items-center justify-center gap-2 rounded-lg px-3 text-sm font-bold text-[#2D366D] transition hover:bg-[#EEF1FB] ${
                      categoryMenuOpen || activeFilterCount > 0 ? "bg-[#EEF1FB]" : ""
                    } ${!isLoggedIn ? "opacity-60" : ""}`}
                  >
                    <FaSlidersH size={14} />
                    <span className="whitespace-nowrap">Filters</span>
                    {activeFilterCount > 0 && (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#2D366D] px-1.5 text-[10px] font-black text-white">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>

                  {categoryMenuOpen && (
                    <div className="absolute right-0 z-30 mt-2 w-[min(300px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                        <span className="inline-flex items-center gap-2 text-sm font-bold text-[#2D366D]">
                          <FaTags size={13} /> Category
                        </span>
                        {categoryFilter !== "All" && (
                          <button
                            type="button"
                            onClick={() => setCategoryFilter("All")}
                            className="text-[11px] font-bold text-[#2D366D] hover:underline"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                      <ul role="listbox" aria-label="Category" className="max-h-72 overflow-y-auto py-1">
                        {["All", ...categoryOptions].map((c) => {
                          const active = categoryFilter.trim().toLowerCase() === c.trim().toLowerCase();
                          return (
                            <li key={c}>
                              <button
                                type="button"
                                role="option"
                                aria-selected={active}
                                onClick={() => {
                                  setCategoryFilter(c);
                                  setCategoryMenuOpen(false);
                                }}
                                className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition ${
                                  active ? "bg-[#EEF1FB] font-semibold text-[#2D366D]" : "text-slate-700 hover:bg-slate-50"
                                }`}
                              >
                                {c === "All" ? "All Categories" : categoryName(c)}
                                {active && <span className="text-[#2D366D]">✓</span>}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <button
                onClick={() => setActiveView("items")}
                className="bg-[#2D366D] text-white px-6 py-2.5 rounded-full font-black tracking-widest text-xs hover:shadow-lg transition-all shadow-md font-sans flex items-center gap-2"
              >
                <FaArrowLeft size={14} />
                Back
              </button>
            )}
          </div>

          {/* SEARCH + DATE FILTER */}
          {activeView === "items" && (
            <div className="shrink-0 border-b border-slate-100 bg-slate-50/60 px-4 sm:px-6 py-3 flex flex-col md:flex-row md:items-end gap-3">
              <div className="relative flex-1 min-w-0">
                <label htmlFor="board-search" className={`mb-1 block text-[11px] font-bold uppercase tracking-wide ${searchTerm ? "text-[#2D366D]" : "text-slate-500"}`}>
                  Search
                </label>
                <FaSearch className={`pointer-events-none absolute left-3.5 bottom-3 ${searchTerm ? "text-[#2D366D]" : "text-slate-400"}`} size={13} />
                <input
                  id="board-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={`Search ${filter === "Lost" ? "lost" : "surrendered"} items by name, category or location...`}
                  className={`w-full rounded-full border py-2.5 pl-10 pr-10 text-sm outline-none placeholder:text-slate-400 placeholder:font-normal focus:border-[#2D366D] focus:ring-2 focus:ring-[#2D366D]/15 [&::-webkit-search-cancel-button]:hidden ${searchTerm ? activeField : idleField}`}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search"
                    title="Clear search"
                    className="absolute right-3 bottom-2.5 rounded-full p-1 text-[#2D366D]/70 hover:bg-[#2D366D]/10 hover:text-[#2D366D]"
                  >
                    <FaTimes size={11} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 md:flex md:items-end">
                <div>
                  <label htmlFor="board-date-from" className={`mb-1 block text-[11px] font-bold uppercase tracking-wide ${dateFrom ? "text-[#2D366D]" : "text-slate-500"}`}>
                    From
                  </label>
                  <input
                    id="board-date-from"
                    type="date"
                    value={dateFrom}
                    max={dateTo || undefined}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className={`w-full md:w-[160px] rounded-full border px-3.5 py-2.5 text-sm outline-none focus:border-[#2D366D] focus:ring-2 focus:ring-[#2D366D]/15 ${dateFrom ? activeField : idleField}`}
                  />
                </div>
                <div>
                  <label htmlFor="board-date-to" className={`mb-1 block text-[11px] font-bold uppercase tracking-wide ${dateTo ? "text-[#2D366D]" : "text-slate-500"}`}>
                    To
                  </label>
                  <input
                    id="board-date-to"
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(e) => setDateTo(e.target.value)}
                    className={`w-full md:w-[160px] rounded-full border px-3.5 py-2.5 text-sm outline-none focus:border-[#2D366D] focus:ring-2 focus:ring-[#2D366D]/15 ${dateTo ? activeField : idleField}`}
                  />
                </div>
              </div>

            </div>
          )}

          {/* ACTIVE FILTERS — a clear banner listing every filter that's on */}
          {activeView === "items" && hasAnyFilter && (
            <div
              role="status"
              aria-live="polite"
              className="shrink-0 border-b border-[#2D366D]/15 bg-[#EEF1FB] px-4 sm:px-6 py-2.5 flex flex-wrap items-center gap-2"
            >
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2D366D]">
                <FaFilter size={11} />
                Showing {approvedItems.length} of {typeApprovedItems.length}{" "}
                {filter === "Lost" ? "lost" : "surrendered"} item{typeApprovedItems.length === 1 ? "" : "s"}
                <span className="font-semibold text-[#2D366D]/70">· filtered by</span>
              </span>

              {categoryFilter !== "All" && (
                <button
                  type="button"
                  onClick={() => setCategoryFilter("All")}
                  title="Remove this filter"
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#2D366D] px-3 py-1 text-[11px] font-bold text-white hover:bg-[#232a57]"
                >
                  Category: {categoryName(categoryFilter)} <FaTimes size={9} />
                </button>
              )}
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  title="Remove this filter"
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#2D366D] px-3 py-1 text-[11px] font-bold text-white hover:bg-[#232a57]"
                >
                  “{searchQuery.trim()}” <FaTimes size={9} />
                </button>
              )}
              {(dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={clearDates}
                  title="Remove this filter"
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#2D366D] px-3 py-1 text-[11px] font-bold text-white hover:bg-[#232a57]"
                >
                  {dateFrom && dateTo
                    ? `${prettyDate(dateFrom)} – ${prettyDate(dateTo)}`
                    : dateFrom
                    ? `From ${prettyDate(dateFrom)}`
                    : `Until ${prettyDate(dateTo)}`}{" "}
                  <FaTimes size={9} />
                </button>
              )}

              <button
                type="button"
                onClick={clearBoardFilters}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-[#2D366D]/30 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#2D366D] hover:bg-white/70"
              >
                <FaTimes size={9} /> Clear all
              </button>
            </div>
          )}

          {/* Desktop Table */}
          {activeView === "items" ? (
            <>
              <div className="hidden md:block overflow-y-auto scrollbar-hide flex-grow bg-white relative">
                <table className="w-full text-xs min-w-[900px] table-fixed border-collapse font-sans">
                  <thead className="sticky top-0 z-0">
                    <tr className="bg-[#0B6C9C] text-white">
                      <th className="border border-gray-300 px-4 py-3 font-semibold text-center text-sm">
                        Item Name
                      </th>
                      <th className="border border-gray-300 px-4 py-3 font-semibold text-center text-sm">
                        Category
                      </th>
                      <th className="border border-gray-300 px-4 py-3 font-semibold text-center text-sm">
                        Location
                      </th>
                      <th className="border border-gray-300 px-4 py-3 font-semibold text-center text-sm">
                        Date Logged
                      </th>
                      {filter === "Surrendered" && (
                        <th className="border border-gray-300 px-4 py-3 font-semibold text-center text-sm w-[220px]">
                          Action
                        </th>
                      )}
                    </tr>
                  </thead>

                  <tbody className="w-full text-xs uppercase min-w-[900px]">
                    {paginatedItems.length > 0 ? (
                      paginatedItems.map((item, index) => {
                        const itemId = getItemId(item);
                        const lock = getClaimLock(item);
                        const noShow = lock ? null : getNoShowState(item);
                        const claimed = hasUserClaimed(item) || !!lock;

                        return (
                          <tr
                            key={itemId ?? `row-${index}`}
                            className={`${
                              index % 2 === 0 ? "bg-white" : "bg-gray-50"
                            } hover:bg-blue-50 transition`}
                          >
                            <td className="border border-gray-300 px-4 py-3 text-center font-semibold">
                              {toTitleCase(item.title || item.name)}
                            </td>
                            <td className="border border-gray-300 px-4 py-3 text-center">
                              {toTitleCase(item.category)}
                            </td>
                            <td className="border border-gray-300 px-4 py-3 text-center">
                              {toTitleCase(item.location)}
                            </td>
                            <td className="border border-gray-300 px-4 py-3 text-center">
                              <div>{item.created_date}</div>
                              <div>{item.created_time}</div>
                            </td>
                            {filter === "Surrendered" && (
                              <td className="border border-gray-300 px-4 py-3 w-[220px]">
                                <div className="flex justify-center items-center gap-2">
                                  {/* "Claim" is always shown; "View" appears
                                      beside it while the user has an active
                                      claim. stopPropagation keeps the row's
                                      own onClick from firing. */}
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (lock || noShow?.mode === 'blocked') return;
                                      requireAuth(() => openClaimFor(item))();
                                    }}
                                    disabled={!!lock || noShow?.mode === 'blocked'}
                                    title={
                                      lock
                                        ? claimLockTitle(lock)
                                        : noShow?.mode === 'blocked'
                                        ? SAO_IN_PERSON_MESSAGE
                                        : noShow?.mode === 'reclaim'
                                        ? "You missed your meeting. Pick a new date and time."
                                        : "Claim Item"
                                    }
                                    className={`px-3 py-1.5 rounded transition flex items-center justify-center gap-1.5 text-xs font-semibold ${
                                      lock || noShow?.mode === 'blocked'
                                        ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                                        : "bg-[#2D366D] text-white hover:opacity-90"
                                    }`}
                                  >
                                    {lock ? <FaCalendarCheck size={13} /> : noShow?.mode === 'blocked' ? <FaBan size={13} /> : noShow?.mode === 'reclaim' ? <FaRedo size={12} /> : <FaHandHolding size={13} />}
                                    {lock ? (lock.reopensOn ? "Scheduled" : "In Review") : noShow?.mode === 'blocked' ? "Visit SAO" : noShow?.mode === 'reclaim' ? "Re-claim" : "Claim"}
                                  </button>

                                  {claimed && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        requireAuth(() => setClaimItem(item))();
                                      }}
                                      title="View your claim details"
                                      className="px-3 py-1.5 rounded transition flex items-center justify-center gap-1.5 text-xs font-semibold bg-slate-200 text-slate-700 hover:bg-slate-300"
                                    >
                                      <FaEye size={13} />
                                      View
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={filter === "Surrendered" ? 5 : 4} className="bg-white text-center py-40">
                          <div className="flex flex-col items-center justify-center text-slate-300 gap-2">
                            <span className="text-5xl opacity-10 font-black tracking-tighter">
                              EMPTY
                            </span>
                            <p className="text-xs font-sans tracking-[0.2em] uppercase font-bold text-slate-400">
                              {hasAnyFilter ? "No items match your filters" : "No active records found"}
                            </p>
                            {hasAnyFilter && (
                              <button
                                type="button"
                                onClick={clearBoardFilters}
                                className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#2D366D] px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-white hover:opacity-90"
                              >
                                <FaTimes size={10} /> Clear filters
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden flex-grow overflow-y-auto bg-slate-50 p-3 space-y-3">
                {paginatedItems.length > 0 ? (
                  paginatedItems.map((item, index) => {
                    const itemId = getItemId(item);
                    const lock = getClaimLock(item);
                    const noShow = lock ? null : getNoShowState(item);
                    const claimed = hasUserClaimed(item) || !!lock;

                    return (
                      <div
                        key={itemId ?? `card-${index}`}
                        className="bg-white border border-slate-200 rounded-lg shadow-sm p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-bold text-slate-800 leading-snug">
                              {toTitleCase(item.title || item.category)}
                            </h3>
                            <p className="text-xs font-semibold uppercase text-slate-400 mt-1">
                              {toTitleCase(item.category)}
                            </p>
                          </div>

                          <span className="text-xs font-bold uppercase text-[#0B6C9C] bg-blue-50 px-2 py-1 rounded">
                            {item.type}
                          </span>
                        </div>

                        <div className="mt-4 space-y-2 text-xs text-slate-600">
                          <div className="flex justify-between gap-3">
                            <span className="font-semibold text-slate-400">Location</span>
                            <span className="text-right">
                              {toTitleCase(item.location)}
                            </span>
                          </div>

                          <div className="flex justify-between gap-3">
                            <span className="font-semibold text-slate-400">Date</span>
                            <span className="text-right">
                              {item.created_date} {item.created_time}
                            </span>
                          </div>
                        </div>

                        {filter === "Surrendered" && (
                          <div className="mt-4 flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (lock || noShow?.mode === 'blocked') return;
                                requireAuth(() => openClaimFor(item))();
                              }}
                              disabled={!!lock || noShow?.mode === 'blocked'}
                              title={
                                lock
                                  ? claimLockTitle(lock)
                                  : noShow?.mode === 'blocked'
                                  ? SAO_IN_PERSON_MESSAGE
                                  : "Claim Item"
                              }
                              className={`flex-1 py-2 rounded font-semibold text-xs flex items-center justify-center gap-2 ${
                                lock || noShow?.mode === 'blocked' ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-[#2D366D] text-white"
                              }`}
                            >
                              {lock ? <FaCalendarCheck size={14} /> : noShow?.mode === 'blocked' ? <FaBan size={14} /> : noShow?.mode === 'reclaim' ? <FaRedo size={13} /> : <FaHandHolding size={14} />}
                              {lock ? (lock.reopensOn ? `Until ${lock.reopensOn}` : "In Review") : noShow?.mode === 'blocked' ? "Visit SAO" : noShow?.mode === 'reclaim' ? "Re-claim" : "Claim"}
                            </button>

                            {claimed && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  requireAuth(() => setClaimItem(item))();
                                }}
                                title="View your claim details"
                                className="flex-1 py-2 rounded font-semibold text-xs flex items-center justify-center gap-2 bg-slate-200 text-slate-700"
                              >
                                <FaEye size={14} />
                                View
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="bg-white min-h-[320px] flex flex-col items-center justify-center text-slate-300 rounded-lg border border-slate-200">
                    <span className="text-4xl opacity-10 font-black tracking-tighter">
                      EMPTY
                    </span>

                    <p className="text-xs font-sans tracking-[0.2em] uppercase font-bold text-slate-400 mt-2">
                      {hasAnyFilter ? "No items match your filters" : "No active records found"}
                    </p>
                    {hasAnyFilter && (
                      <button
                        type="button"
                        onClick={clearBoardFilters}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#2D366D] px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-white hover:opacity-90"
                      >
                        <FaTimes size={10} /> Clear filters
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Pagination */}
              <Pagination
                currentPage={currentPage}
                totalItems={approvedItems.length}
                pageSize={ITEMS_PER_PAGE}
                onPageChange={(page) => {
                  setCurrentPage(page);
                  scrollToBoardTop();
                }}
              />
            </>
          ) : activeView === "leaderboard" ? (
            <div className="flex-grow relative">
              <Leaderboard />
            </div>
          ) : (
            <div className="flex-grow relative min-h-0 overflow-hidden">
              <UserProfile userRole={user?.role} />
            </div>
          )}
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 w-full bg-slate-50 border-t border-slate-200 py-2 z-50">
        <p className="text-right text-[12px] text-slate-400 font-sans tracking-[0.2em] pr-4 sm:pr-8">
          © 2021 Saint Louis College, City of San Fernando, La Union. All rights reserved
        </p>
      </footer>

      {/* Modals Section */}
      {showReport && (
        <ReportLostModal
          onClose={() => setShowReport(false)}
          onSuccess={() => {
            fetchItems();
            setShowReport(false);
          }}
        />
      )}

      {detailItem && (
        <ItemDetailModal
          item={detailItem}
          onClaim={(item) => {
            setDetailItem(null);
            openClaimFor(item);
          }}
          onClose={() => setDetailItem(null)}
        />
      )}

      {claimItem && (
        <ClaimModal
          item={claimItem}
          onClose={() => setClaimItem(null)}
          onSuccess={(itemId, meetingDate, meetingTime) => {
            markItemClaimed(itemId ?? getItemId(claimItem), meetingDate, meetingTime);
            fetchItems();
          }}
        />
      )}

      {reclaimTarget && (
        <ReclaimModal
          claim={reclaimTarget}
          onClose={() => setReclaimTarget(null)}
          onDone={async () => {
            setReclaimTarget(null);
            try {
              const res = await getMyClaims();
              setMyClaims(res.claims || []);
            } catch (err) {
              console.error(err);
            }
            fetchItems();
          }}
        />
      )}

      {showTrackModal && (
        <TrackItemModal onClose={() => setShowTrackModal(false)} />
      )}

      {showMyMeetings && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden animate-fadeIn">

            {/* Header */}
            <div className="bg-[#2D366D] text-white px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-3 rounded-full">
                  <FaCalendarCheck size={20} />
                </div>

                <div>
                  <h2 className="text-xl font-bold">My Claim Requests</h2>
                  <p className="text-xs text-blue-100">
                    View the status of all items you've submitted for claiming.
                  </p>
                </div>
              </div>

              <button
                onClick={() => { setShowMyMeetings(false); setExpandedClaimId(null); }}
                aria-label="Close"
                className="text-white hover:opacity-70 transition p-2"
              >
                <FaTimes size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="max-h-[520px] overflow-y-auto bg-slate-50 p-5">

              {myClaims.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                  <FaCalendarCheck size={48} className="mb-3 opacity-30" />
                  <p className="font-semibold">No Claim Requests Yet</p>
                  <p className="text-sm">
                    Your submitted claims will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {myClaims.map((claim) => {
                    const displayStatus = getClaimDisplayStatus(claim);
                    const statusStyle = CLAIM_STATUS_STYLES[displayStatus] || CLAIM_STATUS_STYLES.Declined;
                    const statusNote = getClaimStatusNote(claim, displayStatus);
                    const isExpanded = expandedClaimId === claim.id;
                    return (
                    <div
                      key={claim.id}
                      className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition ${
                        isExpanded ? "border-[#2D366D]/30" : "border-slate-200"
                      }`}
                    >
                      {/* Summary row: item name, category and status.
                          Click to show / hide the full details. */}
                      <button
                        type="button"
                        onClick={() => setExpandedClaimId(isExpanded ? null : claim.id)}
                        aria-expanded={isExpanded}
                        className="w-full flex justify-between items-center gap-3 p-5 text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2D366D]/30"
                      >
                        <div className="min-w-0">
                          <h3 className="font-bold text-lg text-[#2D366D] break-words">
                            {toTitleCase(
                              claim.item_details?.title ||
                              claim.item?.title ||
                              "Claimed Item"
                            )}
                          </h3>

                          <p className="text-sm text-slate-500 mt-1">
                            {toTitleCase(claim.item_details?.category || "-")}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-3">
                          <span
                            className={`whitespace-nowrap px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${statusStyle.badge}`}
                          >
                            {displayStatus}
                          </span>
                          <FaChevronDown
                            size={14}
                            className={`text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </div>
                      </button>

                      {isExpanded && (
                      <div className="border-t border-slate-100 px-5 pb-5">
                      {/* Details */}
                      <div className="grid grid-cols-2 gap-4 mt-4 text-sm">

                        <div>
                          <p className="text-slate-400 text-xs uppercase font-semibold">
                            Location
                          </p>
                          <p className="font-medium text-slate-700">
                            {toTitleCase(claim.item_details?.location || "-")}
                          </p>
                        </div>

                        <div>
                          <p className="text-slate-400 text-xs uppercase font-semibold">
                            Submitted
                          </p>
                          <p className="font-medium text-slate-700">
                            {formatSubmitted(claim.claim_date)}
                          </p>
                        </div>

                        <div>
                          <p className="text-slate-400 text-xs uppercase font-semibold">
                            Meeting Date
                          </p>
                          <p className="font-medium text-slate-700">
                            {claim.meeting_date || "Pending Staff Review"}
                          </p>
                        </div>

                        <div>
                          <p className="text-slate-400 text-xs uppercase font-semibold">
                            Meeting Time
                          </p>
                          <p className="font-medium text-slate-700">
                            {claim.meeting_time || "-"}
                          </p>
                        </div>

                        <div className="col-span-2">
                          <p className="text-slate-400 text-xs uppercase font-semibold">
                            Meeting Location
                          </p>
                          <p className="font-medium text-slate-700">
                            {claim.meeting_location || "Student Affairs Office"}
                          </p>
                        </div>
                      </div>

                      {/* Footer Note */}
                      {statusNote && (
                        <div className={`mt-4 rounded-xl border p-3 ${statusStyle.note}`}>
                          <p className="text-xs font-medium">{statusNote}</p>
                        </div>
                      )}

                      {/* Missed meetings + Re-claim (Session Timed Out only) */}
                      {displayStatus === 'Session Timed Out' && (
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                          <span className={`text-xs font-semibold ${claim.online_claim_blocked ? 'text-red-600' : 'text-slate-500'}`}>
                            Missed meetings for this item: {Math.min(3, (claim.missed_meetings || 0) + 1)} of 3
                          </span>
                          {claim.can_reclaim && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setReclaimTarget(claim);
                              }}
                              className="flex items-center gap-2 rounded-xl bg-[#2D366D] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#1E2755]"
                            >
                              <FaRedo size={12} /> Re-claim
                            </button>
                          )}
                          {claim.online_claim_blocked && (
                            <span className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
                              <FaBan size={12} /> Claim in person at the SAO
                            </span>
                          )}
                        </div>
                      )}
                      </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="bg-white border-t border-slate-200 px-6 py-4 flex justify-end">
              <button
                onClick={() => { setShowMyMeetings(false); setExpandedClaimId(null); }}
                className="px-5 py-2 rounded-xl bg-[#2D366D] text-white font-semibold hover:bg-[#1E2755] transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Session timeout: warning before logout / expired notice */}
      <SessionTimeoutModal
        open={(isLoggedIn && sessionSecondsLeft !== null) || (sessionExpired && !isLoggedIn)}
        mode={isLoggedIn && sessionSecondsLeft !== null ? 'warning' : 'expired'}
        secondsLeft={sessionSecondsLeft ?? 0}
        totalSeconds={SESSION_WARNING_MS / 1000}
        timeoutMinutes={SESSION_TIMEOUT_MS / 60000}
        onStay={staySignedIn}
        onLogout={() => { warningOpenRef.current = false; setSessionSecondsLeft(null); logout(); }}
        onClose={() => setSessionExpired(false)}
        onLogin={() => { setSessionExpired(false); onOpenLogin && onOpenLogin(); }}
      />
    </div>
  );
};

export default PublicBoard;
