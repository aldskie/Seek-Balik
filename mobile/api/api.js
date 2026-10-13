import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// ==========================================================
// SERVER ADDRESS — read from the .env file in the project root.
//
//   EXPO_PUBLIC_BASE_API=http://192.168.1.21:8000/
//
// Every endpoint below is also a full address in .env and must start with
// this same base. To move to another network (hotspot) or to the deployed
// server, find-and-replace the base address across the whole .env file.
//
// After editing .env, restart with:  npx expo start -c
// ==========================================================

const getBaseUrl = () => {
  const url = (process.env.EXPO_PUBLIC_BASE_API || '').trim();

  if (!url) {
    throw new Error(
      'EXPO_PUBLIC_BASE_API is missing. Add it to the .env file, then restart with "npx expo start -c".',
    );
  }

  return url.endsWith('/') ? url : `${url}/`;
};

export const API_URL = getBaseUrl();

// ==========================================================
// ENDPOINTS — each one is a full address read from the .env file, e.g.
//   EXPO_PUBLIC_LOGIN_API=http://192.168.1.21:8000/account/login/
// Endpoints that need an id use ":id" as the placeholder, e.g.
//   EXPO_PUBLIC_CLAIM_REVIEW_API=http://192.168.1.21:8000/claim/review/:id/
//
// Each one must be written out in full as process.env.EXPO_PUBLIC_...
// (Expo replaces them when it builds the app). After editing .env, restart
// with:  npx expo start -c
// ==========================================================

// Stops the app with a clear message if an endpoint is missing from .env,
// or if it points at a different server than EXPO_PUBLIC_BASE_API (the
// login token is only ever sent to that one server).
const need = (name, value) => {
  const url = (value || '').trim();

  if (!url) {
    throw new Error(
      `${name} is missing. Add it to the .env file, then restart with "npx expo start -c".`,
    );
  }

  if (!url.startsWith(API_URL)) {
    throw new Error(
      `${name} must start with EXPO_PUBLIC_BASE_API (${API_URL}). Fix it in the .env file.`,
    );
  }

  return url;
};

