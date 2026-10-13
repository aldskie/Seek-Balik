import axios from "axios";

// Backend URL comes from the VITE_API_URL environment variable.
// - Local: falls back to http://localhost:8000/ (no .env needed)
// - Production: set VITE_API_URL in Vercel (e.g. https://yourname.pythonanywhere.com/)
// A trailing slash is added automatically if missing, since every path
// below is relative ("account/login/", "item/details/", ...).
const RAW_API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/";
export const API_URL = RAW_API_URL.endsWith("/") ? RAW_API_URL : `${RAW_API_URL}/`;

const api = axios.create({
  baseURL: API_URL,
});

// Automatic JWT Token Interceptor
// Login / sign-up / password-reset requests never carry the saved token: a
// stale token (expired session, deleted or disabled account) would make the
// server reject the request with 401 before it even checks the password.
const PUBLIC_AUTH_PATHS = [
  "account/login/",
  "account/refresh/",
  "account/register/",
  "account/verify-email/",
  "account/password-reset/",
];

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("accessToken");
    const url = config.url || "";
    const isPublicAuth = PUBLIC_AUTH_PATHS.some((p) => url.includes(p));
    if (token && !isPublicAuth) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ==========================================================
// 401 HANDLING WITH REAL TOKEN REFRESH
//
// Calls the real SimpleJWT refresh endpoint once, queues any other
// requests that 401 while that refresh is in flight (so a burst of
// parallel calls doesn't trigger multiple refresh attempts), and
// retries each original request with the new access token. Only falls
// through to logging the user out if the refresh itself fails.
//
// REFRESH_ENDPOINT is "account/refresh/" (registered as
// path('refresh/', refresh_token, ...) under the account/ prefix).
//
// Login/refresh requests are excluded from the refresh-and-retry logic
// entirely; their 401s just reject normally and the login form handles
// them as "invalid credentials".
//
// When the refresh token is also expired/invalid, onAuthFailure() runs
// a single hard redirect to /login, which unmounts every page (and every
// setInterval on it) instead of leaving them to poll a dead session.
// ==========================================================

const REFRESH_ENDPOINT = "account/refresh/";
const LOGIN_ENDPOINT = "account/login/";

let isRefreshing = false;
let refreshSubscribers = [];
// Guards against redirecting more than once if several requests hit a
// hard auth failure around the same time.
let redirectingToLogin = false;

const onRefreshed = (newToken) => {
  refreshSubscribers.forEach((cb) => cb(newToken));
  refreshSubscribers = [];
};

const clearAuth = () => {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  // Also forget the logged-in state so the app shows the logged-out view.
  localStorage.removeItem("isLoggedIn");
  localStorage.removeItem("userRole");
  localStorage.removeItem("userName");
};

// The session is genuinely over: clear it and reload the home page once, so
// every page (and every polling timer) starts again logged out.
const onAuthFailure = () => {
  clearAuth();
  if (redirectingToLogin) return;
  redirectingToLogin = true;

  if (typeof window !== "undefined") {
    window.location.href = "/";
  }
};

const isAuthEndpoint = (url = "") =>
  url.includes(LOGIN_ENDPOINT) || url.includes(REFRESH_ENDPOINT);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only attempt a refresh-and-retry once per request, and only for
    // actual 401s.
    if (
      !error.response ||
      error.response.status !== 401 ||
      isAuthEndpoint(originalRequest?.url)
    ) {
      return Promise.reject(error);
    }

    // Still 401 even with a freshly refreshed token: the account behind
    // this session no longer exists or was disabled. End the session so
    // the app stops looping and public pages work again.
    if (originalRequest?.__retriedAfter401) {
      onAuthFailure();
      return Promise.reject(error);
    }

    originalRequest.__retriedAfter401 = true;

    const refreshToken = localStorage.getItem("refreshToken");
    if (!refreshToken) {
      // Nothing to refresh with: this really is a "logged out" state.
      onAuthFailure();
      return Promise.reject(error);
    }

    // If a refresh is already in flight, queue this request and resolve it
    // once that single refresh completes.
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        refreshSubscribers.push((newToken) => {
          if (!newToken) {
            reject(error);
            return;
          }
          originalRequest.headers = {
            ...originalRequest.headers,
            Authorization: `Bearer ${newToken}`,
          };
          resolve(api(originalRequest));
        });
      });
    }

    isRefreshing = true;

    try {
      // Plain axios (not the `api` instance) so this call never goes
      // through this same interceptor and never carries a stale
      // Authorization header.
      const res = await axios.post(`${API_URL}${REFRESH_ENDPOINT}`, {
        refresh: refreshToken,
      });

      const newAccessToken = res.data.access;
      localStorage.setItem("accessToken", newAccessToken);

      isRefreshing = false;
      onRefreshed(newAccessToken);

      originalRequest.headers = {
        ...originalRequest.headers,
        Authorization: `Bearer ${newAccessToken}`,
      };
      return api(originalRequest);
    } catch (refreshError) {
      isRefreshing = false;
      onRefreshed(null); // reject every queued request too
      onAuthFailure();
      return Promise.reject(refreshError);
    }
  }
);

