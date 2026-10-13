import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import SessionTimeoutModal from './SessionTimeoutModal';

// ==========================================================
// STAFF SESSION TIMEOUT (admin / moderator dashboard)
//
// Same rule as the public landing (PublicLanding.jsx): after 5 minutes
// with no mouse, keyboard, scroll or touch activity on /dashboard, a
// 30-second warning appears, then the admin/moderator is logged out and
// sent to the landing page with a "Session Expired" notice.
//
// Rendered once in App.jsx (inside the Router) so the expired notice
// stays on screen after the redirect to "/". Shares the
// localStorage "lastActivityAt" clock with PublicLanding.jsx, so it also
// works across tabs and after a reload.
// ==========================================================
const SESSION_TIMEOUT_MS = 5 * 60 * 1000;
const SESSION_WARNING_MS = 30 * 1000;
const LAST_ACTIVITY_KEY = 'lastActivityAt';
const STAFF_ROLES = ['admin', 'moderator'];
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

const StaffSessionGuard = () => {
  const { isLoggedIn, userRole, logout } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  const [secondsLeft, setSecondsLeft] = useState(null);
  const [expired, setExpired] = useState(false);
  const warningOpenRef = useRef(false);

  const onDashboard = location.pathname.startsWith('/dashboard');
  const active = isLoggedIn && STAFF_ROLES.includes(userRole) && onDashboard;

  const signOut = (showExpired) => {
    warningOpenRef.current = false;
    setSecondsLeft(null);
    if (showExpired) setExpired(true);
    logout();
    navigate('/', { replace: true });
  };

  const staySignedIn = () => {
    writeLastActivity();
    warningOpenRef.current = false;
    setSecondsLeft(null);
  };

  useEffect(() => {
    if (!active) {
      warningOpenRef.current = false;
      setSecondsLeft(null);
      return undefined;
    }

    if (!readLastActivity()) writeLastActivity();

    // Record activity (throttled). While the warning is open only the
    // "Stay signed in" button extends the session.
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
        signOut(true);
      } else if (idle >= SESSION_TIMEOUT_MS - SESSION_WARNING_MS) {
        warningOpenRef.current = true;
        setSecondsLeft(Math.ceil((SESSION_TIMEOUT_MS - idle) / 1000));
      } else if (warningOpenRef.current) {
        warningOpenRef.current = false; // another tab extended the session
        setSecondsLeft(null);
      }
    };

    // Logged out in another tab -> log out here too.
    const onStorage = (e) => {
      if (e.key === 'isLoggedIn' && !e.newValue) signOut(false);
    };

    check(); // catches a session that went stale while the page was closed
    const timer = setInterval(check, 1000);
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, onActivity, { passive: true, capture: true }));
    window.addEventListener('storage', onStorage);
    return () => {
      clearInterval(timer);
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, onActivity, { capture: true }));
      window.removeEventListener('storage', onStorage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const showWarning = active && secondsLeft !== null;
  const showExpired = expired && !isLoggedIn;

  return (
    <SessionTimeoutModal
      open={showWarning || showExpired}
      mode={showWarning ? 'warning' : 'expired'}
      secondsLeft={secondsLeft ?? 0}
      totalSeconds={SESSION_WARNING_MS / 1000}
      timeoutMinutes={SESSION_TIMEOUT_MS / 60000}
      onStay={staySignedIn}
      onLogout={() => signOut(false)}
      onClose={() => setExpired(false)}
      onLogin={() => {
        setExpired(false);
        // AppInner opens the login window when it sees this state.
        navigate('/', { replace: true, state: { openLogin: true } });
      }}
    />
  );
};

export default StaffSessionGuard;