const EP = {
  CLAIM_CREATE: need('EXPO_PUBLIC_CLAIM_CREATE_API', process.env.EXPO_PUBLIC_CLAIM_CREATE_API),
  CLAIMS: need('EXPO_PUBLIC_CLAIMS_API', process.env.EXPO_PUBLIC_CLAIMS_API),
  CLAIM_REVIEW: need('EXPO_PUBLIC_CLAIM_REVIEW_API', process.env.EXPO_PUBLIC_CLAIM_REVIEW_API),
  CLAIM_SCHEDULE: need('EXPO_PUBLIC_CLAIM_SCHEDULE_API', process.env.EXPO_PUBLIC_CLAIM_SCHEDULE_API),
  CLAIM_DECLINE: need('EXPO_PUBLIC_CLAIM_DECLINE_API', process.env.EXPO_PUBLIC_CLAIM_DECLINE_API),
  CLAIM_RECLAIM: need('EXPO_PUBLIC_CLAIM_RECLAIM_API', process.env.EXPO_PUBLIC_CLAIM_RECLAIM_API),
  CLAIM_CHECK: need('EXPO_PUBLIC_CLAIM_CHECK_API', process.env.EXPO_PUBLIC_CLAIM_CHECK_API),
  CLAIM_SCHEDULES: need('EXPO_PUBLIC_CLAIM_SCHEDULES_API', process.env.EXPO_PUBLIC_CLAIM_SCHEDULES_API),
  CLAIM_MINE: need('EXPO_PUBLIC_CLAIM_MINE_API', process.env.EXPO_PUBLIC_CLAIM_MINE_API),
  CLAIM_CHECK_ITEM: need('EXPO_PUBLIC_CLAIM_CHECK_ITEM_API', process.env.EXPO_PUBLIC_CLAIM_CHECK_ITEM_API),
  // Disabled claim days / time slots (BlockedSlot model). Same endpoints the
  // website's Manage Slots calendar and ClaimModal use.
  CLAIM_BLOCKED_SLOTS: need('EXPO_PUBLIC_CLAIM_BLOCKED_SLOTS_API', process.env.EXPO_PUBLIC_CLAIM_BLOCKED_SLOTS_API),
  CLAIM_BLOCKED_SLOT_DETAIL: need('EXPO_PUBLIC_CLAIM_BLOCKED_SLOT_DETAIL_API', process.env.EXPO_PUBLIC_CLAIM_BLOCKED_SLOT_DETAIL_API),
  ITEMS: need('EXPO_PUBLIC_ITEMS_API', process.env.EXPO_PUBLIC_ITEMS_API),
  ITEM_CREATE: need('EXPO_PUBLIC_ITEM_CREATE_API', process.env.EXPO_PUBLIC_ITEM_CREATE_API),
  ITEM_DETAIL: need('EXPO_PUBLIC_ITEM_DETAIL_API', process.env.EXPO_PUBLIC_ITEM_DETAIL_API),
  ITEM_TRACK: need('EXPO_PUBLIC_ITEM_TRACK_API', process.env.EXPO_PUBLIC_ITEM_TRACK_API),
  ITEM_MINE: need('EXPO_PUBLIC_ITEM_MINE_API', process.env.EXPO_PUBLIC_ITEM_MINE_API),
  LOGIN: need('EXPO_PUBLIC_LOGIN_API', process.env.EXPO_PUBLIC_LOGIN_API),
  REGISTER: need('EXPO_PUBLIC_REGISTER_API', process.env.EXPO_PUBLIC_REGISTER_API),
  REFRESH: need('EXPO_PUBLIC_REFRESH_API', process.env.EXPO_PUBLIC_REFRESH_API),
  VERIFY_EMAIL: need('EXPO_PUBLIC_VERIFY_EMAIL_API', process.env.EXPO_PUBLIC_VERIFY_EMAIL_API),
  VERIFY_EMAIL_RESEND: need('EXPO_PUBLIC_VERIFY_EMAIL_RESEND_API', process.env.EXPO_PUBLIC_VERIFY_EMAIL_RESEND_API),
  USERS: need('EXPO_PUBLIC_USERS_API', process.env.EXPO_PUBLIC_USERS_API),
  CURRENT_USER: need('EXPO_PUBLIC_CURRENT_USER_API', process.env.EXPO_PUBLIC_CURRENT_USER_API),
  USER_DETAIL: need('EXPO_PUBLIC_USER_DETAIL_API', process.env.EXPO_PUBLIC_USER_DETAIL_API),
  CHANGE_PASSWORD: need('EXPO_PUBLIC_CHANGE_PASSWORD_API', process.env.EXPO_PUBLIC_CHANGE_PASSWORD_API),
  TERMS_ACCEPT: need('EXPO_PUBLIC_TERMS_ACCEPT_API', process.env.EXPO_PUBLIC_TERMS_ACCEPT_API),
  PASSWORD_RESET_REQUEST: need('EXPO_PUBLIC_PASSWORD_RESET_REQUEST_API', process.env.EXPO_PUBLIC_PASSWORD_RESET_REQUEST_API),
  PASSWORD_RESET_VERIFY: need('EXPO_PUBLIC_PASSWORD_RESET_VERIFY_API', process.env.EXPO_PUBLIC_PASSWORD_RESET_VERIFY_API),
  PASSWORD_RESET_CONFIRM: need('EXPO_PUBLIC_PASSWORD_RESET_CONFIRM_API', process.env.EXPO_PUBLIC_PASSWORD_RESET_CONFIRM_API),
  LEADERBOARD: need('EXPO_PUBLIC_LEADERBOARD_API', process.env.EXPO_PUBLIC_LEADERBOARD_API),
  POINTS_TRACKING: need('EXPO_PUBLIC_POINTS_TRACKING_API', process.env.EXPO_PUBLIC_POINTS_TRACKING_API),
  LEADERBOARD_SETTINGS: need('EXPO_PUBLIC_LEADERBOARD_SETTINGS_API', process.env.EXPO_PUBLIC_LEADERBOARD_SETTINGS_API),
  LEADERBOARD_SETTINGS_UPDATE: need('EXPO_PUBLIC_LEADERBOARD_SETTINGS_UPDATE_API', process.env.EXPO_PUBLIC_LEADERBOARD_SETTINGS_UPDATE_API),
  LEADERBOARD_HISTORY: need('EXPO_PUBLIC_LEADERBOARD_HISTORY_API', process.env.EXPO_PUBLIC_LEADERBOARD_HISTORY_API),
  LEADERBOARD_HISTORY_ARCHIVE: need('EXPO_PUBLIC_LEADERBOARD_HISTORY_ARCHIVE_API', process.env.EXPO_PUBLIC_LEADERBOARD_HISTORY_ARCHIVE_API),
  QUESTIONS: need('EXPO_PUBLIC_QUESTIONS_API', process.env.EXPO_PUBLIC_QUESTIONS_API),
  ISSUE_REPORT_CREATE: need('EXPO_PUBLIC_ISSUE_REPORT_CREATE_API', process.env.EXPO_PUBLIC_ISSUE_REPORT_CREATE_API),
  ISSUE_REPORTS_MINE: need('EXPO_PUBLIC_ISSUE_REPORTS_MINE_API', process.env.EXPO_PUBLIC_ISSUE_REPORTS_MINE_API),
  ISSUE_REPORTS: need('EXPO_PUBLIC_ISSUE_REPORTS_API', process.env.EXPO_PUBLIC_ISSUE_REPORTS_API),
  ISSUE_REPORT_DETAIL: need('EXPO_PUBLIC_ISSUE_REPORT_DETAIL_API', process.env.EXPO_PUBLIC_ISSUE_REPORT_DETAIL_API),
  ALERTS: need('EXPO_PUBLIC_ALERTS_API', process.env.EXPO_PUBLIC_ALERTS_API),
  ALERTS_UNREAD_COUNT: need('EXPO_PUBLIC_ALERTS_UNREAD_COUNT_API', process.env.EXPO_PUBLIC_ALERTS_UNREAD_COUNT_API),
  ALERT_READ: need('EXPO_PUBLIC_ALERT_READ_API', process.env.EXPO_PUBLIC_ALERT_READ_API),
  ALERTS_READ_ALL: need('EXPO_PUBLIC_ALERTS_READ_ALL_API', process.env.EXPO_PUBLIC_ALERTS_READ_ALL_API),
  ALERT_PREFERENCES: need('EXPO_PUBLIC_ALERT_PREFERENCES_API', process.env.EXPO_PUBLIC_ALERT_PREFERENCES_API),
  PUSH_TOKEN: need('EXPO_PUBLIC_PUSH_TOKEN_API', process.env.EXPO_PUBLIC_PUSH_TOKEN_API),
  PUSH_TOKEN_REMOVE: need('EXPO_PUBLIC_PUSH_TOKEN_REMOVE_API', process.env.EXPO_PUBLIC_PUSH_TOKEN_REMOVE_API),
};

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
});