// =====================
// CLAIMS
// =====================

export const createClaim = async (data) => {
  const res = await api.post("claim/create/", data);
  return res.data;
};

export const getClaims = async () => {
  const res = await api.get("claim/");
  return res.data;
};

export const scheduleMeeting = async (id, data) => {
  const res = await api.put(`claim/schedule/${id}/`, data);
  return res.data;
};

// DECLINE A CLAIM (staff-only)
// Endpoint: PATCH claim/decline/<id>/ (decline_claim in claim/views.py).
// Requires in claim/urls.py:
//     path('decline/<int:pk>/', decline_claim, name='decline-claim'),
// `extra` may include { not_owner: true } for the "Not the Owner" button.
export const declineClaim = async (id, remarks, extra = {}) => {
  const res = await api.patch(`claim/decline/${id}/`, {
    declined_remarks: remarks,
    ...extra,
  });
  return res.data;
};

// =====================
// AVAILABLE SCHEDULES
// =====================

export const getAvailableSchedules = async () => {
  const res = await api.get("claim/schedules/");
  return res.data;
};

export const createAvailableSchedule = async (scheduleData) => {
  const res = await api.post("claim/schedules/", scheduleData);
  return res.data;
};

export const deleteAvailableSchedule = async (id) => {
  const res = await api.delete(`claim/schedules/${id}/`);
  return res.data;
};

// =====================
// BLOCKED (DISABLED) MEETING SLOTS
// "Manage Slots" calendar in ClaimRequests.jsx. A block with an empty
// time_slot disables the whole day.
// =====================

// params: { date } for one day, or { start, end } (YYYY-MM-DD) for a range.
export const getBlockedSlots = async (params = {}) => {
  const res = await api.get("claim/blocked-slots/", { params });
  return res.data;
};

// data: { date, time_slot ("" = whole day), reason }
export const createBlockedSlot = async (data) => {
  const res = await api.post("claim/blocked-slots/", data);
  return res.data;
};

export const deleteBlockedSlot = async (id) => {
  const res = await api.delete(`claim/blocked-slots/${id}/`);
  return res.data;
};

// =====================
// IN-APP NOTIFICATIONS (bell) — backend alerts app
// =====================

// { unread, results: [{ id, kind, title, body, data, is_read, created_at }] }
export const getNotifications = async () => {
  const res = await api.get("alerts/");
  return res.data;
};

export const getUnreadNotificationCount = async () => {
  const res = await api.get("alerts/unread-count/");
  return res.data?.unread ?? 0;
};

export const markNotificationRead = async (id) => {
  const res = await api.post(`alerts/${id}/read/`);
  return res.data;
};

export const markAllNotificationsRead = async () => {
  const res = await api.post("alerts/read-all/");
  return res.data;
};

// =====================
// ITEMS
// =====================

export async function getItems() {
  const res = await api.get("item/details/");
  return res.data;
}

// NEW: items reported by the currently logged-in user.
// `type` is optional: "Lost" or "Surrendered".
export async function getMyItems(type) {
  const res = await api.get("item/mine/", { params: type ? { type } : {} });
  return res.data;
}

