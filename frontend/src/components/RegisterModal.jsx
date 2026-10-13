import React, { useState, useEffect, useRef } from "react";
import { registerUser, verifyEmail, resendVerificationCode } from "../api/api";
import TermsConsentModal, { TERMS_VERSION } from "./TermsConsentModal";
import { useNavigate } from "react-router-dom";
import slcLogo from "../assets/slc-logo.png";
import saoLogo from "../assets/sao.png";
import { confirmAction } from "./ConfirmDialog";
import { sanitizeContactNumber, contactNumberError, CONTACT_NUMBER_LENGTH } from "../utils/contactNumber";

// School ID email rule: 1–8 digits only, followed by @slc-sflu.edu.ph
// e.g. 23100094@slc-sflu.edu.ph
const SCHOOL_EMAIL_REGEX = /^\d{1,8}@slc-sflu\.edu\.ph$/i;
const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

const RegisterModal = ({ onClose, onSwitchToLogin }) => {
  const navigate = useNavigate();

  // "form" = collecting name/email/contact, "verify" = entering the 6-digit code
  const [step, setStep] = useState("form");
  // Terms and Conditions / Data Privacy Consent must be accepted before the
  // registration form is shown (and is sent with the registration).
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [schoolEmail, setSchoolEmail] = useState("");
  const [contactNumber, setContactNumber] = useState("");

  const [verificationCode, setVerificationCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [cooldown, setCooldown] = useState(0);

  const [emailError, setEmailError] = useState("");
  const [contactError, setContactError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false); // form-submit / send-code
  const [verifying, setVerifying] = useState(false); // verify-code / register

  const codeInputRef = useRef(null);

  const validateSchoolEmail = (value) => {
    if (!value.trim()) {
      return "School ID email is required.";
    }
    if (!SCHOOL_EMAIL_REGEX.test(value.trim())) {
      return "Use your School ID email, e.g. 23100094@slc-sflu.edu.ph (numbers only, max 8 digits).";
    }
    return "";
  };

  // Optional field — only validated if the person actually typed something.
  const validateContactNumber = (value) => contactNumberError(value);

  const handleEmailChange = (e) => {
    const value = e.target.value;
    setSchoolEmail(value);
    if (emailError) {
      setEmailError(validateSchoolEmail(value));
    }
  };

  const handleEmailBlur = (e) => {
    setEmailError(validateSchoolEmail(e.target.value));
  };

  // Countdown for the "resend code" button.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  useEffect(() => {
    if (step === "verify") {
      codeInputRef.current?.focus();
    }
  }, [step]);

  const extractServerMessage = (err, fallback) => {
    const data = err?.response?.data;
    let serverMessage = data?.message || data?.error || data?.detail;

    if (!serverMessage && data && typeof data === "object") {
      const firstKey = Object.keys(data)[0];
      const firstVal = data[firstKey];
      if (firstKey) {
        serverMessage = Array.isArray(firstVal) ? firstVal[0] : firstVal;
        if (firstKey !== "email" && serverMessage) {
          serverMessage = `${firstKey}: ${serverMessage}`;
        }
      }
    }

    return serverMessage || fallback;
  };

  // STEP 1: validate the form, then ask the backend to email a 6-digit
  // verification code to the school address. The backend keeps the
  // account unverified (and hidden from Registered Users) until the
  // code is confirmed in step 2.
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const trimmedEmail = schoolEmail.trim();
    const trimmedContact = contactNumber.trim();

    const emailValidationError = validateSchoolEmail(trimmedEmail);
    if (emailValidationError) {
      setEmailError(emailValidationError);
      return;
    }

    const contactValidationError = validateContactNumber(trimmedContact);
    if (contactValidationError) {
      setContactError(contactValidationError);
      return;
    }

    if (!trimmedFirst || !trimmedLast) {
      setError("Please enter your first and last name.");
      return;
    }

    if (
      !(await confirmAction({
        message: `Register with ${trimmedEmail}? We'll email a 6-digit code to that address.`,
        confirmLabel: "Register",
      }))
    ) {
      return;
    }

    setLoading(true);
    try {
      const res = await registerUser({
        first_name: trimmedFirst,
        last_name: trimmedLast,
        email: trimmedEmail,
        contact_number: trimmedContact || undefined,
        agreed_to_terms: agreedToTerms,
        accepted_terms_version: TERMS_VERSION,
      });

      setStep("verify");
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setSuccess(
        res?.email_sent === false
          ? "We couldn't send the verification email. Try Resend code in a moment."
          : `We've sent a 6-digit code to ${trimmedEmail}.`
      );
    } catch (err) {
      console.error(err);
      setError(
        extractServerMessage(
          err,
          "Unable to start your registration. Please check your details and try again."
        )
      );
    } finally {
      setLoading(false);
    }
  };

  // STEP 2: confirm the code. On success the backend activates the
  // account and emails the real temporary password.
  const handleVerifySubmit = async (e) => {
    e.preventDefault();
    setCodeError("");
    setError("");
    setSuccess("");

    const trimmedCode = verificationCode.trim();
    if (!/^\d{6}$/.test(trimmedCode)) {
      setCodeError(`Enter the ${CODE_LENGTH}-digit code we sent to your email.`);
      return;
    }

    setVerifying(true);
    try {
      const res = await verifyEmail(schoolEmail.trim(), trimmedCode);

      const message =
        res?.email_sent === false
          ? "Email verified, but we couldn't send your temporary password. Please contact the Student Affairs Office."
          : "Email verified! We've emailed a temporary password to your school ID address. Use it to log in below.";

      // Hand off to the login form right away with the message. We
      // don't auto-login — the generated password is never known to
      // the frontend. Going straight to login also avoids flashing the
      // empty registration form again.
      goToLogin(message);
    } catch (err) {
      console.error(err);
      setCodeError(
        extractServerMessage(
          err,
          "That code didn't work. Please check it and try again, or resend a new one."
        )
      );
      setVerifying(false);
    }
  };

  const handleResendCode = async () => {
    if (cooldown > 0) return;
    setError("");
    setCodeError("");
    setLoading(true);
    try {
      // The backend always returns the same generic message here
      // (account enumeration precaution), so there's no email_sent
      // flag to key off — just confirm the resend and restart the
      // cooldown.
      await resendVerificationCode(schoolEmail.trim());
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setSuccess("If that account needs verification, a new code has been sent.");
    } catch (err) {
      console.error(err);
      setCodeError(extractServerMessage(err, "Couldn't resend the code. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const handleBackToForm = () => {
    setStep("form");
    setVerificationCode("");
    setCodeError("");
    setError("");
    setSuccess("");
  };

  // `message` is optional: passed after a successful verification so
  // LoginModal can show it on the login form.
  const goToLogin = (message) => {
    if (onSwitchToLogin) {
      onSwitchToLogin(typeof message === "string" ? message : undefined);
    } else {
      // No separate /login page: the public board opens the login form.
      navigate("/", { state: { openLogin: true, ...(message ? { message } : {}) } });
    }
  };

  const busy = loading || verifying;

  if (!agreedToTerms) {
    return (
      <TermsConsentModal
        onAgree={() => setAgreedToTerms(true)}
        // Declining goes back to the login form (or closes the window).
        onDecline={() => (onSwitchToLogin ? onSwitchToLogin() : onClose && onClose())}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-md p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy && onClose) onClose();
      }}
    >
      <div className="w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-[0_30px_80px_rgba(0,0,0,.25)] max-h-[90vh] overflow-y-auto">
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
                <h2 className="text-xl font-bold text-[#154B70]">
                  {step === "form" ? "Create Account" : "Verify Your Email"}
                </h2>
                <p className="text-gray-500 mt-1 text-sm">
                  {step === "form"
                    ? "Register using your SLC school ID."
                    : `Enter the ${CODE_LENGTH}-digit code sent to ${schoolEmail}.`}
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 font-medium">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 font-medium">
                {success}
              </div>
            )}

            {step === "form" ? (
              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[#154B70]">First Name</label>
                    <input
                      name="firstName"
                      type="text"
                      required
                      disabled={busy}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="Juan"
                      className="mt-1.5 w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm focus:border-[#0B648D] focus:ring-4 focus:ring-[#0B648D]/20 outline-none transition disabled:bg-gray-100"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#154B70]">Last Name</label>
                    <input
                      name="lastName"
                      type="text"
                      required
                      disabled={busy}
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Dela Cruz"
                      className="mt-1.5 w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm focus:border-[#0B648D] focus:ring-4 focus:ring-[#0B648D]/20 outline-none transition disabled:bg-gray-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#154B70]">School ID Email</label>
                  <input
                    name="schoolEmail"
                    type="email"
                    required
                    disabled={busy}
                    value={schoolEmail}
                    onChange={handleEmailChange}
                    onBlur={handleEmailBlur}
                    placeholder="e.g. 23100094@slc-sflu.edu.ph"
                    pattern="^\d{1,8}@slc-sflu\.edu\.ph$"
                    title="Use your School ID email, e.g. 23100094@slc-sflu.edu.ph"
                    className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition disabled:bg-gray-100 focus:ring-4 ${
                      emailError
                        ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                        : "border-gray-300 focus:border-[#0B648D] focus:ring-[#0B648D]/20"
                    }`}
                  />
                  {emailError ? (
                    <p className="mt-1 text-[11px] text-red-500">{emailError}</p>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-400">
                      Numbers only, max 8 digits, e.g. 23100094@slc-sflu.edu.ph
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#154B70]">
                    Contact Number <span className="text-slate-400 font-normal normal-case">(optional)</span>
                  </label>
                  <input
                    name="contactNumber"
                    type="tel"
                    inputMode="numeric"
                    maxLength={CONTACT_NUMBER_LENGTH}
                    disabled={busy}
                    value={contactNumber}
                    onChange={(e) => {
                      const value = sanitizeContactNumber(e.target.value);
                      setContactNumber(value);
                      if (contactError) setContactError(validateContactNumber(value));
                    }}
                    onBlur={(e) => setContactError(validateContactNumber(e.target.value))}
                    placeholder="e.g. 09123456789"
                    className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition disabled:bg-gray-100 focus:ring-4 ${
                      contactError
                        ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                        : "border-gray-300 focus:border-[#0B648D] focus:ring-[#0B648D]/20"
                    }`}
                  />
                  {contactError && (
                    <p className="mt-1 text-[11px] text-red-500">{contactError}</p>
                  )}
                </div>

                <p className="text-[11px] text-slate-400 -mt-1">
                  We'll first send a 6-digit code to confirm your email. Your account is
                  registered and your temporary password is emailed only after that code
                  is verified.
                </p>

                <button
                  type="submit"
                  disabled={busy}
                  className="mt-2 w-full rounded-xl bg-[#0B648D] py-2.5 text-sm font-semibold text-white transition hover:bg-[#094f70] active:scale-[.98] disabled:bg-slate-400 disabled:cursor-not-allowed shadow-md"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      Sending Code...
                    </span>
                  ) : (
                    "REGISTER"
                  )}
                </button>

                {onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={busy}
                    className="w-full rounded-xl border border-[#0B648D] py-2.5 text-sm font-medium text-[#0B648D] transition hover:bg-blue-50 disabled:opacity-50"
                  >
                    CANCEL
                  </button>
                )}

                <div className="text-center pt-3 border-t border-slate-200">
                  <p className="text-xs text-slate-500">Already have an account?</p>

                  <button
                    type="button"
                    onClick={() => goToLogin()}
                    className="mt-1.5 text-[#005B82] hover:text-[#004766] font-bold text-xs transition"
                  >
                    Login Here
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleVerifySubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-[#154B70]">
                    {CODE_LENGTH}-Digit Verification Code
                  </label>
                  <input
                    ref={codeInputRef}
                    name="verificationCode"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={CODE_LENGTH}
                    required
                    disabled={verifying}
                    value={verificationCode}
                    onChange={(e) => {
                      const digitsOnly = e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH);
                      setVerificationCode(digitsOnly);
                      if (codeError) setCodeError("");
                    }}
                    placeholder="123456"
                    className={`mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-center text-lg tracking-[0.5em] font-semibold outline-none transition disabled:bg-gray-100 focus:ring-4 ${
                      codeError
                        ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                        : "border-gray-300 focus:border-[#0B648D] focus:ring-[#0B648D]/20"
                    }`}
                  />
                  {codeError && <p className="mt-1 text-[11px] text-red-500">{codeError}</p>}
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <button
                    type="button"
                    onClick={handleBackToForm}
                    disabled={verifying}
                    className="font-semibold text-[#0B648D] hover:text-[#094f70] transition disabled:opacity-50"
                  >
                    ← Edit details
                  </button>

                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={busy || cooldown > 0}
                    className="font-semibold text-[#0B648D] hover:text-[#094f70] transition disabled:opacity-50 disabled:text-slate-400"
                  >
                    {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={verifying || verificationCode.length !== CODE_LENGTH}
                  className="mt-2 w-full rounded-xl bg-[#0B648D] py-2.5 text-sm font-semibold text-white transition hover:bg-[#094f70] active:scale-[.98] disabled:bg-slate-400 disabled:cursor-not-allowed shadow-md"
                >
                  {verifying ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      Verifying & Creating Account...
                    </span>
                  ) : (
                    "VERIFY & CREATE ACCOUNT"
                  )}
                </button>

                {onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={verifying}
                    className="w-full rounded-xl border border-[#0B648D] py-2.5 text-sm font-medium text-[#0B648D] transition hover:bg-blue-50 disabled:opacity-50"
                  >
                    CANCEL
                  </button>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterModal;