// ==========================================================
// SECURITY HELPERS
// ==========================================================

// Tokens are kept in the phone's secure storage, readable only while the
// phone is unlocked, and never copied to another device through a backup.
const TOKEN_OPTIONS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const ACCESS_KEY = 'accessToken';
const REFRESH_KEY = 'refreshToken';

const readToken = (key) => SecureStore.getItemAsync(key, TOKEN_OPTIONS);
const saveToken = (key, value) =>
  SecureStore.setItemAsync(key, value, TOKEN_OPTIONS);

const clearTokens = async () => {
  await SecureStore.deleteItemAsync(ACCESS_KEY, TOKEN_OPTIONS);
  await SecureStore.deleteItemAsync(REFRESH_KEY, TOKEN_OPTIONS);
};

// Makes a value safe to place inside a URL path, so an id or ticket code
// such as "../account/users" or "5/?x=1" can never point the request at a
// different endpoint.
const seg = (value) => encodeURIComponent(String(value ?? '').trim());

// Fills the ":id" placeholder of an endpoint path with a safely escaped value.
const path = (template, value) => template.replace(':id', seg(value));

// True when the request goes to our own backend. The login token is only
// ever attached to these, so it cannot be sent to another server by mistake.
const isOurApi = (config) => {
  if (!config) return false;
  if (config.baseURL && config.baseURL !== API_URL) return false;

  const url = config.url || '';
  const isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(url) || url.startsWith('//');

  return !isAbsolute || url.startsWith(API_URL);
};

