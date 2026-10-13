import React, { useState, useEffect, useCallback } from 'react';
import { Eye, Archive, RotateCcw, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getUsers, getUserById, updateUserById, createUser, deleteUserById } from '../api/api';
import { logActivity } from '../utils/Activitylog';
import Pagination from "../components/Pagination";
import { confirmAction } from "../components/ConfirmDialog";
import { sanitizeContactNumber, contactNumberError, CONTACT_NUMBER_LENGTH } from "../utils/contactNumber";
import { showToast } from "../utils/toast";

// Pulls a human-readable message out of a DRF error response instead of
// discarding it. DRF error bodies vary in shape depending on where they
// come from:
//   - serializer.errors            -> { field: ["msg", ...], ... }
//   - Response({"error": "..."})   -> { error: "msg" }
//   - non-JSON / network failure   -> no response at all
const getErrorMessage = (error, fallback) => {
  const data = error?.response?.data;

  if (!data) {
    // No response reached the browser at all (network down, CORS, server
    // unreachable) vs. the server responding with a non-2xx status.
    return error?.message ? `${fallback} (${error.message})` : fallback;
  }
  if (typeof data === 'string') return data;
  if (data.error) return data.error;
  if (data.detail) return data.detail;
  // Field-level validation errors, e.g. { email: ["account with this email
  // already exists."] }
  const fieldErrors = Object.entries(data)
    .map(([field, msgs]) => {
      const text = Array.isArray(msgs) ? msgs.join(' ') : String(msgs);
      return field === 'non_field_errors' ? text : `${field}: ${text}`;
    })
    .join('\n');

  return fieldErrors || fallback;
};

// For admins, "active" status means is_current_admin (the single-admin
// swap flag) — is_active is always true for admins server-side and
// carries no meaningful signal for them. For every other role, is_active
// is a genuine manual toggle and is used as before.
const statusColor = (user) => {
  if (user.is_archived) return 'bg-gray-400 text-white';
  if (user.role === 'admin') {
    if (user.is_current_admin) return 'bg-emerald-100 text-emerald-700';
    if (user.is_pending_admin) return 'bg-sky-100 text-sky-700';
    return 'bg-amber-100 text-amber-700';
  }
  return user.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700';
};

const statusText = (user) => {
  if (user.is_archived) return 'Archived';
  if (user.role === 'admin') {
    if (user.is_current_admin) return 'Active';
    // New admin: takes over at its first login.
    if (user.is_pending_admin) return 'Pending first login';
    return 'Superseded';
  }
  return user.is_active ? 'Active' : 'Inactive';
};

// Role filter options shown in the dropdown. "all" always means "no role
// filter applied" and is not itself a role value on the user record.
// Students and employees are both "Users" of the system, so they are shown
// and filtered as one group. (The database still stores 'student' or
// 'employee'; self-registered accounts are saved as 'student'.)
const USER_ROLES = ['student', 'employee'];
const roleLabel = (role) =>
  USER_ROLES.includes(String(role || '').toLowerCase()) ? 'User' : String(role || '');

const ROLE_FILTER_OPTIONS = [
  { value: 'all', label: 'All Roles' },
  { value: 'admin', label: 'Admin' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'user', label: 'User (Student / Employee)' },
];

// Fixed domain suffix appended to a Student's 8-digit ID Number to form
// their account email (e.g. "12345678" -> "12345678@slc-sflu.edu.ph").
// This mirrors the same convention used for "Found By" in
// FoundItems.jsx's ItemModal, so a student's account email always lines
// up with the ID Number they use when turning in / claiming items.
const ID_NUMBER_DOMAIN = '@slc-sflu.edu.ph';

// Pulls the 8 digits back out of a student's stored email (e.g.
// "12345678@slc-sflu.edu.ph" -> "12345678") for the ID Number input.
// Returns '' for anything that isn't in that shape.
function parseIdNumberDigits(email) {
  if (!email) return '';
  const [local] = String(email).split('@');
  return (local || '').replace(/\D/g, '').slice(0, 8);
}

const EMPTY_USER = {
  first_name: '',
  last_name: '',
  email: '',
  contact_number: '',
  role: 'moderator',
  is_active: true,
  created_at: '',
  updated_at: '',
  is_archived: false,
};

