import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  Clock,
  PlusCircle,
  CheckCircle,
  XCircle,
  Trash2,
  Pencil,
  HandHeart,
  CalendarClock,
  Activity,
  User,
  UserPlus,
  UserX,
  UserCheck,
  Archive,
  Filter,
  Search,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import {
  getActivityLogs,
  ACTIVITY_LOG_UPDATE_EVENT,
  isStaffLog,
} from '../utils/Activitylog';
import Pagination from "../components/Pagination";

// Logs come from the server (utils/Activitylog.js -> backend "activity").

// NOTE: badgeStyle used to carry bg-*/text-*/border-* classes together,
// back when the Action column rendered as a bordered/filled pill. The
// Action cell no longer renders that box (see the table body below) —
// only the "text-*" class from each entry is pulled out and used, via
// actionTextClass() below. badgeStyle is kept as-is (rather than
// trimmed down to just a color) so nothing else that may reference it
// breaks, and so re-introducing the boxed look later is a one-line
// change in the table body, not a data migration.
const ACTION_META = {
  created: {
    label: 'Created',
    icon: PlusCircle,
    badgeStyle: 'bg-blue-50 text-blue-700 border-blue-200/80',
  },
  approved: {
    label: 'Approved',
    icon: CheckCircle,
    badgeStyle: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
  },
  declined: {
    label: 'Declined',
    icon: XCircle,
    badgeStyle: 'bg-amber-50 text-amber-700 border-amber-200/80',
  },
  claimed: {
    label: 'Claimed',
    icon: HandHeart,
    badgeStyle: 'bg-purple-50 text-purple-700 border-purple-200/80',
  },
  updated: {
    label: 'Updated',
    icon: Pencil,
    badgeStyle: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  edited: {
    label: 'Edited',
    icon: Pencil,
    badgeStyle: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  updated_lost: {
    label: 'Lost Item Updated',
    icon: Pencil,
    badgeStyle: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  edited_lost: {
    label: 'Lost Item Edited',
    icon: Pencil,
    badgeStyle: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  lost_updated: {
    label: 'Lost Item Updated',
    icon: Pencil,
    badgeStyle: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  lost_edited: {
    label: 'Lost Item Edited',
    icon: Pencil,
    badgeStyle: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  updated_found: {
    label: 'Surrendered Item Updated',
    icon: Pencil,
    badgeStyle: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  edited_found: {
    label: 'Surrendered Item Edited',
    icon: Pencil,
    badgeStyle: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  found_updated: {
    label: 'Surrendered Item Updated',
    icon: Pencil,
    badgeStyle: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  found_edited: {
    label: 'Surrendered Item Edited',
    icon: Pencil,
    badgeStyle: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  item_updated: {
    label: 'Item Updated',
    icon: Pencil,
    badgeStyle: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  item_edited: {
    label: 'Item Edited',
    icon: Pencil,
    badgeStyle: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  user_updated: {
    label: 'User Updated',
    icon: UserCheck,
    badgeStyle: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
  },
  user_edited: {
    label: 'User Edited',
    icon: UserCheck,
    badgeStyle: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
  },
  archived: {
    label: 'Archived',
    icon: Archive,
    badgeStyle: 'bg-amber-50 text-amber-700 border-amber-200/80',
  },
  lost_archived: {
    label: 'Lost Archived',
    icon: Archive,
    badgeStyle: 'bg-amber-50 text-amber-700 border-amber-200/80',
  },
  found_archived: {
    label: 'Surrendered Item Archived',
    icon: Archive,
    badgeStyle: 'bg-amber-50 text-amber-700 border-amber-200/80',
  },
  deleted: {
    label: 'Deleted',
    icon: Trash2,
    badgeStyle: 'bg-rose-50 text-rose-700 border-rose-200/80',
  },
  scheduled: {
    label: 'Scheduled',
    icon: CalendarClock,
    badgeStyle: 'bg-cyan-50 text-cyan-700 border-cyan-200/80',
  },
  user_added: {
    label: 'User Added',
    icon: UserPlus,
    badgeStyle: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
  },
  created_user: {
    label: 'User Added',
    icon: UserPlus,
    badgeStyle: 'bg-indigo-50 text-indigo-700 border-indigo-200/80',
  },
  user_archived: {
    label: 'User Archived',
    icon: UserX,
    badgeStyle: 'bg-amber-50 text-amber-700 border-amber-200/80',
  },
  archived_user: {
    label: 'User Archived',
    icon: UserX,
    badgeStyle: 'bg-amber-50 text-amber-700 border-amber-200/80',
  },
  restored: {
    label: 'Restored',
    icon: RotateCcw,
    badgeStyle: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
  },
};

// Role chip shown under "Performed By".
const ROLE_STYLE = {
  admin: 'bg-[#0B6B8A]/10 text-[#0B6B8A] border-[#0B6B8A]/20',
  moderator: 'bg-violet-50 text-violet-700 border-violet-200',
};

const roleOf = (log) => (log.performed_by_role || log.actor_role || '').toLowerCase();

const isToday = (dateInput) => {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return false;
  return d.toDateString() === new Date().toDateString();
};

const actionMeta = (action) =>
  ACTION_META[(action || '').toLowerCase()] || {
    label: action || 'Activity',
    icon: Activity,
    badgeStyle: 'bg-slate-100 text-slate-700 border-slate-200',
  };

// Some archive events were saved with action "deleted" but their details
// say "Archived ...". Show those as Archived (amber + archive icon).
// Works at display time, so old rows are fixed too.
const getLogMeta = (log) => {
  const action = (log.action || '').toLowerCase();
  const details = (log.details || '').toLowerCase();

  if (action === 'deleted' && details.includes('archiv')) {
    return ACTION_META.archived;
  }
  return actionMeta(log.action);
};

// Pulls just the "text-*" color class(es) out of a badgeStyle string,
// so the Action cell can color-code the icon/word without the
// bg-*/border-* classes that used to draw the pill/box around it.
const actionTextClass = (badgeStyle) =>
  (badgeStyle || '')
    .split(' ')
    .filter((cls) => cls.startsWith('text-'))
    .join(' ');

function formatRelativeTime(dateInput) {
  if (!dateInput) return '-';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '-';

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHr = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHr / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatExactTime(dateInput) {
  if (!dateInput) return '-';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '-';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const ActivityLogs = () => {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const listContainerRef = useRef(null);

  useEffect(() => {
    fetchLogs({ showLoading: true });

    const interval = setInterval(() => {
      fetchLogs({ showLoading: false });
    }, 5000);

    const handleUpdate = () => fetchLogs({ showLoading: false });
    window.addEventListener(ACTIVITY_LOG_UPDATE_EVENT, handleUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener(ACTIVITY_LOG_UPDATE_EVENT, handleUpdate);
    };
  }, []);

  async function fetchLogs({ showLoading = false } = {}) {
    try {
      if (showLoading) setLoading(true);
      const data = await getActivityLogs();
      const list = Array.isArray(data) ? data : data?.results || [];
      setLogs(list);
    } catch (error) {
      console.error('Error fetching activity logs:', error);
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  // Matches FoundItems.jsx / LostItems.jsx: smooth-scrolls the table back
  // to the top on every page change.
  const goToPage = (page) => {
    setCurrentPage(page);
    listContainerRef.current?.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  // Only admin / moderator activity is shown.
  const staffLogs = useMemo(() => logs.filter(isStaffLog), [logs]);

  const stats = useMemo(
    () => ({
      total: staffLogs.length,
      today: staffLogs.filter((l) => isToday(l.created_at)).length,
      admin: staffLogs.filter((l) => roleOf(l) === 'admin').length,
      moderator: staffLogs.filter((l) => roleOf(l) === 'moderator').length,
    }),
    [staffLogs]
  );

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...staffLogs]
      .filter((log) => {
        if (roleFilter !== 'ALL' && roleOf(log) !== roleFilter) return false;
        if (
          query &&
          ![log.actor_name, log.target_title, log.details, log.action]
            .join(' ')
            .toLowerCase()
            .includes(query)
        ) {
          return false;
        }

        const actionUpper = (log.action || '').toUpperCase();
        const detailsLower = (log.details || '').toLowerCase();
        const targetLower = (log.target_title || '').toLowerCase();

        // ALWAYS EXCLUDE LOGIN ACTIVITIES
        if (
          actionUpper === 'LOGIN' ||
          actionUpper === 'LOG_IN' ||
          actionUpper === 'USER_LOGIN' ||
          detailsLower.includes('logged in')
        ) {
          return false;
        }

        if (filter === 'ALL') return true;

        // General Edit/Update detection
        const isEditKeyword =
          actionUpper.includes('EDIT') ||
          actionUpper.includes('UPDATE') ||
          detailsLower.includes('updated') ||
          detailsLower.includes('edited') ||
          detailsLower.includes('modified');

        // Explicit User Edit detection (preventing false positives)
        const isUserSpecificEdit =
          actionUpper === 'USER_UPDATED' ||
          actionUpper === 'USER_EDITED' ||
          actionUpper === 'UPDATE_USER' ||
          actionUpper === 'EDIT_USER' ||
          actionUpper === 'USER_UPDATE' ||
          actionUpper === 'USER_EDIT' ||
          detailsLower.includes('user account') ||
          detailsLower.includes('user profile') ||
          detailsLower.includes('user role') ||
          detailsLower.includes('updated user') ||
          detailsLower.includes('edited user');

        if (filter === 'CLAIMED') return actionUpper === 'CLAIMED';
        if (filter === 'ARCHIVED') return actionUpper.includes('ARCHIV');

        if (filter === 'LOST_ADDED') {
          return (
            actionUpper === 'CREATED_LOST' ||
            actionUpper === 'LOST_CREATED' ||
            actionUpper === 'ADD_LOST' ||
            actionUpper === 'LOST' ||
            (actionUpper === 'CREATED' &&
              (detailsLower.includes('lost') || targetLower.includes('lost'))) ||
            detailsLower.includes('added lost') ||
            detailsLower.includes('created lost')
          );
        }

        if (filter === 'FOUND_ADDED') {
          return (
            actionUpper === 'CREATED_FOUND' ||
            actionUpper === 'FOUND_CREATED' ||
            actionUpper === 'ADD_FOUND' ||
            actionUpper === 'FOUND' ||
            (actionUpper === 'CREATED' &&
              (detailsLower.includes('found') || targetLower.includes('found') ||
                detailsLower.includes('surrender') || targetLower.includes('surrender'))) ||
            detailsLower.includes('added found') ||
            detailsLower.includes('created found') ||
            detailsLower.includes('added surrendered') ||
            detailsLower.includes('created surrendered')
          );
        }

        if (filter === 'LOST_ARCHIVED') {
          return (
            actionUpper === 'LOST_ARCHIVED' ||
            actionUpper === 'ARCHIVED_LOST' ||
            actionUpper === 'ARCHIVE_LOST' ||
            (actionUpper.includes('ARCHIV') &&
              (detailsLower.includes('lost') || targetLower.includes('lost'))) ||
            detailsLower.includes('archived lost')
          );
        }

        if (filter === 'FOUND_ARCHIVED') {
          return (
            actionUpper === 'FOUND_ARCHIVED' ||
            actionUpper === 'ARCHIVED_FOUND' ||
            actionUpper === 'ARCHIVE_FOUND' ||
            (actionUpper.includes('ARCHIV') &&
              (detailsLower.includes('found') || targetLower.includes('found') ||
                detailsLower.includes('surrender') || targetLower.includes('surrender'))) ||
            detailsLower.includes('archived found') ||
            detailsLower.includes('archived a surrendered')
          );
        }

        // --- ITEM EDIT / UPDATE FILTER ---
        if (filter === 'ITEM_EDITED') {
          return isEditKeyword && !isUserSpecificEdit;
        }

        // --- USER EDIT / UPDATE FILTER ---
        if (filter === 'USER_EDITED') {
          return isUserSpecificEdit;
        }

        if (filter === 'USER_ADDED') {
          return (
            actionUpper === 'USER_ADDED' ||
            actionUpper === 'CREATED_USER' ||
            actionUpper === 'ADD_USER' ||
            (actionUpper === 'CREATED' &&
              (detailsLower.includes('user') || targetLower.includes('user'))) ||
            detailsLower.includes('added user') ||
            detailsLower.includes('created user')
          );
        }

        if (filter === 'USER_ARCHIVED') {
          return (
            actionUpper === 'USER_ARCHIVED' ||
            actionUpper === 'ARCHIVED_USER' ||
            actionUpper === 'ARCHIVE_USER' ||
            (actionUpper.includes('ARCHIV') &&
              (detailsLower.includes('user') || targetLower.includes('user'))) ||
            detailsLower.includes('archived user')
          );
        }

        return actionUpper === filter;
      })
      .sort((a, b) => {
        const timeA = new Date(a.created_at).getTime() || 0;
        const timeB = new Date(b.created_at).getTime() || 0;
        return timeB - timeA;
      });
  }, [staffLogs, filter, roleFilter, search]);

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / ITEMS_PER_PAGE));

  // FIX: the filtered/refetched log list can shrink (a filter change, an
  // interval refetch that returns fewer rows, an item getting archived
  // out of the current view, etc.) while `currentPage` was still pointing
  // at a page that no longer exists — e.g. sitting on page 4 of 4, then
  // the list shrinks to 2 pages. Previously nothing corrected this, so
  // paginatedLogs.slice() below would silently return an empty array and
  // the table would show "No activity logs found" even though matching
  // logs existed on an earlier page. This clamps currentPage back down to
  // the new last page whenever totalPages shrinks past it.
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedLogs = filteredLogs.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  if (loading) {
    return (
      <div className="flex h-96 w-full items-center justify-center p-6 text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#0B6B8A] border-t-transparent" />
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Loading audit trails...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[18px] border border-[#D8E2EF] shadow-[0_8px_24px_rgba(45,54,109,0.08)] overflow-hidden flex flex-col h-[calc(100vh-130px)]">
      {/* Header */}
      <div className="bg-white px-6 sm:px-8 py-6 border-b border-[#D8E2EF] shrink-0">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-10 rounded-full bg-[#0B6B8A]" />
            <div>
              <h3 className="text-[22px] sm:text-xl font-black uppercase tracking-[0.18em] text-[#071E3D]">
                Activity Logs
              </h3>
              <p className="text-lg sm:text-base text-[#7B8AA6] italic mt-1">
                Actions performed by admins and moderators
              </p>
            </div>
          </div>

          {/* Filter Selector */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full xl:w-auto">
            <div className="relative w-full sm:w-[240px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#0B6B8A]" size={16} />
              <input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search name, item, details..."
                className="w-full pl-10 pr-4 py-3 border border-[#CBD8E8] rounded-full text-sm outline-none bg-white text-[#071E3D] placeholder:text-[#8A98B3] focus:ring-2 focus:ring-[#0B6B8A]/20 focus:border-[#0B6B8A]"
              />
            </div>

            <div className="relative w-full sm:w-[170px]">
              <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-[#0B6B8A]" size={16} />
              <select
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-10 pr-8 py-3 border border-[#CBD8E8] rounded-full text-sm font-bold outline-none bg-white text-[#071E3D] cursor-pointer appearance-none focus:ring-2 focus:ring-[#0B6B8A]/20 focus:border-[#0B6B8A]"
              >
                <option value="ALL">All Staff</option>
                <option value="admin">Admins</option>
                <option value="moderator">Moderators</option>
              </select>
              <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#0B6B8A] text-xs">
                ▼
              </div>
            </div>

            <div className="relative w-full sm:w-[250px]">
              <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-[#0B6B8A]" size={18} />
              <select
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-11 pr-8 py-3 border border-[#CBD8E8] rounded-full text-sm font-bold outline-none bg-white text-[#071E3D] cursor-pointer appearance-none focus:ring-2 focus:ring-[#0B6B8A]/20 focus:border-[#0B6B8A]"
              >
                <option value="ALL">All Activities</option>
                <option value="LOST_ADDED">Added Lost Items</option>
                <option value="FOUND_ADDED">Added Surrendered Items</option>
                <option value="ITEM_EDITED">Edited / Updated Items</option>
                <option value="LOST_ARCHIVED">Archived Lost Items</option>
                <option value="FOUND_ARCHIVED">Archived Surrendered Items</option>
                <option value="CLAIMED">Claimed Only</option>
                <option value="ARCHIVED">All Archives</option>
                <option value="USER_ADDED">Added Users</option>
                <option value="USER_EDITED">Edited / Updated Users</option>
                <option value="USER_ARCHIVED">Archived Users</option>
              </select>
              <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#0B6B8A] text-xs">
                ▼
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 border-b border-[#D8E2EF] bg-[#F8FBFE] px-6 py-4 sm:grid-cols-4 sm:px-8 shrink-0">
        {[
          { label: 'Total Activities', value: stats.total, tone: 'text-[#071E3D]' },
          { label: 'Today', value: stats.today, tone: 'text-emerald-600' },
          { label: 'By Admins', value: stats.admin, tone: 'text-[#0B6B8A]' },
          { label: 'By Moderators', value: stats.moderator, tone: 'text-violet-600' },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-[#D8E2EF] bg-white px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-[#7B8AA6]">{card.label}</p>
            <p className={`mt-1 text-xl font-black ${card.tone}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div ref={listContainerRef} className="overflow-auto bg-white flex-1">
        <table className="w-full min-w-[1000px] table-fixed border-collapse">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-[16%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[13px] font-black uppercase text-white">
                Date & Time
              </th>
              <th className="w-[12%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[13px] font-black uppercase text-white">
                Action
              </th>
              <th className="w-[18%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[13px] font-black uppercase text-white">
                Performed By
              </th>
              <th className="w-[20%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[13px] font-black uppercase text-white">
                Target Item / User
              </th>
              <th className="w-[34%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[13px] font-black uppercase text-white">
                Details
              </th>
            </tr>
          </thead>

          <tbody className="bg-white">
            {paginatedLogs.length > 0 ? (
              paginatedLogs.map((log, index) => {
                const meta = getLogMeta(log);
                const Icon = meta.icon;

                return (
                  <tr
                    key={log.id || index}
                    className={`h-[70px] ${
                      index % 2 === 0 ? 'bg-white' : 'bg-[#F6FAFF]'
                    } hover:bg-[#EAF4FF]`}
                  >
                    <td className="border border-gray-300 p-4 text-center align-middle text-slate-700 text-[14px]">
                      <span className="block font-semibold text-slate-800">
                        {formatExactTime(log.created_at)}
                      </span>
                      <span className="block text-xs text-slate-400 font-medium">
                        {formatRelativeTime(log.created_at)}
                      </span>
                    </td>

                    <td className="border border-gray-300 p-4 text-center align-middle">
                      {/* Plain color-coded icon + word — no pill/box
                          (no background, no border) around it anymore. */}
                      <span
                        className={`inline-flex items-center gap-1.5 text-[12px] font-black uppercase ${actionTextClass(
                          meta.badgeStyle
                        )}`}
                      >
                        <Icon size={14} />
                        {meta.label}
                      </span>
                    </td>

                    <td className="border border-gray-300 p-4 text-center align-middle text-slate-700 text-[14px]">
                      <span className="block font-bold text-slate-800">
                        {log.actor_name || 'System'}
                      </span>
                      {roleOf(log) && (
                        <span
                          className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${
                            ROLE_STYLE[roleOf(log)] || 'bg-slate-100 text-slate-500 border-slate-200'
                          }`}
                        >
                          <User size={10} /> {roleOf(log)}
                        </span>
                      )}
                    </td>

                    <td className="border border-gray-300 p-4 text-center align-middle text-[#0B6B8A] font-bold text-[14px]">
                      {log.target_title ? `"${log.target_title}"` : '-'}
                    </td>

                    <td className="border border-gray-300 p-4 text-center align-middle text-slate-600 text-[14px]">
                      {log.details || `${meta.label.toLowerCase()} an entry`}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="bg-white py-24 text-center text-[#7B8AA6] font-bold uppercase">
                  {search || roleFilter !== 'ALL' || filter !== 'ALL'
                    ? 'No activity logs match your filters'
                    : 'No admin or moderator activity yet'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalItems={filteredLogs.length}
        pageSize={ITEMS_PER_PAGE}
        onPageChange={goToPage}
      />
    </div>
  );
};

export default ActivityLogs;