// Removes the login token from an error before it is handed to a screen,
// so console.error(err) never prints the token into the logs.
const scrubError = (error) => {
  const headers = error?.config?.headers;

  if (headers) {
    if (typeof headers.delete === 'function') headers.delete('Authorization');
    delete headers.Authorization;
  }

  return error;
};

// No token is attached to these, and a 401 from them never triggers a
// session refresh (a 401 from login just means a wrong password).
// EP.VERIFY_EMAIL also covers EP.VERIFY_EMAIL_RESEND, and
// 'account/password-reset/' covers its request/, verify/ and confirm/ endpoints.
const PUBLIC_ENDPOINTS = [
  EP.LOGIN,
  EP.REGISTER,
  EP.REFRESH,
  EP.VERIFY_EMAIL,
  EP.VERIFY_EMAIL_RESEND,
  EP.PASSWORD_RESET_REQUEST,
  EP.PASSWORD_RESET_VERIFY,
  EP.PASSWORD_RESET_CONFIRM,
];

const isPublicEndpoint = (url) =>
  PUBLIC_ENDPOINTS.some((endpoint) => (url || '').startsWith(endpoint));

// Request Interceptor: Automatically injects JWT token from SecureStore
api.interceptors.request.use(
  async (config) => {
    // The released app must never send passwords or tokens over plain http.
    if (!__DEV__ && !API_URL.startsWith('https://')) {
      throw new Error('The app is not set up with a secure (https) server address.');
    }

    // A request to any other server never carries our token.
    if (!isOurApi(config)) {
      if (config.headers) delete config.headers.Authorization;
      return config;
    }

    if (!isPublicEndpoint(config.url)) {
      const token = await readToken(ACCESS_KEY);

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// ==========================================================
// SESSION TIMEOUT
//
// When a request comes back 401 (access token expired), the app quietly
// asks account/refresh/ for a new access token and retries the request
// once. If the refresh token is also expired or rejected, both tokens are
// cleared and the "session expired" handler runs, so the app can send the
// user to the login screen with a message.
//
// Register the handler once, near the root of the app:
//   setSessionExpiredHandler(() => { ...reset navigation to Login... });
// ==========================================================

let sessionExpiredHandler = null;

export function setSessionExpiredHandler(handler) {
  sessionExpiredHandler = handler;
}

// Marks errors caused by an ended session, so screens can skip their own
// error alerts: if (err.sessionExpired) return;
const expireSession = async (error) => {
  await clearTokens();

  if (error) error.sessionExpired = true;

  if (sessionExpiredHandler) {
    try {
      sessionExpiredHandler();
    } catch (err) {
      console.error('Session expired handler failed:', err?.message || err);
    }
  }
};

// Only one refresh runs at a time; requests that fail together share it.
let refreshPromise = null;

// Resolves to a new access token, or null if the session is really over.
// Throws if the refresh could not be attempted (no connection, server down),
// so a bad signal never logs the user out.
const refreshAccessToken = () => {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refresh = await readToken(REFRESH_KEY);
      if (!refresh) return null;

      try {
        // Plain axios (not `api`) so this call skips the interceptors.
        const res = await axios.post(
          EP.REFRESH,
          { refresh },
          { timeout: 15000 },
        );

        if (typeof res.data?.access !== 'string' || !res.data.access) return null;

        await saveToken(ACCESS_KEY, res.data.access);
        // Saved only if the backend rotates refresh tokens.
        if (typeof res.data.refresh === 'string' && res.data.refresh) {
          await saveToken(REFRESH_KEY, res.data.refresh);
        }

        return res.data.access;
      } catch (err) {
        const status = err.response?.status;
        // The server rejected the refresh token: the session is over.
        if (status === 400 || status === 401 || status === 403) return null;

        // The refresh token is in this request's body; keep it out of logs.
        if (err.config) err.config.data = undefined;
        throw err;
      }
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
};

// Response Interceptor: refreshes the session on 401 and retries once.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (
      !original ||
      error.response?.status !== 401 ||
      original._retry ||
      !isOurApi(original) ||
      isPublicEndpoint(original.url)
    ) {
      return Promise.reject(scrubError(error));
    }

    // Not signed in at all: a plain 401, nothing to expire.
    const hadToken = await readToken(ACCESS_KEY);
    const hadRefresh = await readToken(REFRESH_KEY);
    if (!hadToken && !hadRefresh) {
      return Promise.reject(scrubError(error));
    }

    original._retry = true;

    let newToken;
    try {
      newToken = await refreshAccessToken();
    } catch (refreshError) {
      // Could not reach the server; keep the session and report the failure.
      return Promise.reject(scrubError(refreshError));
    }

    if (!newToken) {
      await expireSession(error);
      return Promise.reject(scrubError(error));
    }

    // The request interceptor attaches the new token.
    return api(original);
  },
);

