import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RotateCcw, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getItems, editLostItem, getUsers, updateUserById, getClaims } from '../api/api';
import { isClaimAutoArchived, claimArchiveDate, formatYMD } from '../utils/claimArchive';
import { logActivity } from '../utils/Activitylog';
import Pagination from "../components/Pagination";
import { showToast } from "../utils/toast";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function toTitleCase(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const isArchivedItem = (item) => item.status?.toUpperCase() === 'ARCHIVED';
const isLostType = (item) => item.type?.toUpperCase() === 'LOST';
const isFoundType = (item) => {
  const t = item.type?.toUpperCase() || '';
  return t === 'SURRENDERED' || t === 'FOUND';
};

const fullName = (u) =>
  `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email || '';

const ITEMS_PER_PAGE = 10;

const TH =
  'bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white';
const TD = 'border border-gray-300 p-4 text-center align-middle text-[13px]';

// ─── Confirm modal (same look as the one used on the Users page) ─────────────
const ConfirmModal = ({ message, confirmLabel = 'Confirm', busy, onConfirm, onClose }) => (
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
          disabled={busy}
          onClick={onConfirm}
          className="h-12 w-full rounded-xl bg-[#0B6B8A] text-sm font-black uppercase tracking-wide text-white shadow-md transition hover:bg-[#095A74] active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? 'Restoring...' : confirmLabel}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="h-12 w-full rounded-xl border border-[#0B6B8A] bg-white text-sm font-black uppercase tracking-wide text-[#0B6B8A] transition hover:bg-[#EAF4FF] disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
);

const RestoreButton = ({ onClick }) => (
  <button
    onClick={onClick}
    title="Restore"
    className="inline-flex h-8 w-8 items-center justify-center rounded bg-emerald-600 text-white transition hover:bg-emerald-700"
  >
    <RotateCcw size={16} />
  </button>
);

// ─── Archive page ────────────────────────────────────────────────────────────
const Archive = () => {
  const { currentUser } = useApp();
  const isAdmin = currentUser?.role?.toLowerCase() === 'admin';

  const [filter, setFilter] = useState('lost'); // 'lost' | 'found' | 'meetings' | 'users'
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [items, setItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [claims, setClaims] = useState([]);
  const [restoreTarget, setRestoreTarget] = useState(null); // { kind, record }
  const [restoring, setRestoring] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const data = await getItems();
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load archived items:', error);
    }

    // Claims are auto-archived 3 days after their meeting date
    // (utils/claimArchive.js) — no restore, they're read-only here.
    try {
      const data = await getClaims();
      const list = Array.isArray(data)
        ? data
        : Array.isArray(data?.results)
        ? data.results
        : [];
      setClaims(list);
    } catch (error) {
      console.error('Failed to load archived meetings:', error);
    }

    if (isAdmin) {
      try {
        const data = await getUsers();
        setUsers(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Failed to load archived users:', error);
      }
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, search]);

  // If a non-admin somehow lands on the Users filter, bounce back to Lost.
  useEffect(() => {
    if (filter === 'users' && !isAdmin) setFilter('lost');
  }, [filter, isAdmin]);

  const q = search.trim().toLowerCase();

  const archivedLost = useMemo(
    () => items.filter((i) => isLostType(i) && isArchivedItem(i)),
    [items]
  );
  const archivedFound = useMemo(
    () => items.filter((i) => isFoundType(i) && isArchivedItem(i)),
    [items]
  );
  const archivedUsers = useMemo(() => users.filter((u) => u.is_archived), [users]);
  const archivedMeetings = useMemo(() => claims.filter((c) => isClaimAutoArchived(c)), [claims]);

  const matchesItem = (i) =>
    !q ||
    i.title?.toLowerCase().includes(q) ||
    i.ticket_code?.toLowerCase().includes(q) ||
    i.category?.toLowerCase().includes(q) ||
    i.poster_name?.toLowerCase().includes(q) ||
    i.location?.toLowerCase().includes(q);

  const matchesUser = (u) =>
    !q ||
    fullName(u).toLowerCase().includes(q) ||
    String(u.id).includes(q) ||
    u.email?.toLowerCase().includes(q) ||
    u.contact_number?.toLowerCase().includes(q) ||
    u.role?.toLowerCase().includes(q);

  const matchesClaim = (c) =>
    !q ||
    c.claimant_name?.toLowerCase().includes(q) ||
    c.claimant_email?.toLowerCase().includes(q) ||
    String(c.claimant_contact || '').toLowerCase().includes(q) ||
    c.item_details?.title?.toLowerCase().includes(q) ||
    String(c.meeting_date || '').includes(q);

  const rows = useMemo(() => {
    if (filter === 'meetings') {
      // Most recent meeting first.
      return archivedMeetings
        .filter(matchesClaim)
        .sort((a, b) => String(b.meeting_date).localeCompare(String(a.meeting_date)));
    }
    const list =
      filter === 'lost'
        ? archivedLost.filter(matchesItem)
        : filter === 'found'
        ? archivedFound.filter(matchesItem)
        : archivedUsers.filter(matchesUser);
    return [...list].sort((a, b) => b.id - a.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, q, archivedLost, archivedFound, archivedUsers, archivedMeetings]);

  const totalPages = Math.ceil(rows.length / ITEMS_PER_PAGE) || 1;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const pageRows = rows.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const actorInfo = () => ({
    actor_name: currentUser?.first_name
      ? `${currentUser.first_name} ${currentUser.last_name || ''}`.trim()
      : 'Admin',
    actor_role: currentUser?.role || 'admin',
  });

  // ── Restore handlers ──
  // The status the item had BEFORE it was archived (saved by the backend
  // as status_before_archive). Older archived items without it fall back
  // safely: a lost report goes back to Pending (a moderator must approve
  // it again), and a found item goes back to Claimed if it was already
  // released, otherwise Approved.
  const restoreStatusFor = (item) => {
    const saved = String(item.status_before_archive || '').trim();
    if (saved && saved !== 'Archived') return saved;
    if (isLostType(item)) return 'Pending';
    return item.claimed_date || item.claimed_by_name ? 'Claimed' : 'Approved';
  };

  const restoreItem = async (item) => {
    // Restored items go back to the status they had before archiving.
    const formData = new FormData();
    formData.append('status', restoreStatusFor(item));
    await editLostItem(item.id, formData);

    logActivity({
      ...actorInfo(),
      action: 'restored',
      target_title: item.title,
      details: `Restored ${isLostType(item) ? 'lost' : 'surrendered'} item "${item.title}" from archive`,
    });
  };

  const restoreUser = async (u) => {
    await updateUserById(u.id, {
      first_name: u.first_name,
      last_name: u.last_name,
      email: u.email,
      contact_number: u.contact_number,
      role: u.role,
      is_active: u.is_active,
      is_archived: false,
    });

    logActivity({
      ...actorInfo(),
      action: 'restored',
      target_title: fullName(u),
      details: `Restored user account (${u.email})`,
    });
  };

  const handleConfirmRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      if (restoreTarget.kind === 'user') await restoreUser(restoreTarget.record);
      else await restoreItem(restoreTarget.record);

      await fetchAll();
      setRestoreTarget(null);
    } catch (error) {
      console.error('Restore error:', error);
      const data = error?.response?.data;
      const msg =
        (typeof data === 'string' && data) ||
        data?.error ||
        data?.detail ||
        'Failed to restore. Please try again.';
      showToast(msg);
    } finally {
      setRestoring(false);
    }
  };

  const restoreMessage = () => {
    if (!restoreTarget) return '';
    const { kind, record } = restoreTarget;
    if (kind === 'user')
      return `Restore user profile "${record.email}"? This account will regain its previous system access.`;
    // Same status restoreItem() will actually set.
    return `Restore "${record.title}"? It will be moved back to the ${
      kind === 'lost' ? 'Lost' : 'Surrendered'
    } Items list as ${restoreStatusFor(record)}.`;
  };

  // ── UI ──
  const tabs = [
    { id: 'lost', label: 'Lost Items', count: archivedLost.length },
    { id: 'found', label: 'Surrendered Items', count: archivedFound.length },
    { id: 'meetings', label: 'Scheduled Meetings', count: archivedMeetings.length },
    ...(isAdmin ? [{ id: 'users', label: 'Users', count: archivedUsers.length }] : []),
  ];

  const emptyLabel =
    filter === 'lost'
      ? 'No archived lost items'
      : filter === 'found'
      ? 'No archived found items'
      : filter === 'meetings'
      ? 'No archived scheduled meetings'
      : 'No archived users';

  return (
    <div className="bg-white rounded-[18px] border border-[#D8E2EF] shadow-[0_8px_24px_rgba(45,54,109,0.08)] overflow-hidden flex flex-col h-[calc(100vh-135px)]">
      {/* Header */}
      <div className="bg-white px-6 sm:px-8 py-4 border-b border-[#D8E2EF] shrink-0">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <h3 className="text-base sm:text-lg font-black uppercase tracking-[0.16em] text-[#071E3D]">
              Archive
            </h3>
            <p className="text-xs sm:text-sm text-[#7B8AA6] italic mt-0.5">
              All archived lost items, surrendered items, scheduled meetings, and user accounts in one place
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:w-auto">
            <div className="relative w-full sm:w-[300px]">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#0B6B8A] text-sm">
                🔍
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search archived ${
                  filter === 'users' ? 'users' : filter === 'meetings' ? 'meetings' : 'items'
                }...`}
                className="w-full pl-10 pr-4 py-2.5 border border-[#CBD8E8] rounded-full text-sm outline-none bg-white text-[#071E3D] placeholder:text-[#8A98B3] focus:ring-2 focus:ring-[#0B6B8A]/20 focus:border-[#0B6B8A] transition-all"
              />
            </div>
          </div>
        </div>

        {/* Lost / Found / Users tabs — same pill toggle as Found Items,
            Lost Items and Claim Requests, aligned right. */}
        <div className="mt-4 flex justify-end">
          <div className="inline-flex flex-wrap items-center gap-1 rounded-full bg-[#F1F4F9] p-1">
            {tabs.map((t) => {
              const active = filter === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setFilter(t.id)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-black uppercase tracking-wide transition-all ${
                    active
                      ? 'bg-white text-[#0B6B8A] shadow-sm'
                      : 'text-[#7B8AA6] hover:text-[#475569]'
                  }`}
                >
                  <span>{t.label}</span>
                  <span
                    className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black ${
                      active ? 'bg-[#0B6B8A]/10 text-[#0B6B8A]' : 'bg-white text-[#7B8AA6]'
                    }`}
                  >
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto bg-white">
        {filter === 'meetings' ? (
          <table className="w-full min-w-[1000px] table-fixed border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className={`w-[17%] ${TH}`}>Claimant Name</th>
                <th className={`w-[22%] ${TH}`}>Email Address</th>
                <th className={`w-[13%] ${TH}`}>Contact Number</th>
                <th className={`w-[18%] ${TH}`}>Item</th>
                <th className={`w-[17%] ${TH}`}>Meeting Date/Time</th>
                <th className={`w-[13%] ${TH}`}>Archived On</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {pageRows.length > 0 ? (
                pageRows.map((c, index) => (
                  <tr
                    key={c.id}
                    className={`h-[56px] transition-colors ${
                      index % 2 === 0 ? 'bg-white' : 'bg-[#F6FAFF]'
                    } hover:bg-[#EAF4FF]`}
                  >
                    <td className={`${TD} font-bold text-[#0B6B8A]`}>
                      {toTitleCase(c.claimant_name) || '-'}
                    </td>
                    <td className={`${TD} text-slate-600 break-words`}>{c.claimant_email || '-'}</td>
                    <td className={`${TD} text-slate-600`}>{c.claimant_contact || '-'}</td>
                    <td className={`${TD} text-slate-700`}>
                      {toTitleCase(c.item_details?.title) || (c.item ? `Item #${c.item}` : '-')}
                    </td>
                    <td className={`${TD} text-slate-700`}>
                      <span className="block font-semibold">{c.meeting_date || '-'}</span>
                      <span className="block text-xs text-slate-500">{c.meeting_time || '-'}</span>
                    </td>
                    <td className={`${TD} text-slate-700`}>
                      {formatYMD(claimArchiveDate(c))}
                    </td>
                  </tr>
                ))
              ) : (
                <EmptyRow colSpan={6} label={emptyLabel} />
              )}
            </tbody>
          </table>
        ) : filter === 'users' ? (
          <table className="w-full min-w-[1000px] table-fixed border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className={`w-[10%] ${TH}`}>ID</th>
                <th className={`w-[22%] ${TH}`}>Name</th>
                <th className={`w-[26%] ${TH}`}>Email</th>
                <th className={`w-[16%] ${TH}`}>Contact No.</th>
                <th className={`w-[10%] ${TH}`}>Role</th>
                <th className={`w-[8%] ${TH}`}>Action</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {pageRows.length > 0 ? (
                pageRows.map((u, index) => (
                  <tr
                    key={u.id}
                    className={`h-[56px] transition-colors ${
                      index % 2 === 0 ? 'bg-white' : 'bg-[#F6FAFF]'
                    } hover:bg-[#EAF4FF]`}
                  >
                    <td className={TD}>
                      <span className="font-mono text-[11px] bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 text-slate-600 font-bold inline-block">
                        #U-{String(u.id).padStart(3, '0')}
                      </span>
                    </td>
                    <td className={`${TD} text-slate-700`}>
                      {toTitleCase(u.first_name)} {toTitleCase(u.last_name)}
                    </td>
                    <td className={`${TD} text-slate-600`}>{u.email}</td>
                    <td className={`${TD} text-slate-600`}>{u.contact_number || '-'}</td>
                    <td className={TD}>
                      <span className="text-[11px] font-black uppercase text-slate-700">
                        {u.role}
                      </span>
                    </td>
                    <td className="border border-gray-300 p-2 text-center align-middle">
                      <div className="flex justify-center items-center">
                        <RestoreButton
                          onClick={() => setRestoreTarget({ kind: 'user', record: u })}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <EmptyRow colSpan={6} label={emptyLabel} />
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[1000px] table-fixed border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className={`w-[12%] ${TH}`}>Ticket</th>
                <th className={`w-[18%] ${TH}`}>Item</th>
                <th className={`w-[14%] ${TH}`}>Category</th>
                <th className={`w-[16%] ${TH}`}>{filter === 'lost' ? 'Reported By' : 'Surrendered By'}</th>
                <th className={`w-[18%] ${TH}`}>Location</th>
                <th className={`w-[14%] ${TH}`}>{filter === 'lost' ? 'Date Lost' : 'Date Found'}</th>
                <th className={`w-[8%] ${TH}`}>Action</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {pageRows.length > 0 ? (
                pageRows.map((item, index) => (
                  <tr
                    key={item.id}
                    className={`h-[56px] transition-colors ${
                      index % 2 === 0 ? 'bg-white' : 'bg-[#F6FAFF]'
                    } hover:bg-[#EAF4FF]`}
                  >
                    <td className="border border-gray-300 p-2 text-center align-middle font-bold text-[#0B6B8A] text-xs">
                      {item.ticket_code || '-'}
                    </td>
                    <td className={`${TD} text-slate-700`}>{toTitleCase(item.title)}</td>
                    <td className={TD}>
                      <span className="text-[13px] uppercase text-[#2D366D]">
                        {toTitleCase(item.category) || '-'}
                      </span>
                    </td>
                    <td className={`${TD} text-slate-600`}>
                      {toTitleCase(item.poster_name) || '-'}
                    </td>
                    <td className={`${TD} text-slate-700`}>
                      <span className="whitespace-normal leading-tight block">
                        {toTitleCase(item.location) || '-'}
                      </span>
                    </td>
                    <td className={`${TD} text-slate-700`}>
                      <span className="block">{item.created_date || '-'}</span>
                      <span className="block">{item.created_time || '-'}</span>
                    </td>
                    <td className="border border-gray-300 p-2 text-center align-middle">
                      <div className="flex justify-center items-center">
                        <RestoreButton
                          onClick={() => setRestoreTarget({ kind: filter, record: item })}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <EmptyRow colSpan={7} label={emptyLabel} />
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalItems={rows.length}
        pageSize={ITEMS_PER_PAGE}
        onPageChange={setCurrentPage}
      />

      {restoreTarget && (
        <ConfirmModal
          message={restoreMessage()}
          confirmLabel="Restore"
          busy={restoring}
          onConfirm={handleConfirmRestore}
          onClose={() => setRestoreTarget(null)}
        />
      )}
    </div>
  );
};

const EmptyRow = ({ colSpan, label }) => (
  <tr>
    <td colSpan={colSpan} className="bg-white py-24 text-center">
      <div className="flex flex-col items-center justify-center gap-3">
        <span className="text-4xl font-black tracking-tighter text-[#071E3D] opacity-20">
          EMPTY
        </span>
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#7B8AA6]">{label}</p>
      </div>
    </td>
  </tr>
);

export default Archive;
