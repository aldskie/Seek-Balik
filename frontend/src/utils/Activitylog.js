
const STORAGE_KEY = 'slc_activity_logs';

export const ACTIVITY_LOG_UPDATE_EVENT = 'activity-log-updated';

// Only actions done by these roles appear in Activity Logs.
export const STAFF_ROLES = ['admin', 'moderator'];

function readSession() {
  try {
    return {
      role: (localStorage.getItem('userRole') || '').toLowerCase(),
      name: localStorage.getItem('userName') || '',
    };
  } catch {
    return { role: '', name: '' };
  }
}

// Self-service actions by students / the public (registering, logging in,
// editing their own profile or password, submitting claims or reports).
const USER_ACTIVITY_PATTERN =
  /logged in|logged into|registered|own profile|account password|submitted a claim|reported a lost/i;

/**
 * True when a log entry was performed by an admin or moderator.
 * New entries carry `performed_by_role` (stamped by logActivity from the
 * logged-in session). Older entries without it are judged by their
 * actor_role and wording.
 */
export function isStaffLog(log) {
  if (!log) return false;
  const action = (log.action || '').toLowerCase();
  if (['login', 'log_in', 'user_login', 'registered'].includes(action)) return false;

  if (log.performed_by_role) {
    return STAFF_ROLES.includes(String(log.performed_by_role).toLowerCase());
  }

  const role = (log.actor_role || '').toLowerCase();
  if (STAFF_ROLES.includes(role)) return true;
  if (['student', 'user', 'employee', 'public'].includes(role)) return false;
  return !USER_ACTIVITY_PATTERN.test(`${log.details || ''} ${log.target_title || ''}`);
}

// ==========================================================
// SERVER STORAGE
// Logs are saved on the server (backend app "activity"), so every admin
// sees every staff action from any computer, and clearing the browser
// can't erase them. They used to live only in this browser's
// localStorage under STORAGE_KEY; anything still there is moved to the
// server once (migrateBrowserLogs below) and then removed here.
// ==========================================================

const MIGRATED_FLAG = 'slc_activity_logs_moved_to_server';

// API_URL is read when a request is made (not at import time), because
// api.js itself imports this file.
async function apiBase() {
  const { API_URL } = await import('../api/api');
  return String(API_URL || 'http://localhost:8000/').replace(/\/?$/, '/');
}

async function serverFetch(path, options = {}) {
  const token = localStorage.getItem('accessToken');
  if (!token) return null; // logged out: nothing to send or read
  const res = await fetch(`${await apiBase()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`Activity log request failed (${res.status})`);
  return res.json();
}

function readRawLogs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Error reading activity logs from localStorage:', error);
    return [];
  }
}

/**
 * Sends the logs that older versions kept in this browser to the server,
 * once. The server skips any entry it already has, so it is safe to run
 * on every computer. Only an admin or moderator can do this.
 */
let migrating = null;

function migrateBrowserLogs() {
  // The page and the Dashboard may ask at the same moment: send them once.
  if (!migrating) migrating = doMigrateBrowserLogs().finally(() => { migrating = null; });
  return migrating;
}

async function doMigrateBrowserLogs() {
  try {
    if (localStorage.getItem(MIGRATED_FLAG)) return;
    const role = (localStorage.getItem('userRole') || '').toLowerCase();
    if (!STAFF_ROLES.includes(role)) return;
    const old = readRawLogs();
    if (old.length > 0) {
      await serverFetch('activity/import/', {
        method: 'POST',
        body: JSON.stringify({ logs: old }),
      });
    }
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(MIGRATED_FLAG, String(Date.now()));
  } catch (error) {
    // Try again next time; the old entries stay in the browser until then.
    console.error('Could not move browser activity logs to the server:', error);
  }
}

/** Adds older entries (e.g. from a Backup & Restore file) to the server. */
export async function importActivityLogs(entries) {
  const list = Array.isArray(entries) ? entries : [entries];
  const result = await serverFetch('activity/import/', {
    method: 'POST',
    body: JSON.stringify({ logs: list }),
  });
  window.dispatchEvent(new Event(ACTIVITY_LOG_UPDATE_EVENT));
  return result;
}

/**
 * Record a new activity log entry.
 *
 * @param {Object} entry
 * @param {string} [entry.actor_name]   Name of the person who did the action (falls back to "System")
 * @param {string} [entry.actor_role]   Role badge shown next to the action, e.g. "admin", "reporter"
 * @param {string} entry.action         One of: created, approved, declined, claimed, updated, deleted, scheduled, login
 * @param {string} [entry.target_title] The item's title, shown in quotes in the log line
 * @param {string} [entry.details]      Free-text description shown in the log line
 */
export function logActivity(entry) {
  if (!entry || !entry.action) {
    console.warn('logActivity called without an action; entry ignored.', entry);
    return null;
  }

  // Whoever is logged in on this browser is who performed the action. For
  // staff, their own name and role replace any name passed in (e.g. the
  // finder's name on a found item), so "Performed By" is always the staff
  // member.
  const session = readSession();
  const isStaff = STAFF_ROLES.includes(session.role);

  const logEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    actor_name: (isStaff && session.name) || entry.actor_name || 'System',
    actor_role: isStaff ? session.role : entry.actor_role || '',
    performed_by_role: session.role || 'public',
    action: entry.action,
    target_title: entry.target_title || '',
    details: entry.details || '',
    created_at: new Date().toISOString(),
  };

  // Saved on the server. Only staff actions are kept there (the page only
  // shows those); the server takes the name and role from the login.
  if (isStaff) {
    serverFetch('activity/', { method: 'POST', body: JSON.stringify(logEntry) })
      .then(() => {
        // Tell any open Activity Logs page in THIS tab to refresh.
        window.dispatchEvent(new Event(ACTIVITY_LOG_UPDATE_EVENT));
      })
      .catch((error) => console.error('Could not save activity log:', error));
  }

  return logEntry;
}

/**
 * All activity logs from the server (newest first). Admin / Moderator only.
 * Also moves any logs an older version left in this browser.
 */
export async function getActivityLogs() {
  await migrateBrowserLogs();
  const data = await serverFetch('activity/');
  return Array.isArray(data) ? data : [];
}

// Older name, kept so existing imports keep working.
export const getActivityLogsLocal = getActivityLogs;

export function logUserRegistration(newUser) {
  return logActivity({
    actor_name: newUser.name || newUser.email || 'New User',
    actor_role: newUser.role || 'User',
    action: 'registered',
    target_title: newUser.email || newUser.name || 'User Account',
    details: `Registered account as ${newUser.role || 'User'}`,
  });
}