// Returns true if there is a usable session, refreshing it if needed.
// Call when the app opens or returns from the background.
export async function ensureSession() {
  const refresh = await readToken(REFRESH_KEY);
  const access = await readToken(ACCESS_KEY);
  if (!refresh && !access) return false;

  try {
    await api.get(EP.CURRENT_USER);
    return true;
  } catch (err) {
    // Session ended (handler already ran) -> false. Offline -> assume still valid.
    return !err.sessionExpired && err.response?.status !== 401;
  }
}

// =====================
// CLAIMS
// =====================

export const createClaim = async (data) => {
  const res = await api.post(EP.CLAIM_CREATE, data);
  return res.data;
};

export const getClaims = async () => {
  const res = await api.get(EP.CLAIMS);
  return res.data;
};

export const reviewClaim = async (id, payload) => {
  const res = await api.put(path(EP.CLAIM_REVIEW, id), payload);
  return res.data;
};

export const scheduleMeeting = async (id, payload) => {
  const res = await api.put(path(EP.CLAIM_SCHEDULE, id), payload);
  return res.data;
};

// DECLINE A CLAIM (staff-only). Same endpoint as the website:
// PATCH claim/decline/<id>/ (decline_claim in claim/views.py).
// The backend always saves the claim as declined; `remarks` is the reason
// and `extra` may include { not_owner: true } for "Not the Owner".
export const declineClaim = async (id, remarks = '', extra = {}) => {
  const res = await api.patch(path(EP.CLAIM_DECLINE, id), {
    declined_remarks: remarks,
    ...extra,
  });
  return res.data;
};

// RE-CLAIM after a missed meeting (a "Timed Out" claim). Same endpoint as
// the website: POST claim/reclaim/<id>/ (reclaim_claim in claim/views.py).
// Only the new slot is sent, as { meeting_date: 'YYYY-MM-DD', meeting_time:
// '9:00 AM - 10:00 AM' }; the backend copies the original answers itself.
export const reclaimClaim = async (id, data) => {
  const res = await api.post(path(EP.CLAIM_RECLAIM, id), data);
  return res.data;
};

export const checkClaimStatus = async (itemId, email) => {
  const res = await api.get(path(EP.CLAIM_CHECK, itemId), { params: { email } });
  return res.data;
};

export const getAvailableSchedules = async (date) => {
  const res = await api.get(EP.CLAIM_SCHEDULES, { params: { date } });
  return res.data;
};