export async function createLostItem(formData) {
  const res = await api.post("item/create/", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return res.data;
}

export async function editLostItem(id, data) {
  const res = await api.put(`item/details/${id}/`, data, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return res.data;
}

export async function deleteLostItem(id) {
  const res = await api.delete(`item/details/${id}/`);
  return res.data;
}

export async function getItemById(id) {
  const res = await api.get(`item/details/${id}/`);
  return res.data;
}

export async function trackItem(ticketCode) {
  const res = await api.get(`item/track/${ticketCode}/`);
  return res.data;
}

// =====================
// AUTH
// =====================

import { logActivity } from '../utils/Activitylog';

export { logActivity };

// Records that the logged-in user agreed to the Terms and Data Privacy
// Consent (version = TERMS_VERSION in components/TermsConsentModal.jsx).
export async function acceptTerms(version) {
  const res = await api.post("account/terms/accept/", { version });
  return res.data;
}

// Ends the session on the server too (blacklists the refresh token).
// Never throws: logging out locally must always work.
export async function logoutUser() {
  const refresh = localStorage.getItem("refreshToken");
  if (!refresh) return;
  try {
    await api.post("account/logout/", { refresh });
  } catch {
    /* already invalid or offline - nothing else to do */
  }
}

export async function loginUser(username, password) {
  // A new login always starts from a clean slate.
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");

  const res = await api.post("account/login/", {
    username,
    password,
  });

  localStorage.setItem("accessToken", res.data.access);
  localStorage.setItem("refreshToken", res.data.refresh);
  // A fresh login means any previous "already redirecting to /login"
  // state no longer applies.
  redirectingToLogin = false;

  logActivity({
    actor_name: res.data.user?.username || username,
    actor_role: res.data.user?.role || 'User',
    action: 'login',
    target_title: res.data.user?.email || username,
    details: 'User logged into the system',
  });

  return res.data;
}

// ==========================================================
// SELF-REGISTRATION — TWO STEPS
//
// registerUser() (step 1) starts the sign-up and emails a 6-digit
// code. The account stays unverified — and must be hidden from the
// Registered Users list by the backend — until verifyEmail() (step 2)
// confirms the code, activates the account and emails the temporary
// password. resendVerificationCode() re-sends a code for an
// unverified account.
//
// verifyEmail/resendVerificationCode use plain axios (not the `api`
// instance) so a stale accessToken can't trigger the 401 refresh flow
// on what should be a public endpoint.
//
// The "registered" activity log entry is written in verifyEmail(), not
// registerUser(), so Activity Logs only show verified registrations.
// ==========================================================

export async function registerUser(data) {
  const res = await api.post("account/register/", data);
  return res.data;
}

export async function verifyEmail(email, code) {
  const res = await axios.post(`${API_URL}account/verify-email/`, {
    email,
    code,
  });

  logActivity({
    actor_name: email,
    actor_role: "student",
    action: "created",
    target_title: email,
    details: "Registered a new student account",
  });

  return res.data;
}

export async function resendVerificationCode(email) {
  const res = await axios.post(`${API_URL}account/verify-email/resend/`, {
    email,
  });
  return res.data;
}

export async function getUsers() {
  const res = await api.get("account/users/");
  return res.data;
}

export async function getCurrentUser() {
  const res = await api.get("account/current/");
  return res.data;
}

export async function getUserById(id) {
  const res = await api.get(`account/users/${id}/`);
  return res.data;
}

// Self-service profile read/update for the currently logged-in user
// (used by UserProfile.jsx). Reuses "account/current/", which handles
// both GET and PATCH.
export async function getProfile() {
  const res = await api.get("account/current/");
  return res.data;
}

export async function updateProfile(data) {
  const res = await api.patch("account/current/", data);

  logActivity({
    actor_name: `${res.data.first_name || ""} ${res.data.last_name || ""}`.trim() || res.data.username || "User",
    actor_role: res.data.role || "User",
    action: "updated",
    target_title: "Profile",
    details: "User updated their own profile details",
  });

  return res.data;
}

export async function updateUserById(id, data) {
  const res = await api.put(`account/users/${id}/`, data);

  logActivity({
    actor_name: res.data.updated_by || 'Admin',
    actor_role: 'Admin',
    action: 'updated',
    target_title: res.data.username || res.data.email || `User #${id}`,
    details: `Updated user account details`,
  });

  return res.data;
}

export async function deleteUserById(id) {
  const res = await api.delete(`account/users/${id}/`);
  return res.data;
}

export async function createUser(data) {
  const res = await api.post("account/users/", data);

  logActivity({
    actor_name: res.data.username || data.username || 'New User',
    actor_role: res.data.role || data.role || 'User',
    action: 'created',
    target_title: res.data.email || data.email || data.username,
    details: `Created a new account as ${res.data.role || data.role || 'User'}`,
  });

  return res.data;
}

export async function changePassword(current_password, new_password) {
  const res = await api.post("account/change-password/", {
    current_password,
    new_password,
  });

  logActivity({
    actor_name: 'User',
    actor_role: 'User',
    action: 'updated',
    target_title: 'Account Security',
    details: 'User updated their account password',
  });

  return res.data;
}

// ==========================================================
// FORGOT PASSWORD (public: no login required)
// Plain axios on purpose, same reasoning as verifyEmail above.
// Requires in account/urls.py:
//     path('password-reset/request/', password_reset_request, ...),
//     path('password-reset/confirm/', password_reset_confirm, ...),
// ==========================================================
export async function requestPasswordReset(email) {
  const res = await axios.post(`${API_URL}account/password-reset/request/`, {
    email,
  });
  return res.data;
}

// Checks the 6-digit code before the new password is asked for (does
// not use the code up). Endpoint: POST account/password-reset/verify/
export async function verifyPasswordResetCode(email, code) {
  const res = await axios.post(`${API_URL}account/password-reset/verify/`, {
    email,
    code,
  });
  return res.data;
}

export async function confirmPasswordReset(email, code, newPassword) {
  const res = await axios.post(`${API_URL}account/password-reset/confirm/`, {
    email,
    code,
    new_password: newPassword,
  });
  return res.data;
}

// =====================
// GAMIFICATION
// =====================

export const getLeaderboard = async () => {
  const res = await api.get("gamification/leaderboard/");
  return res.data;
};

export const getPointsTracking = async () => {
  const res = await api.get("gamification/points-tracking/");
  return res.data;
};

// Creates a new points-tracking record (e.g. +8 pts when a found item is
// surrendered). `student_id` ties the record back to the student credited.
export const addPointsRecord = async (data) => {
  const res = await api.post("gamification/points-tracking/", data);
  return res.data;
};

export const getLeaderboardSettings = async () => {
  const res = await api.get("gamification/settings/");
  return res.data;
};

export const updateLeaderboardSettings = async (data) => {
  const res = await api.put("gamification/settings/update/", data);

  logActivity({
    actor_name: 'Admin',
    actor_role: 'Admin',
    action: 'updated',
    target_title: 'Gamification Settings',
    details: 'Updated leaderboard settings',
  });

  return res.data;
};

// Uses the shared `api` instance and a relative path (API_URL already ends
// in a slash, so no manual prefix).
export const checkClaimStatus = async (itemId, email) => {
  const res = await api.get(`claim/check/${itemId}/`, {
    params: { email },
  });
  return res.data;
};

// Claims made by the currently logged-in user.
export const getMyClaims = async () => {
  const res = await api.get("claim/my-claims/");
  return res.data;
};

// RE-CLAIM after a missed meeting ("Session Timed Out"). Only a new
// date/time is sent; the original answers are reused by the backend.
// Endpoint: POST claim/reclaim/<id>/ (reclaim_claim in claim/views.py).
export const reclaimClaim = async (id, data) => {
  const res = await api.post(`claim/reclaim/${id}/`, data);
  return res.data;
};

// ==========================================================
// REPORT ISSUES
//
// Users submit issues from the mobile app; admins review them on the
// Utilities > Report Issues page (ReportIssues.jsx).
//
// These are the "support" app's endpoints (IssueReport model), the same
// ones the mobile app submits to. The page used to read "report-issue/",
// a different app and table the mobile app never writes to, so reports
// that were in the database never showed up.
//
// support/urls.py, mounted at "support/" in backend/urls.py:
//   POST          support/issues/submit/  -> submit_issue_report (any user)
//   GET           support/issues/mine/    -> my_issue_reports    (own only)
//   GET           support/issues/         -> list_issue_reports  (admin only)
//   GET/PUT/PATCH support/issues/<id>/    -> issue_report_detail (admin only)
//
// Status values: "open" / "in_review" / "resolved". Only the status can be
// changed. There is no delete endpoint.
// ==========================================================

// Same endpoint the mobile app uses: { subject, category, description }.
// category: bug | account | item_post | claim | suggestion | other
export const createReportIssue = async (data) => {
  const res = await api.post("support/issues/submit/", data);
  return res.data;
};

// Every report (admin only). Optional filters: { status, category }.
export const getReportIssues = async (params = {}) => {
  const res = await api.get("support/issues/", { params });
  return res.data;
};

// data: { status: "open" | "in_review" | "resolved" }
export const updateReportIssue = async (id, data) => {
  const res = await api.patch(`support/issues/${id}/`, data);

  logActivity({
    actor_name: 'Admin',
    actor_role: 'Admin',
    action: 'updated',
    target_title: res.data?.subject || `Report Issue #${id}`,
    details: `Updated reported issue status to ${res.data?.status_label || data.status || 'N/A'}`,
  });

  return res.data;
};

// The support app has no delete endpoint, so this always fails with a
// clear message instead of calling a URL that does not exist. Kept so any
// page that still imports it doesn't break.
export const deleteReportIssue = async () => {
  throw new Error("Deleting reported issues is not supported.");
};