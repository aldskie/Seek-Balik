import React, { useEffect, useState } from 'react';
import {
  User,
  KeyRound,
  Pencil,
  Save,
  X,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getProfile, updateProfile, changePassword } from '../api/api';
import { confirmAction } from "./ConfirmDialog";
import { sanitizeContactNumber, toLocalContactNumber, contactNumberError, CONTACT_NUMBER_LENGTH } from '../utils/contactNumber';

/**
 * ─── UserProfile ────────────────────────────────────────────────────────
 * Self-service profile page for the logged-in staff user.
 *
 *   1. Profile details — first/last name, contact number (11 digits)
 *      and email (email is read-only).
 *   2. Change Password — inline (expands in place). Two-step flow
 *      (form -> "are you sure?" -> submit), same validation rules
 *      (8-12 chars, 1 capital letter, 1 special character, no spaces, match check), and the same
 *      changePassword(currentPassword, newPassword) API call.
 *   3. Log Out — a single row at the bottom of the page with an inline
 *      "are you sure?" confirmation, to avoid an accidental
 *      single-click sign-out. (There is no second Log Out button in
 *      the header.)
 *
 * Layout note: every row uses flex-wrap / auto-fit grids instead of
 * fixed breakpoints, so the page reflows cleanly when the browser is
 * zoomed in (which shrinks the CSS viewport) rather than overflowing.
 *
 * Expects three functions exported from ../api/api:
 *   - getProfile()                          -> GET  current user's profile
 *   - updateProfile(payload)                -> PATCH/PUT profile fields
 *   - changePassword(current, next)         -> POST change password
 *
 * ASSUMPTION: AppContext's useApp() exposes a `logout` function. If it
 * doesn't, handleLogoutConfirm falls back to clearing common
 * localStorage auth-token keys and resetting currentUser.
 */

const EMPTY_PROFILE = {
  first_name: '',
  last_name: '',
  email: '',
  contact_number: '',
};

const EMPTY_PASSWORD_FORM = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

const inputClass =
  'h-10 w-full min-w-0 rounded-xl border border-slate-300 px-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#1478a7] disabled:bg-slate-100 disabled:text-slate-500';
const labelClass = 'mb-1 block text-xs font-bold uppercase text-slate-700';

// Two columns when there's room, one column when there isn't. Driven by
// available width (not viewport breakpoints), so it also adapts when the
// page is zoomed in.
const fitGrid = 'grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3';

// Wrapping button row: buttons share the row when it fits and stack when
// it doesn't.
const btnRow = 'flex flex-wrap items-stretch gap-3';
const btnFlex = 'min-w-[8rem] flex-1';

// Log out row buttons.
const logoutBtnBase =
  'inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-60';
const logoutBtn = `${logoutBtnBase} border border-red-200 bg-white font-medium text-red-600 hover:bg-red-50`;
const logoutCancelBtn = `${logoutBtnBase} border border-slate-300 bg-white font-medium text-slate-700 hover:bg-slate-50`;
const logoutConfirmBtn = `${logoutBtnBase} bg-red-600 text-white hover:bg-red-700`;

// Small inline banner used for profile feedback.
const Banner = ({ tone, message, onDismiss }) => {
  if (!message) return null;
  const isSuccess = tone === 'success';
  return (
    <div
      className={`mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${
        isSuccess
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-red-200 bg-red-50 text-red-600'
      }`}
    >
      {isSuccess ? (
        <CheckCircle size={16} className="mt-0.5 shrink-0" />
      ) : (
        <AlertCircle size={16} className="mt-0.5 shrink-0" />
      )}
      <span className="min-w-0 flex-1 break-words">{message}</span>
      <button type="button" onClick={onDismiss} className="shrink-0 opacity-60 hover:opacity-100">
        <X size={14} />
      </button>
    </div>
  );
};

// Show/hide password field.
const PasswordField = ({ label, name, value, onChange, show, toggleShow, disabled }) => (
  <div className="min-w-0">
    <label className={labelClass}>{label}</label>
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`${inputClass} pr-11`}
      />
      <button
        type="button"
        onClick={toggleShow}
        disabled={disabled}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 disabled:opacity-40"
        tabIndex={-1}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  </div>
);