// ==========================================================
// DISABLED CLAIM SLOTS (BlockedSlot model)
//
// Staff disable claiming for a whole day or a single time slot (website:
// Manage Slots calendar). The server already rejects claims, re-claims and
// staff schedules on a disabled slot; the app reads this list so it never
// offers those slots in the first place.
//
// Each entry: { id, date: 'YYYY-MM-DD', time_slot, reason, created_by }
// time_slot is "" (or null) when the WHOLE DAY is disabled.
// ==========================================================

// Disabled slots between two dates (inclusive), both 'YYYY-MM-DD'.
// Always resolves to an array, whether the server pages the list or not.
export const getBlockedSlots = async ({ start, end } = {}) => {
  const res = await api.get(EP.CLAIM_BLOCKED_SLOTS, { params: { start, end } });
  const data = res.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
};

// Staff-only. Leave time_slot as "" to disable the whole day.
export const createBlockedSlot = async ({ date, time_slot = '', reason = '' }) => {
  const res = await api.post(EP.CLAIM_BLOCKED_SLOTS, { date, time_slot, reason });
  return res.data;
};

// Staff-only. Re-enables a day or time slot.
export const deleteBlockedSlot = async (id) => {
  const res = await api.delete(path(EP.CLAIM_BLOCKED_SLOT_DETAIL, id));
  return res.data;
};


export const getMyClaims = async () => {
  const res = await api.get(EP.CLAIM_MINE);
  return res.data;
};

// Public endpoint (no staff permission required).
// NOTE: NOT scoped by email — it returns whichever claim on this item
// currently has a meeting_date/meeting_time set, not necessarily the
// calling user's own claim. Only trust this once checkClaimStatus has
// already confirmed this email has an active (Pending/Scheduled) claim
// on the same item; in normal operation there's only one claimant with
// an active schedule per item at a time, but this isn't guaranteed by
// the backend. A future improvement would be a "my claim for this item"
// endpoint filtered by email/user.
// Returns: { has_claim: boolean, meeting_date?, meeting_time? }
export const checkItemClaim = async (itemId) => {
  const res = await api.get(path(EP.CLAIM_CHECK_ITEM, itemId));
  return res.data;
};

// =====================
// ITEMS
// =====================

export async function getItems() {
  const res = await api.get(EP.ITEMS);
  return res.data;
}

export async function createLostItem(formData) {
  // Photo uploads can take longer than the default 15 seconds.
  const res = await api.post(EP.ITEM_CREATE, formData, { timeout: 60000 });
  return res.data;
}

export async function editLostItem(id, data) {
  const res = await api.put(path(EP.ITEM_DETAIL, id), data);
  return res.data;
}

export async function archiveItem(id) {
  const res = await api.put(path(EP.ITEM_DETAIL, id), { status: 'Archived' });
  return res.data;
}

export async function getItemById(id) {
  const res = await api.get(path(EP.ITEM_DETAIL, id));
  return res.data;
}

export async function trackItem(ticketCode) {
  const res = await api.get(path(EP.ITEM_TRACK, ticketCode));
  return res.data;
}

export async function getMyItems() {
  const res = await api.get(EP.ITEM_MINE);
  return res.data;
}

// =====================
// AUTH
// =====================

export async function loginUser(username, password) {
  const res = await api.post(EP.LOGIN, {
    username,
    password,
  });

  if (typeof res.data?.access === 'string' && res.data.access) {
    await saveToken(ACCESS_KEY, res.data.access);
  }
  if (typeof res.data?.refresh === 'string' && res.data.refresh) {
    await saveToken(REFRESH_KEY, res.data.refresh);
  }

  return res.data;
}

export async function logoutUser() {
  await clearTokens();
}

// ==========================================================
// SELF-REGISTRATION — TWO STEPS (same endpoints as the website)
//
// registerUser() (step 1) starts the sign-up and emails a 6-digit code.
// The account stays unverified until verifyEmail() (step 2) confirms the
// code, activates the account and emails the temporary password.
// resendVerificationCode() re-sends a code for an unverified account.
// ==========================================================

