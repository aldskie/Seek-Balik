// hooks/UnreadNotifications.js
//
// One shared unread-notification count, so the bell on Home and the badge
// on the tab bar always show the same number.
import { useSyncExternalStore } from 'react';

import { getUnreadNotificationCount } from '../api/api';

let unreadCount = 0;
const listeners = new Set();

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => unreadCount;

// Sets the count directly (0 on logout, for example).
export function setUnreadCount(value) {
  const next = Math.max(0, Number(value) || 0);
  if (next === unreadCount) return;

  unreadCount = next;
  listeners.forEach((listener) => listener());
}

// Asks the backend for the latest count. A failed request (offline, logged
// out) keeps the last known number.
export async function refreshUnreadCount() {
  try {
    const response = await getUnreadNotificationCount();
    setUnreadCount(response?.unread);
  } catch (error) {
    // Keep the last known count.
  }
}

// Re-renders the component whenever the count changes.
export function useUnreadCount() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}