function toTitleCase(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ─── Modal Form Component ────────────────────────────────────────────────────
const UserModal = ({ user, onSave, onClose }) => {
  const [form, setForm] = useState(user || EMPTY_USER);
  const [errors, setErrors] = useState({});
  const [warningMsg, setWarningMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isEditMode = Boolean(user);

  // Student accounts don't use a typed email — their email is derived
  // from an 8-digit ID Number plus the fixed domain suffix (see
  // ID_NUMBER_DOMAIN above). This holds just the digits for that input;
  // form.email itself always stays the full derived value.
  const [idDigits, setIdDigits] = useState(() =>
    (user || EMPTY_USER).role === 'student' ? parseIdNumberDigits((user || EMPTY_USER).email) : ''
  );

  useEffect(() => {
    const next = user || EMPTY_USER;
    setForm(next);
    setIdDigits(next.role === 'student' ? parseIdNumberDigits(next.email) : '');
    setErrors({});
    setWarningMsg('');
  }, [user]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Only digits are ever accepted for the Student ID Number field, capped
  // at 8 characters. Keeps form.email in sync with the derived value so
  // validate()/handleSubmit don't need any student-specific branching
  // beyond checking idDigits' length.
  const setIdNumberDigits = (value) => {
    const digitsOnly = (value || '').replace(/\D/g, '').slice(0, 8);
    setIdDigits(digitsOnly);
    setField('email', digitsOnly ? `${digitsOnly}${ID_NUMBER_DOMAIN}` : '');
  };

  // Switching role changes which contact fields are required/shown, so
  // clear the ones that no longer apply instead of leaving stale values
  // behind (e.g. a typed email surviving a switch to Student, or vice
  // versa).
  const handleRoleChange = (newRole) => {
    const wasStudent = form.role === 'student';
    setField('role', newRole);
    if (newRole === 'student') {
      setField('contact_number', '');
      setField('email', idDigits ? `${idDigits}${ID_NUMBER_DOMAIN}` : '');
    } else if (wasStudent) {
      setIdDigits('');
      setField('email', '');
    }
  };

  const validate = () => {
    const newErrors = {};
    if (!form.first_name?.trim()) newErrors.first_name = 'First name is required';
    if (!form.last_name?.trim()) newErrors.last_name = 'Last name is required';
    if (!form.role) newErrors.role = 'Role is required';

    if (form.role === 'student') {
      if (idDigits.length !== 8) newErrors.email = 'A valid 8-digit ID Number is required';
    } else {
      if (!form.email?.trim()) newErrors.email = 'Email address is required';
      if (!form.contact_number?.trim()) newErrors.contact_number = 'Contact number is required';
    }

    // Any contact number entered must be exactly 11 digits.
    if (!newErrors.contact_number) {
      const contactError = contactNumberError(form.contact_number);
      if (contactError) newErrors.contact_number = contactError;
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      setWarningMsg('Please fill in all required fields marked with * before submitting.');
      return false;
    }

    setWarningMsg('');
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate() || isSubmitting) return;

    if (
      !(await confirmAction({
        message: user
          ? 'Save the changes to this user account?'
          : 'Create this user account? A temporary password will be emailed to them.',
        confirmLabel: user ? 'Save Changes' : 'Create User',
      }))
    ) {
      return;
    }

    try {
      setIsSubmitting(true);
      await onSave({
        ...form,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        contact_number: (form.contact_number || '').trim(),
      });
    } catch (err) {
      setWarningMsg(err?.response?.data?.message || err?.message || 'Failed to complete request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-start justify-between bg-gradient-to-r from-[#0B648D] to-[#155F87] px-6 py-3 text-white shrink-0">
          <div>
            <h3 className="text-lg font-bold">
              {isEditMode ? 'View User Profile' : 'Add New User'}
            </h3>
            <p className="mt-1 text-sm text-white/90">
              {isEditMode
                ? 'Review and update user account details directly'
                : 'Submit details to create a user and issue credentials via email'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-base text-white transition hover:bg-white/25 disabled:opacity-50"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-6 flex-1" noValidate>
          {warningMsg && (
            <div className="flex items-center gap-3 rounded-xl bg-red-50 p-4 border border-red-200 text-red-700 text-sm font-semibold">
              <span className="text-xl">⚠️</span>
              <p>{warningMsg}</p>
            </div>
          )}

          {!isEditMode && (
            <div className="rounded-xl bg-blue-50 p-4 border border-blue-200 text-blue-800 text-xs font-medium">
              ℹ️ A temporary password will be auto-generated and dispatched to the specified email address upon creation.
            </div>
          )}

          {form.role === 'admin' && (
            <div className="rounded-xl bg-amber-50 p-4 border border-amber-200 text-amber-800 text-xs font-medium">
              ⚠️ Saving a new account as Admin does not switch admins right away: it becomes the current admin when it logs in for the first time. At that moment the previous admin is deactivated and can no longer log in.
            </div>
          )}

          {form.role === 'student' && (
            <div className="rounded-xl bg-orange-50 p-4 border border-orange-200 text-orange-800 text-xs font-medium">
              🎓 Student accounts are identified by ID Number instead of a typed email/contact number — this is the same ID Number used when a student's item is turned in or claimed on the Surrendered Items board.
            </div>
          )}

          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase text-slate-700">
                  First Name *
                </label>
                <input
                  className={`h-11 w-full rounded-xl border px-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 transition focus:border-[#1478a7] ${
                    errors.first_name ? 'border-red-500 bg-red-50/30' : 'border-slate-300'
                  }`}
                  value={form.first_name || ''}
                  onChange={(e) => setField('first_name', e.target.value)}
                  placeholder="First name"
                />
                {errors.first_name && (
                  <span className="text-xs text-red-500 font-medium mt-1 block">
                    {errors.first_name}
                  </span>
                )}
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase text-slate-700">
                  Last Name *
                </label>
                <input
                  className={`h-11 w-full rounded-xl border px-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 transition focus:border-[#1478a7] ${
                    errors.last_name ? 'border-red-500 bg-red-50/30' : 'border-slate-300'
                  }`}
                  value={form.last_name || ''}
                  onChange={(e) => setField('last_name', e.target.value)}
                  placeholder="Last name"
                />
                {errors.last_name && (
                  <span className="text-xs text-red-500 font-medium mt-1 block">
                    {errors.last_name}
                  </span>
                )}
              </div>
            </div>

            {form.role === 'student' ? (
              <div>
                <label className="mb-2 block text-xs font-bold uppercase text-slate-700">
                  Student ID Number *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    className={`h-11 flex-1 rounded-xl border px-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 transition focus:border-[#1478a7] ${
                      errors.email ? 'border-red-500 bg-red-50/30' : 'border-slate-300'
                    }`}
                    value={idDigits}
                    onChange={(e) => setIdNumberDigits(e.target.value)}
                    inputMode="numeric"
                    pattern="\d*"
                    maxLength={8}
                    placeholder="8-digit ID"
                  />
                  <span className="whitespace-nowrap text-sm font-semibold text-slate-500">
                    {ID_NUMBER_DOMAIN}
                  </span>
                </div>
                {errors.email && (
                  <span className="text-xs text-red-500 font-medium mt-1 block">{errors.email}</span>
                )}
                <p className="mt-1 text-xs text-slate-400">
                  This becomes the student's account email — credentials are sent there.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase text-slate-700">
                    Email Address *
                  </label>
                  <input
                    className={`h-11 w-full rounded-xl border px-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 transition focus:border-[#1478a7] ${
                      errors.email ? 'border-red-500 bg-red-50/30' : 'border-slate-300'
                    }`}
                    type="email"
                    value={form.email || ''}
                    onChange={(e) => setField('email', e.target.value)}
                    placeholder="email@slc-sflu.edu.ph"
                  />
                  {errors.email && (
                    <span className="text-xs text-red-500 font-medium mt-1 block">
                      {errors.email}
                    </span>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase text-slate-700">
                    Contact Number *
                  </label>
                  <input
                    className={`h-11 w-full rounded-xl border px-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 transition focus:border-[#1478a7] ${
                      errors.contact_number ? 'border-red-500 bg-red-50/30' : 'border-slate-300'
                    }`}
                    type="tel"
                    inputMode="numeric"
                    maxLength={CONTACT_NUMBER_LENGTH}
                    value={form.contact_number || ''}
                    onChange={(e) => setField('contact_number', sanitizeContactNumber(e.target.value))}
                    placeholder="09123456789"
                  />
                  {errors.contact_number && (
                    <span className="text-xs text-red-500 font-medium mt-1 block">
                      {errors.contact_number}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase text-slate-700">
                  Role *
                </label>
                <select
                  className={`h-11 w-full rounded-xl border px-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 transition focus:border-[#1478a7] ${
                    errors.role ? 'border-red-500 bg-red-50/30' : 'border-slate-300'
                  }`}
                  value={form.role || 'moderator'}
                  onChange={(e) => handleRoleChange(e.target.value)}
                >
                  <option value="admin">Admin</option>
                  <option value="moderator">Moderator</option>
                  {/* Students and employees are both Users. An existing
                      employee account keeps its stored value. */}
                  {form.role === 'employee' ? (
                    <option value="employee">User (Student / Employee)</option>
                  ) : (
                    <option value="student">User (Student / Employee)</option>
                  )}
                </select>
                {errors.role && (
                  <span className="text-xs text-red-500 font-medium mt-1 block">{errors.role}</span>
                )}
              </div>

              {isEditMode && (
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase text-slate-700">
                    Status *
                  </label>
                  <select
                    className="h-11 w-full rounded-xl border border-slate-300 px-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#1478a7]"
                    value={form.is_active ? 'Active' : 'Inactive'}
                    onChange={(e) => setField('is_active', e.target.value === 'Active')}
                    disabled={form.role === 'admin'}
                    title={form.role === 'admin' ? 'Admin accounts can always log in. Use another admin account to change who the current admin is.' : undefined}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2 shrink-0">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex-1 py-3 rounded-xl text-white text-sm font-semibold uppercase tracking-wide shadow-md transition-all duration-200 ${
                isSubmitting
                  ? "bg-slate-400 cursor-not-allowed opacity-70"
                  : "bg-gradient-to-b from-[#384388] to-[#2D366D] hover:from-[#44509B] hover:to-[#2D366D] hover:shadow-lg active:scale-[0.98]"
              }`}
            >
              {isSubmitting
                ? 'Processing...'
                : isEditMode
                ? 'Save Changes'
                : form.role === 'student'
                ? 'Create Student Account & Send Email'
                : 'Create User & Send Email'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-12 rounded-xl bg-slate-200 text-sm font-black uppercase tracking-wide text-slate-500 transition hover:bg-slate-300 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Confirm Action Modal (archive / restore) ───────────────────────────────
const ConfirmModal = ({ message, confirmLabel = 'Confirm', onConfirm, onClose }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm">
    <div className="w-full max-w-sm rounded-[28px] bg-white px-8 py-8 text-center shadow-2xl">
      <div className="mx-auto mb-7 flex h-16 w-16 items-center justify-center rounded-full bg-[#EAF4F8] text-[#0B6B8A]">
        <AlertCircle size={30} strokeWidth={2.5} />
      </div>

      <h5 className="mb-3 text-lg font-black text-[#144B70]">System Confirmation</h5>

      <p className="mx-auto mb-8 max-w-[280px] text-sm font-medium leading-6 text-[#5F6F8C]">
        {message}
      </p>

      <div className="space-y-3">
        <button
          type="button"
          onClick={onConfirm}
          className="h-12 w-full rounded-xl bg-[#0B6B8A] text-sm font-black uppercase tracking-wide text-white shadow-md transition hover:bg-[#095A74] active:scale-[0.98]"
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-12 w-full rounded-xl border border-[#0B6B8A] bg-white text-sm font-black uppercase tracking-wide text-[#0B6B8A] transition hover:bg-[#EAF4FF]"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
);

// ─── Users Module ────────────────────────────────────────────────────────────
const Users = () => {
  const { currentUser, setCurrentUser } = useApp();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [activeUserModal, setActiveUserModal] = useState(null);
  const [archiveUser, setArchiveUser] = useState(null);
  const [restoreUser, setRestoreUser] = useState(null);
  // Archived users are viewed and restored from Utilities > Archive.
  const showArchived = false;
  const [users, setUsers] = useState([]);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const fetchUsers = useCallback(async () => {
    try {
      const data = await getUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Fetching error: ', error);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 5000);
    return () => clearInterval(interval);
  }, [fetchUsers]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, roleFilter, showArchived]);

  const handleOpenViewEdit = async (userItem) => {
    try {
      const data = await getUserById(userItem.id);
      setActiveUserModal(data);
    } catch (error) {
      setActiveUserModal(userItem);
    }
  };

  // NOTE: The "only one current admin" rule is enforced entirely
  // server-side now (see _deactivate_other_admins in views.py), and it
  // runs synchronously inside the same create/update request — there is
  // no separate frontend call needed to trigger it, and no login-time
  // handover step either (see LoginModal.jsx). Saving a user with
  // role: 'admin' is sufficient; the backend does the rest in that
  // same request and returns the updated record.

  const handleSaveEdit = async (updatedUser) => {
    try {
      await updateUserById(activeUserModal.id, {
        first_name: updatedUser.first_name,
        last_name: updatedUser.last_name,
        email: updatedUser.email,
        contact_number: updatedUser.contact_number,
        role: updatedUser.role,
        is_active: updatedUser.is_active,
      });

      if (currentUser?.id === activeUserModal.id) {
        setCurrentUser((prev) => ({ ...prev, ...updatedUser }));
      }

      logActivity({
        actor_name: currentUser?.first_name ? `${currentUser.first_name} ${currentUser.last_name}` : 'Admin',
        actor_role: currentUser?.role || 'admin',
        action: 'updated',
        target_title: `${updatedUser.first_name} ${updatedUser.last_name}`,
        details: `Updated details for user ${updatedUser.email}`,
      });

      await fetchUsers();
      setActiveUserModal(null);
      showToast(
        updatedUser.role === 'admin' && activeUserModal.role !== 'admin'
          ? 'User profile updated successfully! This account will become the current admin when it logs in for the first time. Until then, the current admin stays in charge.'
          : 'User profile updated successfully!'
      );
    } catch (error) {
      console.error('Update user error:', error);
      showToast(getErrorMessage(error, 'Failed to update user.'));
    }
  };

  const handleAddUser = async (newUser) => {
    try {
      const isAdmin = (newUser.role || 'moderator') === 'admin';

      const payload = {
        first_name: newUser.first_name,
        last_name: newUser.last_name,
        email: newUser.email,
        contact_number: newUser.contact_number,
        role: newUser.role || 'moderator',
      };

      const response = await createUser(payload);
      const createdRecord = response?.data || response;

      logActivity({
        actor_name: currentUser?.first_name ? `${currentUser.first_name} ${currentUser.last_name}` : 'Admin',
        actor_role: currentUser?.role || 'admin',
        action: 'created',
        target_title: `${newUser.first_name} ${newUser.last_name}`,
        details: `Created new user account for ${newUser.email}`,
      });

      setUsers((prevUsers) => [createdRecord, ...prevUsers]);
      setAddOpen(false);
      await fetchUsers();

      if (createdRecord?.email_sent === false) {
        showToast(
          `User account created, but the welcome email could not be sent to ${newUser.email}.\n\n` +
          (createdRecord.email_error || 'Check the Brevo API configuration on the server.') +
          (isAdmin
            ? '\n\nThis account will become the current admin when it logs in for the first time. Until then, the current admin stays in charge.'
            : '')
        );
      } else {
        showToast(
          `User account created successfully! Credentials emailed to ${newUser.email}.` +
          (isAdmin
            ? '\n\nThis account will become the current admin when it logs in for the first time. Until then, the current admin stays in charge.'
            : '')
        );
      }
    } catch (error) {
      console.error('Create user error:', error.response?.data || error);
      showToast(getErrorMessage(error, 'Failed to create user.'));
    }
  };

  const handleArchiveUser = async (userItem) => {
    try {
      await updateUserById(userItem.id, {
        first_name: userItem.first_name,
        last_name: userItem.last_name,
        email: userItem.email,
        contact_number: userItem.contact_number,
        role: userItem.role,
        is_active: userItem.is_active,
        is_archived: true,
      });

      logActivity({
        actor_name: currentUser?.first_name ? `${currentUser.first_name} ${currentUser.last_name}` : 'Admin',
        actor_role: currentUser?.role || 'admin',
        action: 'archived', // was 'deleted'
        target_title: `${userItem.first_name || ''} ${userItem.last_name || ''}`.trim() || userItem.email,
        details: `Archived user account (${userItem.email})`,
      });

      await fetchUsers();
      setArchiveUser(null);
      showToast('User archived successfully!');
    } catch (error) {
      console.error('Archive user error:', error);
      showToast(getErrorMessage(error, 'Failed to archive user.'));
    }
  };

  const handleRestoreUser = async (userItem) => {
    try {
      await updateUserById(userItem.id, {
        first_name: userItem.first_name,
        last_name: userItem.last_name,
        email: userItem.email,
        contact_number: userItem.contact_number,
        role: userItem.role,
        is_active: userItem.is_active,
        is_archived: false,
      });

      logActivity({
        actor_name: currentUser?.first_name ? `${currentUser.first_name} ${currentUser.last_name}` : 'Admin',
        actor_role: currentUser?.role || 'admin',
        action: 'restored', // was 'updated'
        target_title: `${userItem.first_name || ''} ${userItem.last_name || ''}`.trim() || userItem.email,
        details: `Restored user account (${userItem.email})`,
      });

      await fetchUsers();
      setRestoreUser(null);
      showToast('User restored successfully!');
    } catch (error) {
      console.error('Restore user error:', error);
      showToast(getErrorMessage(error, 'Failed to restore user.'));
    }
  };

  // Filter computation
  const filtered = users
    .filter((u) => {
      // Self-registered accounts that haven't confirmed their emailed
      // 6-digit code yet are not "registered users". Only an explicit
      // false hides a row, so accounts/APIs without an is_verified
      // field (e.g. admin-created users) still show. The backend should
      // also exclude them from account/users/ — this is the safety net.
      if (u.is_verified === false) return false;

      const searchText = search.toLowerCase();
      const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || '';
      const role = u.role?.toLowerCase();
      const matchesRole =
        roleFilter === 'all' ||
        (roleFilter === 'user' ? USER_ROLES.includes(role) : role === roleFilter);
      return (
        Boolean(u.is_archived) === showArchived &&
        matchesRole &&
        (fullName.toLowerCase().includes(searchText) ||
          String(u.id).includes(searchText) ||
          u.email?.toLowerCase().includes(searchText) ||
          u.contact_number?.toLowerCase().includes(searchText) ||
          roleLabel(u.role).toLowerCase().includes(searchText) ||
          u.role?.toLowerCase().includes(searchText))
      );
    })
    .sort((a, b) => b.id - a.id);

  // Pagination calculations — mirrors LeaderboardControl's Previous/Next +
  // "Page X of Y" footer instead of the earlier numbered page-button row.
  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE) || 1;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedItems = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // Keep state in sync if the list shrinks (archive/restore/polling)
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  return (
    <div className="bg-white rounded-[18px] border border-[#D8E2EF] shadow-[0_8px_24px_rgba(45,54,109,0.08)] overflow-hidden flex flex-col h-[calc(100vh-135px)]">
      {/* Header Bar */}
      <div className="bg-white px-6 sm:px-8 py-4 border-b border-[#D8E2EF] shrink-0">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-base sm:text-lg font-black uppercase tracking-[0.16em] text-[#071E3D]">
                User Management
              </h3>
              <p className="text-xs sm:text-sm text-[#7B8AA6] italic mt-0.5">
                Manage all registered system user accounts and permissions
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:w-auto">
            <div className="relative w-full sm:w-[300px]">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#0B6B8A] text-sm">
                🔍
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users..."
                className="w-full pl-10 pr-4 py-2.5 border border-[#CBD8E8] rounded-full text-sm outline-none bg-white text-[#071E3D] placeholder:text-[#8A98B3] focus:ring-2 focus:ring-[#0B6B8A]/20 focus:border-[#0B6B8A] transition-all"
              />
            </div>

            {/* ROLE FILTER */}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full sm:w-[170px] px-4 py-2.5 border border-[#CBD8E8] rounded-full text-sm font-semibold outline-none bg-white text-[#071E3D] focus:ring-2 focus:ring-[#0B6B8A]/20 focus:border-[#0B6B8A] transition-all shrink-0"
            >
              {ROLE_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <button
              onClick={() => setAddOpen(true)}
              className="px-6 py-2.5 rounded-full bg-[#2D366D] text-white font-black uppercase tracking-[0.1em] text-xs shadow-[0_6px_14px_rgba(45,54,109,0.25)] hover:bg-[#24305C] transition-all whitespace-nowrap"
            >
              📋 Add User
            </button>
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-y-auto bg-white">
        <table className="w-full min-w-[1000px] table-fixed border-collapse">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-[10%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">ID</th>
              <th className="w-[20%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Name</th>
              <th className="w-[24%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Email</th>
              <th className="w-[16%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Contact No.</th>
              <th className="w-[10%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Role</th>
              <th className="w-[10%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Status</th>
              <th className="w-[10%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Action</th>
            </tr>
          </thead>

          <tbody className="bg-white">
            {paginatedItems.length > 0 ? (
              paginatedItems.map((u, index) => {
                const isSelf = currentUser?.id === u.id;

                return (
                  <tr
                    key={u.id}
                    className={`h-[56px] transition-colors ${
                      isSelf
                        ? 'bg-amber-50/70 hover:bg-amber-100/70'
                        : index % 2 === 0
                        ? 'bg-white'
                        : 'bg-[#F6FAFF]'
                    } hover:bg-[#EAF4FF]`}
                  >
                    <td className="border border-gray-300 p-4 text-center align-middle text-[13px]">
                      <span className="font-mono text-[11px] bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 text-slate-600 font-bold inline-block">
                        #U-{String(u.id).padStart(3, '0')}
                      </span>
                    </td>

                    <td className="border border-gray-300 p-4 text-center align-middle text-slate-700 text-[13px]">
                      {toTitleCase(u.first_name)} {toTitleCase(u.last_name)}
                      {isSelf && (
                        <span className="ml-2 inline-block px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-amber-200 text-amber-900 rounded-md border border-amber-300">
                          YOU
                        </span>
                      )}
                    </td>

                    <td className="border border-gray-300 p-4 text-center align-middle text-slate-600 text-[13px]">
                      {u.email}
                    </td>

                    <td className="border border-gray-300 p-4 text-center align-middle text-slate-600 text-[13px]">
                      {u.contact_number || '-'}
                    </td>

                    <td className="border border-gray-300 p-4 text-center align-middle">
                      <span className="text-[11px] font-black uppercase text-slate-700">
                        {roleLabel(u.role)}
                      </span>
                    </td>

                    <td className="border border-gray-300 p-4 text-center align-middle">
                      <span
                        className={`rounded px-3 py-1 text-[10px] font-black uppercase ${statusColor(u)}`}
                      >
                        {statusText(u)}
                      </span>
                    </td>

                    <td className="border border-gray-300 p-2 text-center align-middle">
                      <div className="flex justify-center items-center gap-1.5">
                        <button
                          onClick={() => handleOpenViewEdit(u)}
                          title="View User"
                          className="inline-flex h-8 w-8 items-center justify-center rounded bg-[#0B6B8A] text-white transition hover:bg-[#095A74]"
                        >
                          <Eye size={16} />
                        </button>

                        {!showArchived ? (
                          <button
                            onClick={() => setArchiveUser(u)}
                            disabled={isSelf}
                            title={isSelf ? "You cannot archive your active session" : "Archive User"}
                            className={`inline-flex h-8 w-8 items-center justify-center rounded transition text-white ${
                              isSelf
                                ? "bg-slate-300 cursor-not-allowed opacity-60"
                                : "bg-amber-600 hover:bg-amber-700"
                            }`}
                          >
                            <Archive size={16} />
                          </button>
                        ) : (
                          <button
                            onClick={() => setRestoreUser(u)}
                            title="Restore User"
                            className="inline-flex h-8 w-8 items-center justify-center rounded bg-emerald-600 text-white transition hover:bg-emerald-700"
                          >
                            <RotateCcw size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={7} className="bg-white py-24 text-center">
                  <div className="flex flex-col items-center justify-center gap-3">
                    <span className="text-4xl font-black tracking-tighter text-[#071E3D] opacity-20">
                      EMPTY
                    </span>
                    <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#7B8AA6]">
                      {showArchived ? 'No archived users found' : 'No registered users found'}
                    </p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <Pagination
        currentPage={currentPage}
        totalItems={filtered.length}
        pageSize={ITEMS_PER_PAGE}
        onPageChange={setCurrentPage}
      />
      {/* Dynamic Modals */}
      {addOpen && (
        <UserModal user={null} onSave={handleAddUser} onClose={() => setAddOpen(false)} />
      )}
      {activeUserModal && (
        <UserModal
          user={activeUserModal}
          onSave={handleSaveEdit}
          onClose={() => setActiveUserModal(null)}
        />
      )}

      {archiveUser && (
        <ConfirmModal
          message={`Archive user profile "${archiveUser.email}"? This account will lose system access pathways. You can restore it later from Utilities > Archive (Users tab).`}
          confirmLabel="Archive"
          onConfirm={() => handleArchiveUser(archiveUser)}
          onClose={() => setArchiveUser(null)}
        />
      )}
      {restoreUser && (
        <ConfirmModal
          message={`Restore user profile "${restoreUser.email}"? This account will regain its previous system access.`}
          confirmLabel="Restore"
          onConfirm={() => handleRestoreUser(restoreUser)}
          onClose={() => setRestoreUser(null)}
        />
      )}
    </div>
  );
};

export default Users;