// The terms version the user agreed to on the Terms screen just before the
// registration form (set by hooks/TermsConsent.js). registerUser() sends it
// with the sign-up, so the backend saves the consent on the new account.
// Kept in memory only: it is gone once the app closes.
let registrationTermsVersion = null;

export function setRegistrationTermsVersion(version) {
  registrationTermsVersion = version || null;
}

export async function registerUser(data) {
  let payload = data;

  if (registrationTermsVersion) {
    if (typeof FormData !== 'undefined' && data instanceof FormData) {
      data.append('accepted_terms_version', registrationTermsVersion);
    } else {
      payload = { ...data, accepted_terms_version: registrationTermsVersion };
    }
  }

  const res = await api.post(EP.REGISTER, payload);
  return res.data;
}

export async function verifyEmail(email, code) {
  const res = await api.post(EP.VERIFY_EMAIL, { email, code });
  return res.data;
}

export async function resendVerificationCode(email) {
  const res = await api.post(EP.VERIFY_EMAIL_RESEND, { email });
  return res.data;
}

export async function getUsers() {
  const res = await api.get(EP.USERS);
  return res.data;
}

export async function getCurrentUser() {
  const res = await api.get(EP.CURRENT_USER);
  return res.data;
}

export async function getUserById(id) {
  const res = await api.get(path(EP.USER_DETAIL, id));
  return res.data;
}

export async function updateUserById(id, data) {
  const res = await api.put(path(EP.USER_DETAIL, id), data);
  return res.data;
}

// Used by AccountDetailsScreen to save the signed-in user's own details.
// `changes` is { first_name, last_name, contact_number }.
//
// ASSUMPTION: this reuses PUT account/users/<id>/ (same as updateUserById),
// sending the current user's data with the changes merged in. If the backend
// only lets staff use that endpoint, students will get a 403 and the backend
// needs a "update my own profile" endpoint instead.
export async function updateCurrentUser(changes) {
  const current = await getCurrentUser();

  if (!current?.id) {
    throw new Error('We could not find your account. Please sign in again.');
  }

  // Only these three fields may be changed from this screen, whatever the
  // caller passes in.
  const allowedChanges = {};
  ['first_name', 'last_name', 'contact_number'].forEach((field) => {
    if (changes && changes[field] !== undefined) {
      allowedChanges[field] = changes[field];
    }
  });

  try {
    const res = await api.put(path(EP.USER_DETAIL, current.id), {
      ...current,
      ...allowedChanges,
    });
    return res.data;
  } catch (err) {
    if (err.sessionExpired) throw err;

    const data = err.response?.data;
    let message = '';

    if (typeof data === 'string') {
      message = data;
    } else if (data && typeof data === 'object') {
      // DRF errors look like { detail: '...' } or { field: ['...'] }.
      const first = data.detail || data.error || Object.values(data)[0];
      message = Array.isArray(first) ? String(first[0]) : String(first || '');
    }

    if (err.response?.status === 403) {
      message = message || 'You do not have permission to edit this account.';
    }

    throw new Error(
      message || 'We could not save your changes. Please check your connection and try again.',
    );
  }
}

// Kept so any existing imports don't break. Same request as registerUser.
export async function createUser(data) {
  const res = await api.post(EP.REGISTER, data);
  return res.data;
}

export async function changePassword(current_password, new_password) {
  const res = await api.post(EP.CHANGE_PASSWORD, {
    current_password,
    new_password,
  });
  return res.data;
}

// Records that the signed-in user agreed to the Terms and Data Privacy
// Consent. `version` is the version of the terms the app showed; the backend
// rejects it if it is not the current one. Returns the updated account, with
// terms_accepted: true.
export async function acceptTermsRequest(version) {
  const res = await api.post(EP.TERMS_ACCEPT, { version });
  return res.data;
}

// ==========================================================
// FORGOT PASSWORD (public: no login required)
// Same three endpoints as the website. No token is attached to them
// (see PUBLIC_ENDPOINTS above).
//
//   requestPasswordReset     -> emails a 6-digit code
//   verifyPasswordResetCode  -> checks the code (does not use it up)
//   confirmPasswordReset     -> checks the code again and sets the new password
// ==========================================================

