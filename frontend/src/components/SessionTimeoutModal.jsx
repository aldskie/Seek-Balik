import React, { useEffect, useRef, useState } from 'react';
import { FaClock, FaLock, FaSignOutAlt, FaSignInAlt } from 'react-icons/fa';

// ==========================================================
// SESSION TIMEOUT MODAL
//
// mode="warning" -> "Are you still there?" with a countdown ring and
//                   Stay signed in / Log out buttons.
// mode="expired" -> "Session expired" with Close / Log in again buttons.
//
// Used by PublicLanding.jsx (5-minute inactivity logout).
// ==========================================================
const RING_SIZE = 120;
const RING_STROKE = 10;
const RADIUS = (RING_SIZE - RING_STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const SessionTimeoutModal = ({
  open,
  mode = 'warning',
  secondsLeft = 0,
  totalSeconds = 30,
  timeoutMinutes = 5,
  onStay,
  onLogout,
  onClose,
  onLogin,
  autoCloseSeconds = 10,
}) => {
  const primaryRef = useRef(null);

  // The "Session Expired" notice closes by itself after
  // autoCloseSeconds if the user doesn't click anything.
  const [closeIn, setCloseIn] = useState(autoCloseSeconds);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open || mode !== 'expired') return undefined;
    setCloseIn(autoCloseSeconds);
    const started = Date.now();
    const timer = setInterval(() => {
      const left = autoCloseSeconds - Math.floor((Date.now() - started) / 1000);
      if (left <= 0) {
        clearInterval(timer);
        onCloseRef.current && onCloseRef.current();
      } else {
        setCloseIn(left);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [open, mode, autoCloseSeconds]);

  // Focus the main button so Enter keeps the session / logs in again.
  useEffect(() => {
    if (open) primaryRef.current?.focus();
  }, [open, mode]);

  if (!open) return null;

  const isWarning = mode === 'warning';
  const fraction = Math.max(0, Math.min(1, secondsLeft / totalSeconds));
  const urgent = secondsLeft <= 10;
  const ringColor = urgent ? '#DC2626' : '#F59E0B';

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-timeout-title"
    >
      <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Header band */}
        <div className={`h-2 w-full ${isWarning ? (urgent ? 'bg-red-500' : 'bg-amber-400') : 'bg-[#2D366D]'}`} />

        <div className="px-6 pt-6 pb-5 text-center">
          {isWarning ? (
            <div className="relative mx-auto mb-4" style={{ width: RING_SIZE, height: RING_SIZE }}>
              <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90">
                <circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  stroke="#E2E8F0"
                  strokeWidth={RING_STROKE}
                />
                <circle
                  cx={RING_SIZE / 2}
                  cy={RING_SIZE / 2}
                  r={RADIUS}
                  fill="none"
                  stroke={ringColor}
                  strokeWidth={RING_STROKE}
                  strokeLinecap="round"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
                  style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-3xl font-extrabold ${urgent ? 'text-red-600' : 'text-amber-600'}`}>
                  {secondsLeft}
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">seconds</span>
              </div>
            </div>
          ) : (
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-[#2D366D]/10 text-[#2D366D]">
              <FaLock size={34} />
            </div>
          )}

          <h3 id="session-timeout-title" className="flex items-center justify-center gap-2 text-xl font-bold text-[#2D366D]">
            {isWarning && <FaClock className={urgent ? 'text-red-500' : 'text-amber-500'} />}
            {isWarning ? 'Are you still there?' : 'Session Expired'}
          </h3>

          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {isWarning ? (
              <>
                You've been inactive for a while. For your account's security, you will be
                logged out automatically when the timer runs out.
              </>
            ) : (
              <>
                You were logged out after <span className="font-semibold">{timeoutMinutes} minutes</span> of
                inactivity to keep your account secure. Please log in again to continue.
              </>
            )}
          </p>

          {!isWarning && (
            <p className="mt-3 text-xs font-medium text-slate-400">
              This message will close in {closeIn} second{closeIn === 1 ? '' : 's'}.
            </p>
          )}
        </div>

        <div className="flex gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          {isWarning ? (
            <>
              <button
                onClick={onLogout}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                <FaSignOutAlt /> Log out
              </button>
              <button
                ref={primaryRef}
                onClick={onStay}
                className="flex-1 rounded-xl bg-[#2D366D] px-4 py-2.5 font-semibold text-white transition hover:bg-[#1E2755]"
              >
                Stay signed in
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-semibold text-slate-600 transition hover:bg-slate-100"
              >
                Close ({closeIn})
              </button>
              <button
                ref={primaryRef}
                onClick={onLogin}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#2D366D] px-4 py-2.5 font-semibold text-white transition hover:bg-[#1E2755]"
              >
                <FaSignInAlt /> Log in again
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default SessionTimeoutModal;
