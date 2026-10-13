import React, { useEffect, useRef, useState } from "react";
import { loginUser, getCurrentUser, logoutUser } from "../api/api";
import { useApp } from "../context/AppContext";
import { useNavigate } from "react-router-dom";
import slcLogo from "../assets/slc-logo.png";
import saoLogo from "../assets/sao.png";
import ChangePasswordModal from "./ChangePasswordModal";
import RegisterModal from "./RegisterModal";
import ForgotPasswordModal from "./ForgotPasswordModal";
import { FaEye, FaEyeSlash } from "react-icons/fa";

const LoginModal = ({ onClose }) => {
  const { setLogin } = useApp();
  const navigate = useNavigate();

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);
  const [showRegister, setShowRegister] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  // True when the login failed because the email isn't registered yet —
  // shows a "Register your account" button under the message.
  const [notRegistered, setNotRegistered] = useState(false);
  // Eye button on the password field: show / hide what was typed.
  const [showPassword, setShowPassword] = useState(false);

  // ----------------------------------------------------------
  // NO AUTOFILL (security)
  // The user must type their email and password every time (e.g.
  // after a session timeout). Browsers ignore autocomplete="off" on
  // login forms, so the fields also start read-only — browsers never
  // autofill read-only fields — and become editable once focused.
  // Anything the browser still managed to fill is cleared on open.
  // ----------------------------------------------------------
  // ----------------------------------------------------------
  // LOGIN LOCKOUT (backend login() in account/views.py)
  // 3 wrong passwords -> that ACCOUNT is locked for 10 minutes. Still
  // wrong on the 5th try -> locked again and a "Reset password" suggestion.
  // Locks are remembered PER EMAIL (localStorage "loginLocks"), so on a
  // shared computer one locked account never blocks anyone else: the
  // countdown only shows while that same email is typed.
  // ----------------------------------------------------------
  const LOCKS_KEY = "loginLocks";
  const emailKeyOf = (value) => String(value || "").trim().toLowerCase();
  const readLocks = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(LOCKS_KEY) || "{}");
      const nowMs = Date.now();
      const active = {};
      Object.entries(raw || {}).forEach(([k, v]) => {
        if (v && Number(v.until) > nowMs) active[k] = { until: Number(v.until), suggest: !!v.suggest };
      });
      return active;
    } catch {
      return {};
    }
  };
  const writeLocks = (next) => {
    try {
      localStorage.setItem(LOCKS_KEY, JSON.stringify(next));
      // Old single-lock keys from before locks were per email.
      localStorage.removeItem("loginLockUntil");
      localStorage.removeItem("loginSuggestReset");
    } catch {
      /* ignore */
    }
  };
  const [locks, setLocks] = useState(readLocks);
  const [typedEmail, setTypedEmail] = useState("");
  const [now, setNow] = useState(Date.now());
  // Shown after the server refused a login (e.g. expired temporary
  // password) for the email currently typed.
  const [resetHintFor, setResetHintFor] = useState("");

  const currentKey = emailKeyOf(typedEmail);
  const currentLock = locks[currentKey];
  const lockUntil = currentLock ? currentLock.until : 0;
  const locked = lockUntil > now;
  const suggestReset = (locked && !!currentLock?.suggest) || (resetHintFor && resetHintFor === currentKey);

  const hasLocks = Object.keys(locks).length > 0;
  useEffect(() => {
    if (!hasLocks) return undefined;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      setLocks((prev) => {
        const next = {};
        let changed = false;
        Object.entries(prev).forEach(([k, v]) => {
          if (v.until > n) next[k] = v;
          else changed = true;
        });
        if (!changed) return prev;
        writeLocks(next);
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLocks]);

  // Clear a lock message once its countdown is over.
  useEffect(() => {
    if (!locked && error && /locked|failed login attempts/i.test(error)) setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  const lockLeft = Math.max(0, Math.ceil((lockUntil - now) / 1000));
  const lockClock = `${Math.floor(lockLeft / 60)}:${String(lockLeft % 60).padStart(2, "0")}`;

  const applyLock = (email, secondsLeft, suggest) => {
    const key = emailKeyOf(email);
    if (!key) return;
    const until = Date.now() + Math.max(1, Number(secondsLeft) || 600) * 1000;
    setNow(Date.now());
    setLocks((prev) => {
      const next = { ...prev, [key]: { until, suggest: !!suggest } };
      writeLocks(next);
      return next;
    });
  };

  const clearLockState = (email) => {
    const key = emailKeyOf(email);
    setResetHintFor("");
    setLocks((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      writeLocks(next);
      return next;
    });
  };

  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const [emailLocked, setEmailLocked] = useState(true);
  const [passwordLocked, setPasswordLocked] = useState(true);

  useEffect(() => {
    const clear = () => {
      [emailRef.current, passwordRef.current].forEach((el) => {
        if (el && document.activeElement !== el) el.value = "";
      });
    };
    clear();
    const t1 = setTimeout(clear, 100);
    const t2 = setTimeout(clear, 500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // The password just typed, kept only in memory so "Change now" can use
  // it as the current password (the backend always asks for it).
  const [typedPassword, setTypedPassword] = useState("");

  // Staff (admin/moderator) go to the dashboard; everyone else to the
  // public landing page.
  const finishLogin = (userProfile) => {
    setTypedPassword("");
    setLogin(userProfile);
    const destination =
      userProfile.role === "admin" || userProfile.role === "moderator"
        ? "/dashboard"
        : "/";
    navigate(destination, { replace: true });
    if (onClose) onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (locked) return;

    const username = e.target.username.value.trim();
    const password = e.target.password.value.trim();
    setTypedEmail(username);

    setLoading(true);
    setError("");
    setSuccess("");
    setNotRegistered(false);

    try {
      // 1. Authenticate with server & receive tokens
      await loginUser(username, password);

      // 2. Retrieve user object
      const userProfile = await getCurrentUser();

      // Logged in: forget any earlier lockout for this email.
      clearLockState(username);

      // Still on the emailed temporary password: the user MUST change it
      // before using the system. The backend refuses every other request
      // until then, and a page refresh logs them out (AppContext), so this
      // step can't be skipped.
      if (userProfile.must_change_password) {
        setPendingUser(userProfile);
        setTypedPassword(password);
        setMustChangePassword(true);
        return;
      }

      finishLogin(userProfile);
    } catch (err) {
      console.error(err);

      // A displaced admin gets a specific, honest message instead of
      // the generic "invalid credentials" one below — see the
      // superseded_admin flag added by login() in views.py.
      if (err?.response?.data?.superseded_admin) {
        setError(
          "This admin account has been superseded by a newer admin account and can no longer log in. Contact the current administrator if this is unexpected."
        );
        return;
      }

      const data = err?.response?.data;

      // Server problem (not the user's details): say so plainly.
      if (!err?.response) {
        setError("Can't reach the server. Make sure the backend is running, then try again.");
        return;
      }
      if (err.response.status >= 500) {
        setError("The server had an error while logging in. Please try again in a moment, or contact the system administrator.");
        return;
      }

      // Too many wrong passwords: lock the form for 10 minutes.
      if (data?.locked) {
        applyLock(username, data.seconds_left, data.suggest_reset);
        setError(typeof data.error === "string" && data.error ? data.error : "Too many failed login attempts.");
        return;
      }

      // Temporary password older than its 7 days: point to Forgot password.
      if (data?.temp_password_expired) {
        setResetHintFor(emailKeyOf(username));
        setError(data.error);
        return;
      }

      // No account with this email: tell them to register first.
      if (data?.not_registered) {
        setNotRegistered(true);
        setError(
          typeof data.error === "string" && data.error
            ? data.error
            : "This account is not registered. Please register your account."
        );
        return;
      }

      // Show the server's own reason when it gives one (wrong password,
      // archived, inactive, email not verified...).
      if (typeof data?.error === "string" && data.error) {
        setError(data.error);
        return;
      }

      setError(
        "Invalid credentials, or this account may be inactive. Please double-check your details, or contact your system administrator if you believe this account was deactivated."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
  <>
    {showRegister ? (

      <RegisterModal
        onClose={onClose}
        // RegisterModal passes a message after a successful email
        // verification, e.g. "check your email for your temporary
        // password". Show it on the login form.
        onSwitchToLogin={(message) => {
          setShowRegister(false);
          setError("");
          if (typeof message === "string" && message) setSuccess(message);
        }}
      />

    ) : showForgotPassword ? (

      <ForgotPasswordModal
        onClose={onClose}
        onBackToLogin={() => setShowForgotPassword(false)}
        onSuccess={(message) => {
          // Back to the login form with a confirmation message.
          setShowForgotPassword(false);
          setError("");
          // A new password unlocks the account on the server too.
          setLocks({});
          writeLocks({});
          setResetHintFor("");
          setSuccess(message);
        }}
      />

    ) : (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-md p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading && !mustChangePassword && onClose) onClose();
      }}
    >
      {mustChangePassword && (
        <ChangePasswordModal
          mustChangePassword={true}
          currentPasswordValue={typedPassword}
          userRole={pendingUser?.role || "user"}
          onSuccess={() => {
            localStorage.removeItem("accessToken");
            localStorage.removeItem("refreshToken");
            setMustChangePassword(false);
            setPendingUser(null);
            setTypedPassword("");
            setSuccess("Password changed successfully. Please log in using your new password.");
          }}
          onCancel={async () => {
            // Log out without changing: the session ends on the server too,
            // and the temporary password is still required next time.
            await logoutUser();
            localStorage.removeItem("accessToken");
            localStorage.removeItem("refreshToken");
            setMustChangePassword(false);
            setPendingUser(null);
            setTypedPassword("");
            setError("");
            setSuccess("You have been logged out. You'll need to change your temporary password the next time you log in.");
          }}
        />
      )}

      <div className="w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-[0_30px_80px_rgba(0,0,0,.25)]">
        <div className="grid md:grid-cols-2">
          {/* BRANDING PANEL */}
          <div className="bg-gradient-to-br from-[#0B648D] to-[#155F87] text-white p-8 flex flex-col justify-center">
            <div className="flex justify-center gap-3 mb-5">
              <img
                src={slcLogo}
                alt="SLC Logo"
                className="w-12 h-12 object-contain bg-white rounded-full p-1 shadow-md"
              />
              <img
                src={saoLogo}
                alt="Seek & Balik Logo"
                className="w-12 h-12 object-contain bg-white rounded-full p-1 shadow-md"
              />
            </div>

            <h1 className="text-3xl font-serif leading-tight">Saint Louis College</h1>
            <p className="italic text-blue-100 mt-2 text-sm">City of San Fernando, La Union</p>
            <div className="w-full h-[2px] bg-white/40 my-5"></div>
            <h2 className="text-xl font-black tracking-widest">SEEK & BALIK</h2>
            <p className="text-blue-100 mt-2 text-sm">Lost and Found Management System</p>
          </div>

          {/* FORM PANEL */}
          <div className="p-8 flex flex-col justify-center">
            <div className="flex justify-between items-center mb-5">
              <div>
                <h2 className="text-xl font-bold text-[#154B70]">Welcome Back</h2>
                <p className="text-gray-500 mt-1 text-sm">Log in to your account.</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 font-medium">
                  {error}
                </div>
              )}

              {suggestReset && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-[#0B648D]/30 bg-[#0B648D]/5 px-3 py-2.5">
                  <p className="text-xs font-medium text-[#154B70]">
                    Can't remember your password? Reset it with a code sent to your email.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setSuccess("");
                      setShowForgotPassword(true);
                    }}
                    className="shrink-0 rounded-lg bg-[#0B648D] px-3 py-1.5 text-xs font-bold text-white transition hover:bg-[#094f70]"
                  >
                    Reset password
                  </button>
                </div>
              )}

              {success && (
                <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 font-medium">
                  {success}
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-[#154B70]">Email Address</label>
                <input
                  ref={emailRef}
                  name="username"
                  type="email"
                  required
                  disabled={loading}
                  onChange={(e) => setTypedEmail(e.target.value)}
                  autoComplete="off"
                  readOnly={emailLocked}
                  onFocus={() => setEmailLocked(false)}
                  placeholder="Enter your email"
                  className="mt-1.5 w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm focus:border-[#0B648D] focus:ring-4 focus:ring-[#0B648D]/20 outline-none transition disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[#154B70]">Password</label>
                <div className="relative mt-1.5">
                  <input
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    disabled={loading || locked}
                    placeholder="Enter your password"
                    ref={passwordRef}
                    autoComplete="new-password"
                    readOnly={passwordLocked}
                    onFocus={() => setPasswordLocked(false)}
                    className="w-full rounded-xl border border-gray-300 py-2.5 pl-3.5 pr-11 text-sm focus:border-[#0B648D] focus:ring-4 focus:ring-[#0B648D]/20 outline-none transition disabled:bg-gray-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    disabled={loading}
                    title={showPassword ? "Hide password" : "Show password"}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-400 transition hover:text-[#0B648D] disabled:opacity-50"
                  >
                    {showPassword ? <FaEyeSlash size={16} /> : <FaEye size={16} />}
                  </button>
                </div>

                <div className="mt-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setError("");
                      setSuccess("");
                      setShowForgotPassword(true);
                    }}
                    disabled={loading}
                    className="text-xs font-semibold text-[#0B648D] hover:text-[#094f70] transition disabled:opacity-50"
                  >
                    Forgot password?
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || locked}
                className="mt-2 w-full rounded-xl bg-[#0B648D] py-2.5 text-sm font-semibold text-white transition hover:bg-[#094f70] active:scale-[.98] disabled:bg-slate-400 disabled:cursor-not-allowed shadow-md"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Authenticating...
                  </span>
                ) : locked ? (
                  `LOCKED (${lockClock})`
                ) : (
                  "LOGIN"
                )}
              </button>

              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="w-full rounded-xl border border-[#0B648D] py-2.5 text-sm font-medium text-[#0B648D] transition hover:bg-blue-50 disabled:opacity-50"
                >
                  CANCEL
                </button>
              )}

              <div className="text-center pt-3 border-t border-slate-200">
                <p className="text-xs text-slate-500">
                  Don't have an account?
                </p>

                {/* Highlighted when the login failed because the email isn't
                    registered, pointing the user here instead of adding a
                    second Register button. */}
                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setNotRegistered(false);
                    setShowRegister(true);
                  }}
                  className={`mt-1.5 font-bold text-xs transition ${
                    notRegistered
                      ? "animate-pulse rounded-full bg-[#0B648D] px-5 py-1.5 text-white shadow-md ring-4 ring-[#0B648D]/20 hover:bg-[#094f70] hover:animate-none"
                      : "text-[#005B82] hover:text-[#004766]"
                  }`}
                >
                  {notRegistered ? "Register here" : "Register"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
        )}
  </>
  );
};

export default LoginModal;