export async function requestPasswordReset(email) {
  // The server sends the email before it answers, which can take longer
  // than the default 15 seconds.
  const res = await api.post(
    EP.PASSWORD_RESET_REQUEST,
    { email },
    { timeout: 30000 },
  );
  return res.data;
}

export async function verifyPasswordResetCode(email, code) {
  const res = await api.post(EP.PASSWORD_RESET_VERIFY, {
    email,
    code,
  });
  return res.data;
}

export async function confirmPasswordReset(email, code, newPassword) {
  const res = await api.post(EP.PASSWORD_RESET_CONFIRM, {
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
  const res = await api.get(EP.LEADERBOARD);
  return res.data;
};

export const getPointsTracking = async () => {
  const res = await api.get(EP.POINTS_TRACKING);
  return res.data;
};

export const getLeaderboardSettings = async () => {
  const res = await api.get(EP.LEADERBOARD_SETTINGS);
  return res.data;
};

export const updateLeaderboardSettings = async (data) => {
  const res = await api.put(EP.LEADERBOARD_SETTINGS_UPDATE, data);
  return res.data;
};

export const getLeaderboardHistory = async (params = {}) => {
  const response = await api.get(EP.LEADERBOARD_HISTORY, { params });
  return response.data;
};

export const archiveLeaderboardHistory = async (payload) => {
  const response = await api.post(EP.LEADERBOARD_HISTORY_ARCHIVE, payload);
  return response.data;
};

// QUESTION BANK
export const getQuestionBank = () => api.get(EP.QUESTIONS);

//REPORT AN ISSUE
export const submitIssueReport = async ({ category, subject, description }) => {
  const res = await api.post(EP.ISSUE_REPORT_CREATE, {
    category,
    subject,
    description,
  });
  return res.data;
};

export const getMyIssueReports = async () => {
  const res = await api.get(EP.ISSUE_REPORTS_MINE);
  return res.data;
};

export const getIssueReports = async (params = {}) => {
  const res = await api.get(EP.ISSUE_REPORTS, { params });
  return res.data;
};

export const getIssueReportDetail = async (id) => {
  const res = await api.get(path(EP.ISSUE_REPORT_DETAIL, id));
  return res.data;
};

export const updateIssueReportStatus = async (id, status) => {
  const res = await api.patch(path(EP.ISSUE_REPORT_DETAIL, id), { status });
  return res.data;
};

// =====================
// IN-APP NOTIFICATIONS
// =====================

// Returns { unread, results: [{ id, kind, title, body, data, is_read, created_at }] }
export const getNotifications = async () => {
  const res = await api.get(EP.ALERTS);
  return res.data;
};

// Returns { unread } — used by the bell badge.
export const getUnreadNotificationCount = async () => {
  const res = await api.get(EP.ALERTS_UNREAD_COUNT);
  return res.data;
};

export const markNotificationRead = async (id) => {
  const res = await api.post(path(EP.ALERT_READ, id));
  return res.data;
};

export const markAllNotificationsRead = async () => {
  const res = await api.post(EP.ALERTS_READ_ALL);
  return res.data;
};

// Returns { push_enabled, email_enabled }
export const getNotificationPreferences = async () => {
  const res = await api.get(EP.ALERT_PREFERENCES);
  return res.data;
};

// Pass only the switch that changed, e.g. { email_enabled: false }.
export const updateNotificationPreferences = async (changes) => {
  const res = await api.patch(EP.ALERT_PREFERENCES, changes);
  return res.data;
};

// =====================
// REAL PUSH NOTIFICATIONS
// =====================

// Saves this phone's Expo push token for the logged-in account.
export const registerPushToken = async (token, platform) => {
  const res = await api.post(EP.PUSH_TOKEN, { token, platform });
  return res.data;
};

// Removes this phone's token (called on logout).
export const removePushToken = async (token) => {
  const res = await api.post(EP.PUSH_TOKEN_REMOVE, { token });
  return res.data;
};