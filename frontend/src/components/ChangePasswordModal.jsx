// src/components/ChangePasswordModal.jsx
import React, { useState } from 'react';
import { Lock, Eye, EyeOff, X, AlertTriangle } from 'lucide-react';
import { changePassword } from '../api/api.js';

export default function ChangePasswordModal({
  mustChangePassword,
  // When set (right after logging in with the temporary password), it is
  // sent as the current password and that field is hidden.
  currentPasswordValue,
  onSuccess,
  onCancel,
  userRole = 'moderator',
}) {
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showConfirmationStep, setShowConfirmationStep] = useState(false);

  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setErrorMessage(''); // Clear errors when typing
  };

  /**
   * Defensive validation and advance to step 2.
   */
  const handleInitialSubmit = (e) => {
    e.preventDefault();
    setErrorMessage('');

    // Backend matching constraint: 8 to 12 chars
    if (formData.newPassword.length < 8 || formData.newPassword.length > 12) {
      setErrorMessage('Password must be 8 to 12 characters long.');
      return;
    }

    // Backend matching constraint: no spaces
    if (/\s/.test(formData.newPassword)) {
      setErrorMessage('Password must not contain spaces.');
      return;
    }

    // Backend matching constraint: at least one capital letter
    if (!/[A-Z]/.test(formData.newPassword)) {
      setErrorMessage('Password must contain at least one capital letter.');
      return;
    }

    // Backend matching constraint: at least one special character
    if (!/[^A-Za-z0-9\s]/.test(formData.newPassword)) {
      setErrorMessage('Password must contain at least one special character (e.g. ! @ # $ %).');
      return;
    }

    // Backend matching constraint: passwords must match
    if (formData.newPassword !== formData.confirmPassword) {
      setErrorMessage('New passwords do not match!');
      return;
    }

    // Pass frontend checks, proceed to "Are you sure?" step
    setShowConfirmationStep(true);
  };

  /**
   * Final API call. User clicked 'Yes'.
   */
  const handleFinalConfirm = async () => {
    setIsLoading(true);
    setErrorMessage('');

    try {
      // Call the imported changePassword API utility
      await changePassword(currentPasswordValue || formData.currentPassword, formData.newPassword);

      // Reset modal state
      setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setShowConfirmationStep(false);

      // Successful: Execute callback (e.g., redirect to login)
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      const apiError =
        err.response?.data?.detail ||
        err.response?.data?.message ||
        err.response?.data?.error ||
        err.message ||
        'Failed to change password.';
      setErrorMessage(apiError);
      setShowConfirmationStep(false); // Return to form view on API error
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        
        {/* Header - Common for both steps */}
        <div className="flex items-center justify-between bg-[#0B648D] px-6 py-4 text-white">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            <h3 className="text-base font-bold tracking-wide">
              Change Password ({userRole.toUpperCase()})
            </h3>
          </div>
          {/* Prevent closing mid-process */}
          {!mustChangePassword && onCancel && !showConfirmationStep && (
            <button
              type="button"
              onClick={onCancel}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition"
            >
              <X className="h-4 w-4 text-white" />
            </button>
          )}
        </div>

        {/* Dynamic Error Alert Bar */}
        {errorMessage && (
          <div className="m-4 mb-0 rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-600 border border-red-200">
            {errorMessage}
          </div>
        )}

        {/* STEP 2: ARE YOU SURE CONFIRMATION */}
        {showConfirmationStep ? (
          <div className="p-6 text-center space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <AlertTriangle className="h-6 w-6" />
            </div>
            
            <h4 className="text-lg font-bold text-slate-800">
              Are you sure you want to change your password?
            </h4>
            
            <p className="text-xs text-slate-500">
              Your password will be updated and you will be redirected to the Staff Login page to log back in with your new password.
            </p>

            <div className="flex items-center justify-center gap-3 pt-3">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => setShowConfirmationStep(false)}
                className="w-1/2 rounded-xl border border-slate-300 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                No, Keep Old
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={handleFinalConfirm}
                className="w-1/2 rounded-xl bg-[#0B648D] py-2.5 text-sm font-semibold text-white hover:bg-[#094f70] transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Saving...' : 'Yes, Change'}
              </button>
            </div>
          </div>
        ) : (
          /* STEP 1: PASSWORD FORM INPUT */
          <form onSubmit={handleInitialSubmit} className="p-6 space-y-4">
            <p className="text-xs font-semibold text-slate-500">
              {mustChangePassword
                ? 'You must update your password before continuing.'
                : 'Enter your details below to update your account password.'}
            </p>

            {/* Conditionally show current password if not forced */}
            {!mustChangePassword && !currentPasswordValue && (
              <PasswordInput
                label="Current Password"
                name="currentPassword"
                value={formData.currentPassword}
                onChange={handleChange}
                show={showCurrent}
                toggleShow={() => setShowCurrent(!showCurrent)}
              />
            )}

            <PasswordInput
              label="New Password (8-12 characters, 1 capital letter, 1 special character)"
              name="newPassword"
              value={formData.newPassword}
              onChange={handleChange}
              show={showNew}
              toggleShow={() => setShowNew(!showNew)}
            />

            <PasswordInput
              label="Confirm New Password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              show={showConfirm}
              toggleShow={() => setShowConfirm(!showConfirm)}
            />

            <div className="flex items-center justify-end gap-3 pt-3">
              {/* Required change (temporary password): the user can't skip
                  it, but can log out instead and come back later. */}
              {mustChangePassword && onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="mr-auto rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  Log out
                </button>
              )}
              {!mustChangePassword && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                className="rounded-xl bg-[#0B648D] px-4 py-2 text-sm font-medium text-white hover:bg-[#094f70] transition-colors"
              >
                Confirm Change
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
}

/**
 * Helper input component.
 */
function PasswordInput({ label, name, value, onChange, show, toggleShow }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 shadow-xs">
      <label className="block text-[10px] font-extrabold tracking-wider text-slate-500 uppercase">
        {label}
      </label>
      <div className="relative mt-1 flex items-center">
        <input
          type={show ? 'text' : 'password'}
          name={name}
          required
          value={value}
          onChange={onChange}
          className="w-full bg-transparent text-xs font-semibold text-slate-700 focus:outline-none pr-8"
        />
        <button
          type="button"
          onClick={toggleShow}
          className="absolute right-0 text-slate-400 hover:text-slate-600 focus:outline-none"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
