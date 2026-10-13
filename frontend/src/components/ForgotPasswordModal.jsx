import React, { useState, useEffect } from "react";
import { requestPasswordReset, verifyPasswordResetCode, confirmPasswordReset } from "../api/api";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import slcLogo from "../assets/slc-logo.png";
import saoLogo from "../assets/sao.png";

const RESEND_SECONDS = 60;
// Same rules as the backend (change_password / password_reset_confirm).
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 12;

// Pulls a readable message out of a DRF-style error response, falling
// back to a generic message if the shape is unexpected.
const getErrorMessage = (err, fallback) => {
  const data = err?.response?.data;
  if (!data || typeof data !== "object") return fallback;

  if (typeof data.detail === "string") return data.detail;
  if (typeof data.error === "string") return data.error;
  if (typeof data.message === "string") return data.message;

  const first = Object.values(data)[0];
  if (Array.isArray(first) && typeof first[0] === "string") return first[0];
  if (typeof first === "string") return first;

  return fallback;
};

const inputClass =
  "mt-1.5 w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm focus:border-[#0B648D] focus:ring-4 focus:ring-[#0B648D]/20 outline-none transition disabled:bg-gray-100";

const ForgotPasswordModal = ({ onClose, onBackToLogin, onSuccess }) => {
  // "email"    -> ask for the account email and send a code
  // "code"     -> enter the 6-digit code (checked with the server)
  // "password" -> only after the code is verified: choose a new password
  const [step, setStep] = useState("email");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [cooldown, setCooldown] = useState(0);

  // Counts the resend timer down once per second.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Shared by the first send and by "Resend code". Returns true on success.
  const sendCode = async () => {
    const trimmedEmail = email.trim();

    setLoading(true);
    setError("");
    setInfo("");

    try {
      await requestPasswordReset(trimmedEmail);
      // Same wording whether or not the account exists, so this screen
      // can't be used to find out which emails are registered.
      setInfo(
        `If an account exists for ${trimmedEmail}, a 6-digit code has been sent. It may take a minute to arrive and expires in 10 minutes.`
      );
      setCooldown(RESEND_SECONDS);
      return true;
    } catch (err) {
      console.error(err);
      setError(
        getErrorMessage(err, "We couldn't send the code. Please try again in a moment.")
      );
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleRequest = async (e) => {
    e.preventDefault();
    const ok = await sendCode();
    if (ok) setStep("code");
  };

  // Step 2: check the code before showing the password fields.
  const handleVerifyCode = async (e) => {
    e.preventDefault();

    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await verifyPasswordResetCode(email.trim(), code);
      setInfo("Code verified. You can now choose a new password.");
      setStep("password");
    } catch (err) {
      console.error(err);
      setError(
        getErrorMessage(err, "That code is invalid or has expired. Please request a new one.")
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || loading) return;
    await sendCode();
  };

  const handleReset = async (e) => {
    e.preventDefault();

    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    if (
      newPassword.length < MIN_PASSWORD_LENGTH ||
      newPassword.length > MAX_PASSWORD_LENGTH
    ) {
      setError(
        `Your new password must be ${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters long.`
      );
      return;
    }
    if (/\s/.test(newPassword)) {
      setError("Your new password must not contain spaces.");
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setError("Your new password must contain at least one capital letter.");
      return;
    }
    if (!/[^A-Za-z0-9\s]/.test(newPassword)) {
      setError("Your new password must contain at least one special character (e.g. ! @ # $ %).");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The passwords don't match.");
      return;
    }

    setLoading(true);
    setError("");
    setInfo("");

    try {
      await confirmPasswordReset(email.trim(), code, newPassword);
      if (onSuccess) {
        onSuccess("Password changed successfully. Please log in using your new password.");
      }
    } catch (err) {
      console.error(err);
      const message = getErrorMessage(
        err,
        "That code is invalid or has expired. Please request a new one."
      );
      setError(message);
      // The code stopped working (expired / too many tries): go back to
      // the code step so a new one can be requested.
      if (/code/i.test(message)) {
        setCode("");
        setStep("code");
      }
    } finally {
      setLoading(false);
    }
  };

  const useDifferentEmail = () => {
    setStep("email");
    setCode("");
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    setInfo("");
    setCooldown(0);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-md p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading && onClose) onClose();
      }}
    >
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
            <div className="mb-5">
              <h2 className="text-xl font-bold text-[#154B70]">
                {step === "email"
                  ? "Forgot Password"
                  : step === "code"
                  ? "Verify Code"
                  : "Reset Password"}
              </h2>
              <p className="text-gray-500 mt-1 text-sm">
                {step === "email"
                  ? "Enter your email and we'll send you a 6-digit code."
                  : step === "code"
                  ? "Enter the 6-digit code we sent to your email."
                  : "Choose a new password for your account."}
              </p>

              {step !== "email" && (
                <div className="mt-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide">
                  <span className={step === "code" ? "text-[#0B648D]" : "text-emerald-600"}>
                    {step === "code" ? "1. Verify code" : "✓ Code verified"}
                  </span>
                  <span className="h-px flex-1 bg-slate-200" />
                  <span className={step === "password" ? "text-[#0B648D]" : "text-slate-400"}>
                    2. New password
                  </span>
                </div>
              )}
            </div>

            {step === "email" ? (
              <form onSubmit={handleRequest} className="space-y-4">
                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 font-medium">
                    {error}
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-[#154B70]">Email Address</label>
                  <input
                    name="email"
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    disabled={loading}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    className={inputClass}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 w-full rounded-xl bg-[#0B648D] py-2.5 text-sm font-semibold text-white transition hover:bg-[#094f70] active:scale-[.98] disabled:bg-slate-400 disabled:cursor-not-allowed shadow-md"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      Sending code...
                    </span>
                  ) : (
                    "SEND CODE"
                  )}
                </button>

                <button
                  type="button"
                  onClick={onBackToLogin}
                  disabled={loading}
                  className="w-full rounded-xl border border-[#0B648D] py-2.5 text-sm font-medium text-[#0B648D] transition hover:bg-blue-50 disabled:opacity-50"
                >
                  BACK TO LOGIN
                </button>
              </form>
            ) : step === "code" ? (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 font-medium">
                    {error}
                  </div>
                )}

                {info && (
                  <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 font-medium">
                    {info}
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-[#154B70]">6-digit Code</label>
                  <input
                    name="code"
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    required
                    autoFocus
                    autoComplete="one-time-code"
                    disabled={loading}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="Enter the code"
                    className={`${inputClass} tracking-[0.4em]`}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="mt-2 w-full rounded-xl bg-[#0B648D] py-2.5 text-sm font-semibold text-white transition hover:bg-[#094f70] active:scale-[.98] disabled:bg-slate-400 disabled:cursor-not-allowed shadow-md"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      Verifying...
                    </span>
                  ) : (
                    "VERIFY CODE"
                  )}
                </button>

                <div className="flex items-center justify-between text-xs">
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={loading || cooldown > 0}
                    className="font-semibold text-[#0B648D] hover:text-[#094f70] transition disabled:text-slate-400 disabled:cursor-not-allowed"
                  >
                    {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
                  </button>

                  <button
                    type="button"
                    onClick={useDifferentEmail}
                    disabled={loading}
                    className="font-semibold text-slate-500 hover:text-slate-700 transition disabled:opacity-50"
                  >
                    Use a different email
                  </button>
                </div>

                <button
                  type="button"
                  onClick={onBackToLogin}
                  disabled={loading}
                  className="w-full rounded-xl border border-[#0B648D] py-2.5 text-sm font-medium text-[#0B648D] transition hover:bg-blue-50 disabled:opacity-50"
                >
                  BACK TO LOGIN
                </button>
              </form>
            ) : (
              <form onSubmit={handleReset} className="space-y-4">
                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 font-medium">
                    {error}
                  </div>
                )}

                {info && (
                  <div className="rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 font-medium">
                    {info}
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-[#154B70]">New Password</label>
                  <div className="relative">
                    <input
                      name="newPassword"
                      type={showNewPassword ? "text" : "password"}
                      required
                      autoFocus
                      minLength={MIN_PASSWORD_LENGTH}
                      maxLength={MAX_PASSWORD_LENGTH}
                      autoComplete="new-password"
                      disabled={loading}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={`${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} chars, 1 capital, 1 special character`}
                      className={`${inputClass} pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((v) => !v)}
                      title={showNewPassword ? "Hide password" : "Show password"}
                      aria-label={showNewPassword ? "Hide password" : "Show password"}
                      className="absolute right-0 top-1.5 bottom-0 flex w-11 items-center justify-center text-slate-400 transition hover:text-[#0B648D]"
                    >
                      {showNewPassword ? <FaEyeSlash size={16} /> : <FaEye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#154B70]">Confirm New Password</label>
                  <div className="relative">
                    <input
                      name="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      required
                      autoComplete="new-password"
                      disabled={loading}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your new password"
                      className={`${inputClass} pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      title={showConfirmPassword ? "Hide password" : "Show password"}
                      aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                      className="absolute right-0 top-1.5 bottom-0 flex w-11 items-center justify-center text-slate-400 transition hover:text-[#0B648D]"
                    >
                      {showConfirmPassword ? <FaEyeSlash size={16} /> : <FaEye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="mt-2 w-full rounded-xl bg-[#0B648D] py-2.5 text-sm font-semibold text-white transition hover:bg-[#094f70] active:scale-[.98] disabled:bg-slate-400 disabled:cursor-not-allowed shadow-md"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      Resetting...
                    </span>
                  ) : (
                    "RESET PASSWORD"
                  )}
                </button>

                <button
                  type="button"
                  onClick={onBackToLogin}
                  disabled={loading}
                  className="w-full rounded-xl border border-[#0B648D] py-2.5 text-sm font-medium text-[#0B648D] transition hover:bg-blue-50 disabled:opacity-50"
                >
                  BACK TO LOGIN
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordModal;