// Initials badge shown in the header card; falls back to the User icon
// when there isn't enough of a name to derive initials from.
const InitialsAvatar = ({ firstName, lastName }) => {
  const initials = `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 text-base font-black tracking-wide text-white ring-2 ring-white/25 sm:h-14 sm:w-14 sm:text-lg">
      {initials || <User size={24} />}
    </div>
  );
};

const UserProfile = () => {
  const { setCurrentUser, logout } = useApp();

  // Older accounts may have +63 / 9xxxxxxxxx formats stored; show them
  // in the 11-digit 09xxxxxxxxx form.
  const normalizeProfile = (data) => ({
    ...EMPTY_PROFILE,
    ...data,
    contact_number: toLocalContactNumber(data?.contact_number),
  });

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [editMode, setEditMode] = useState(false);
  const [profileForm, setProfileForm] = useState(EMPTY_PROFILE);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileBanner, setProfileBanner] = useState(null); // { tone, message }

  // Inline change-password section state.
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [passwordForm, setPasswordForm] = useState(EMPTY_PASSWORD_FORM);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordConfirmStep, setPasswordConfirmStep] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Inline log-out state — two-step "click -> confirm".
  const [logoutConfirmStep, setLogoutConfirmStep] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    setLoading(true);
    try {
      const data = await getProfile();
      const normalized = normalizeProfile(data);
      setProfile(normalized);
      setProfileForm(normalized);
    } catch (error) {
      console.error('Error fetching profile:', error);
      setProfileBanner({ tone: 'error', message: 'Could not load your profile. Try refreshing the page.' });
    } finally {
      setLoading(false);
    }
  }

  const setField = (key, value) => setProfileForm((prev) => ({ ...prev, [key]: value }));

  const startEdit = () => {
    setProfileForm(profile);
    setProfileBanner(null);
    setEditMode(true);
  };

  const cancelEdit = () => {
    setProfileForm(profile);
    setEditMode(false);
    setProfileBanner(null);
  };

  async function handleSaveProfile(e) {
    e.preventDefault();
    if (savingProfile) return;

    if (!profileForm.first_name?.trim()) {
      setProfileBanner({ tone: 'error', message: 'First name is required.' });
      return;
    }
    if (!profileForm.last_name?.trim()) {
      setProfileBanner({ tone: 'error', message: 'Last name is required.' });
      return;
    }
    const contactError = contactNumberError(profileForm.contact_number);
    if (contactError) {
      setProfileBanner({ tone: 'error', message: contactError });
      return;
    }

    if (
      !(await confirmAction({
        message: 'Save the changes to your profile?',
        confirmLabel: 'Save Changes',
      }))
    ) {
      return;
    }

    setSavingProfile(true);
    setProfileBanner(null);
    try {
      const payload = {
        first_name: profileForm.first_name.trim(),
        last_name: profileForm.last_name.trim(),
        contact_number: (profileForm.contact_number || '').trim(),
      };
      const updated = await updateProfile(payload);
      const normalized = normalizeProfile({ ...profile, ...profileForm, ...updated });

      // Keep the logged-in user in sync so other screens (e.g. the Claim
      // modal, which pre-fills the contact number) see the new value.
      setCurrentUser?.((prev) =>
        prev && typeof prev === 'object'
          ? { ...prev, first_name: normalized.first_name, last_name: normalized.last_name, contact_number: normalized.contact_number }
          : prev
      );
      setProfile(normalized);
      setProfileForm(normalized);
      setEditMode(false);
      setProfileBanner({ tone: 'success', message: 'Profile updated successfully.' });
    } catch (error) {
      console.error('Error updating profile:', error);
      const data = error.response?.data;
      const msg =
        data?.detail ||
        (Array.isArray(data?.contact_number) ? data.contact_number[0] : data?.contact_number) ||
        'Failed to update profile. Please try again.';
      setProfileBanner({ tone: 'error', message: msg });
    } finally {
      setSavingProfile(false);
    }
  }

  // ── Change password (inline) ──────────────────────────────────────

  const openPasswordSection = () => {
    setPasswordForm(EMPTY_PASSWORD_FORM);
    setPasswordError('');
    setPasswordConfirmStep(false);
    setShowPasswordSection(true);
  };

  const closePasswordSection = () => {
    setShowPasswordSection(false);
    setPasswordConfirmStep(false);
    setPasswordForm(EMPTY_PASSWORD_FORM);
    setPasswordError('');
  };

  const handlePasswordFieldChange = (e) => {
    setPasswordForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setPasswordError('');
  };

  // Step 1 -> validate, then advance to the "are you sure?" step.
  const handlePasswordFormSubmit = (e) => {
    e.preventDefault();
    setPasswordError('');

    if (passwordForm.newPassword.length < 8 || passwordForm.newPassword.length > 12) {
      setPasswordError('Password must be 8 to 12 characters long.');
      return;
    }
    if (/\s/.test(passwordForm.newPassword)) {
      setPasswordError('Password must not contain spaces.');
      return;
    }
    if (!/[A-Z]/.test(passwordForm.newPassword)) {
      setPasswordError('Password must contain at least one capital letter.');
      return;
    }
    if (!/[^A-Za-z0-9\s]/.test(passwordForm.newPassword)) {
      setPasswordError('Password must contain at least one special character (e.g. ! @ # $ %).');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match!');
      return;
    }

    setPasswordConfirmStep(true);
  };

  // Step 2 -> user confirmed. Submit, then redirect to login since the
  // user needs to sign back in with the new password.
  const handlePasswordConfirm = async () => {
    setChangingPassword(true);
    setPasswordError('');
    try {
      await changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      // Sign out and open the login form so they sign in with the new
      // password ("/?login=1" is picked up by pages/AppInner.jsx; there is
      // no separate /login page).
      try {
        if (typeof logout === 'function') logout();
      } catch (_) { /* still redirect */ }
      window.location.href = '/?login=1';
    } catch (error) {
      const apiError =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message ||
        'Failed to change password.';
      setPasswordError(apiError);
      setPasswordConfirmStep(false);
    } finally {
      setChangingPassword(false);
    }
  };

  // ── Log out (inline) ──────────────────────────────────────────────

  const openLogoutConfirm = () => setLogoutConfirmStep(true);
  const cancelLogout = () => setLogoutConfirmStep(false);

  async function handleLogoutConfirm() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      if (typeof logout === 'function') {
        await logout();
      } else {
        ['token', 'authToken', 'access_token', 'accessToken'].forEach((key) =>
          localStorage.removeItem(key)
        );
        setCurrentUser?.(null);
      }
    } catch (error) {
      console.error('Error logging out:', error);
      // Even if a server-side logout call fails, still leave the account
      // page — staying "logged in" on a failed logout is worse.
    } finally {
      // Back to the public board, logged out (there is no /login page).
      window.location.href = '/';
    }
  }

  const displayName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Your Profile';

  return (
    // Fits the screen: identity + log out on the left, the details OR
    // the password form on the right (one at a time), so nothing needs
    // scrolling on a laptop/desktop. Narrow phone screens still scroll.
    <div className="mx-auto grid h-full min-h-0 w-full max-w-5xl grid-cols-1 content-start gap-4 overflow-y-auto overflow-x-hidden p-3 lg:grid-cols-[280px_minmax(0,1fr)] lg:overflow-hidden lg:p-4">
      <div className="flex min-h-0 flex-col gap-4">
          {/* Header card */}
          <div className="shrink-0 overflow-hidden rounded-[18px] border border-[#D8E2EF] bg-white shadow-[0_8px_24px_rgba(45,54,109,0.08)]">
            <div className="flex flex-col items-center gap-3 bg-gradient-to-r from-[#0B648D] to-[#155F87] px-4 py-6 text-center text-white">
              <InitialsAvatar firstName={profile.first_name} lastName={profile.last_name} />
              <div className="min-w-0">
                <h3 className="break-words text-base font-bold leading-tight sm:text-lg">{displayName}</h3>
                {profile.email && (
                  <p className="mt-0.5 break-all text-xs text-white/90 sm:text-sm">{profile.email}</p>
                )}
              </div>
            </div>
          </div>
          {/* Log out — one button, with an inline confirmation right below it. */}
          <div className="shrink-0 rounded-[18px] border border-[#D8E2EF] bg-white p-4 shadow-[0_8px_24px_rgba(45,54,109,0.08)] sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-[10rem] flex-1">
                <h4 className="text-sm font-semibold text-[#071E3D]">Log out</h4>
                <p className="mt-0.5 text-xs text-slate-500">Sign out of your account on this device.</p>
              </div>

              {!logoutConfirmStep && (
                <button type="button" onClick={openLogoutConfirm} className={logoutBtn}>
                  Log out
                </button>
              )}
            </div>

            {logoutConfirmStep && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-red-50 px-4 py-3">
                <p className="min-w-[12rem] flex-1 text-sm text-red-700">
                  You'll need to sign back in to access the dashboard again.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={loggingOut}
                    onClick={cancelLogout}
                    className={logoutCancelBtn}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={loggingOut}
                    onClick={handleLogoutConfirm}
                    className={logoutConfirmBtn}
                  >
                    {loggingOut ? 'Logging out…' : 'Yes, log out'}
                  </button>
                </div>
              </div>
            )}
          </div>
      </div>

      <div className="flex min-h-0 flex-col gap-4">
        {!showPasswordSection && (
          <>
              {/* Profile details */}
              <div className="shrink-0 rounded-[18px] border border-[#D8E2EF] bg-white p-4 shadow-[0_8px_24px_rgba(45,54,109,0.08)] sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-[10rem] flex-1">
                    <h4 className="text-sm font-black uppercase tracking-[0.12em] text-[#071E3D]">Profile Details</h4>
                    <p className="mt-0.5 text-xs italic text-[#7B8AA6]">Your name, contact number and email</p>
                  </div>
                  {!editMode && (
                    <button
                      type="button"
                      onClick={startEdit}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#2D366D] px-4 py-2 text-xs font-black uppercase tracking-wide text-white shadow-[0_6px_14px_rgba(45,54,109,0.25)] transition-all hover:bg-[#24305C]"
                    >
                      <Pencil size={14} /> Edit Profile
                    </button>
                  )}
                </div>

                <Banner tone={profileBanner?.tone} message={profileBanner?.message} onDismiss={() => setProfileBanner(null)} />

                {loading ? (
                  <p className="py-6 text-center text-sm font-medium text-[#7B8AA6]">Loading profile…</p>
                ) : (
                  <form onSubmit={handleSaveProfile} className="space-y-3">
                    <div className={fitGrid}>
                      <div className="min-w-0">
                        <label className={labelClass}>First Name *</label>
                        <input
                          className={inputClass}
                          value={profileForm.first_name || ''}
                          onChange={(e) => setField('first_name', e.target.value)}
                          disabled={!editMode}
                          placeholder="First name"
                        />
                      </div>
                      <div className="min-w-0">
                        <label className={labelClass}>Last Name *</label>
                        <input
                          className={inputClass}
                          value={profileForm.last_name || ''}
                          onChange={(e) => setField('last_name', e.target.value)}
                          disabled={!editMode}
                          placeholder="Last name"
                        />
                      </div>
                    </div>

                    <div className="min-w-0">
                      <label className={labelClass}>Contact Number</label>
                      <input
                        className={inputClass}
                        type="tel"
                        inputMode="numeric"
                        maxLength={CONTACT_NUMBER_LENGTH}
                        value={profileForm.contact_number || ''}
                        onChange={(e) => setField('contact_number', sanitizeContactNumber(e.target.value))}
                        disabled={!editMode}
                        placeholder="09123456789"
                      />
                      {editMode && (
                        <p className="mt-1 text-xs font-medium text-slate-400">
                          11 digits, numbers only (e.g. 09123456789).
                        </p>
                      )}
                    </div>

                    <div className="min-w-0">
                      <label className={labelClass}>Email</label>
                      <input
                        className={inputClass}
                        value={profileForm.email || ''}
                        disabled
                        placeholder="you@example.com"
                      />
                      <p className="mt-1 text-xs font-medium text-slate-400">
                        Email can't be changed here — contact an administrator if this needs to update.
                      </p>
                    </div>

                    {editMode && (
                      <div className={`${btnRow} pt-2`}>
                        <button
                          type="submit"
                          disabled={savingProfile}
                          className={`${btnFlex} flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#384388] to-[#2D366D] px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white hover:shadow-lg active:scale-[0.98] disabled:opacity-60`}
                        >
                          <Save size={15} /> {savingProfile ? 'Saving…' : 'Save Changes'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className={`${btnFlex} min-h-12 rounded-xl bg-slate-200 px-4 text-sm font-black uppercase text-slate-500 hover:bg-slate-300`}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </form>
                )}
              </div>
          </>
        )}
          {/* Change password — inline section, expands in place */}
          <div className="shrink-0 rounded-[18px] border border-[#D8E2EF] bg-white p-4 shadow-[0_8px_24px_rgba(45,54,109,0.08)] sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-[10rem] flex-1 items-center gap-2">
                <KeyRound size={18} className="shrink-0 text-[#0B6B8A]" />
                <div className="min-w-0">
                  <h4 className="text-sm font-black uppercase tracking-[0.12em] text-[#071E3D]">Password</h4>
                  <p className="mt-0.5 text-xs italic text-[#7B8AA6]">
                    Update your account password (8–12 characters, at least 1 capital letter and 1 special character, no spaces)
                  </p>
                </div>
              </div>

              {!showPasswordSection && (
                <button
                  type="button"
                  onClick={openPasswordSection}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#0B6B8A] px-4 py-2 text-xs font-black uppercase tracking-wide text-white shadow-md transition hover:bg-[#095A74] active:scale-[0.98]"
                >
                  <KeyRound size={14} /> Change Password
                </button>
              )}
            </div>

            {showPasswordSection && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                {passwordError && (
                  <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    <span className="min-w-0 flex-1 break-words">{passwordError}</span>
                  </div>
                )}

                {passwordConfirmStep ? (
                  // Step 2: "are you sure?"
                  <div className="space-y-4 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                      <AlertTriangle size={22} />
                    </div>
                    <h5 className="text-base font-bold text-slate-800">
                      Are you sure you want to change your password?
                    </h5>
                    <p className="text-xs text-slate-500">
                      You'll be redirected to the login page to sign back in with your new password.
                    </p>
                    <div className={`${btnRow} pt-1`}>
                      <button
                        type="button"
                        disabled={changingPassword}
                        onClick={() => setPasswordConfirmStep(false)}
                        className={`${btnFlex} rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50`}
                      >
                        No, Keep Old
                      </button>
                      <button
                        type="button"
                        disabled={changingPassword}
                        onClick={handlePasswordConfirm}
                        className={`${btnFlex} rounded-xl bg-[#0B648D] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#094f70] disabled:opacity-50`}
                      >
                        {changingPassword ? 'Saving…' : 'Yes, Change'}
                      </button>
                    </div>
                  </div>
                ) : (
                  // Step 1: password form
                  <form onSubmit={handlePasswordFormSubmit} className="space-y-3">
                    <PasswordField
                      label="Current Password"
                      name="currentPassword"
                      value={passwordForm.currentPassword}
                      onChange={handlePasswordFieldChange}
                      show={showCurrent}
                      toggleShow={() => setShowCurrent((v) => !v)}
                    />
                    <div className={fitGrid}>
                      <PasswordField
                        label="New Password (8–12 chars)"
                        name="newPassword"
                        value={passwordForm.newPassword}
                        onChange={handlePasswordFieldChange}
                        show={showNew}
                        toggleShow={() => setShowNew((v) => !v)}
                      />
                      <PasswordField
                        label="Confirm New Password"
                        name="confirmPassword"
                        value={passwordForm.confirmPassword}
                        onChange={handlePasswordFieldChange}
                        show={showConfirm}
                        toggleShow={() => setShowConfirm((v) => !v)}
                      />
                    </div>

                    <div className={`${btnRow} pt-2`}>
                      <button
                        type="submit"
                        className={`${btnFlex} flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#0B6B8A] to-[#095A74] px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white hover:shadow-lg active:scale-[0.98]`}
                      >
                        <KeyRound size={15} /> Continue
                      </button>
                      <button
                        type="button"
                        onClick={closePasswordSection}
                        className={`${btnFlex} min-h-12 rounded-xl bg-slate-200 px-4 text-sm font-black uppercase text-slate-500 hover:bg-slate-300`}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
      </div>
    </div>
  );
};

export default UserProfile;
