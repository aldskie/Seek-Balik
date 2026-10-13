import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FiAlertCircle,
  FiAward,
  FiBell,
  FiCalendar,
  FiCheck,
  FiCheckCircle,
  FiFileText,
  FiInbox,
  FiSearch,
  FiXCircle,
} from "react-icons/fi";
import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "../api/api";

// ==========================================================
// NOTIFICATION BELL
//
// Shared by every role: students/employees on the public board and
// admins/moderators on the dashboard header. Reads the logged-in
// account's own notifications from the backend `alerts` app, so each
// person only sees what was sent to them.
//
// onOpen(notification) is called when a notification is clicked — the
// page decides where to go (e.g. Claim Requests for staff, My Claim
// Requests for a student).
// ==========================================================

const POLL_MS = 20000;

const KIND_STYLE = {
  new_claim: { icon: FiInbox, color: "bg-sky-100 text-sky-700" },
  new_lost_report: { icon: FiSearch, color: "bg-indigo-100 text-indigo-700" },
  new_issue_report: { icon: FiAlertCircle, color: "bg-amber-100 text-amber-700" },
  claim_scheduled: { icon: FiCalendar, color: "bg-emerald-100 text-emerald-700" },
  claim_declined: { icon: FiXCircle, color: "bg-rose-100 text-rose-700" },
  claim_closed: { icon: FiXCircle, color: "bg-slate-100 text-slate-600" },
  lost_report_approved: { icon: FiCheckCircle, color: "bg-emerald-100 text-emerald-700" },
  lost_report_declined: { icon: FiXCircle, color: "bg-rose-100 text-rose-700" },
  item_claimed_points: { icon: FiAward, color: "bg-yellow-100 text-yellow-700" },
  issue_status: { icon: FiFileText, color: "bg-sky-100 text-sky-700" },
};

const timeAgo = (iso) => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr${h > 1 ? "s" : ""} ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} day${d > 1 ? "s" : ""} ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const NotificationBell = ({ tone = "dark", onOpen }) => {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const wrapRef = useRef(null);

  const refreshCount = useCallback(async () => {
    try {
      setUnread(await getUnreadNotificationCount());
    } catch {
      // Logged out / offline — keep the last count.
    }
  }, []);

  const loadList = useCallback(async (showSpinner = true) => {
    try {
      if (showSpinner) setLoading(true);
      setError(false);
      const data = await getNotifications();
      setItems(Array.isArray(data?.results) ? data.results : []);
      setUnread(data?.unread ?? 0);
    } catch (err) {
      console.error("Failed to load notifications:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Badge polling (also refreshes the open list).
  useEffect(() => {
    refreshCount();
    const id = setInterval(() => {
      if (document.hidden) return;
      if (open) loadList(false);
      else refreshCount();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [open, refreshCount, loadList]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) loadList();
  };

  const handleClick = async (n) => {
    if (!n.is_read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      try {
        const res = await markNotificationRead(n.id);
        if (typeof res?.unread === "number") setUnread(res.unread);
      } catch (err) {
        console.error("Failed to mark notification read:", err);
      }
    }
    setOpen(false);
    onOpen?.(n);
  };

  const markAll = async () => {
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
    setUnread(0);
    try {
      await markAllNotificationsRead();
    } catch (err) {
      console.error("Failed to mark all read:", err);
      loadList(false);
    }
  };

  // Solid white button so it stands out on the blue header; it turns
  // gold-ringed and the bell swings while there are unread notifications.
  const buttonTone =
    tone === "dark"
      ? `bg-white text-[#0B5F86] shadow-lg hover:bg-[#F1F7FB] ${
          unread > 0 ? "ring-2 ring-amber-300 ring-offset-2 ring-offset-[#005F86]" : "ring-1 ring-white/60"
        }`
      : `bg-white text-[#2D366D] border shadow-sm hover:shadow-md ${
          unread > 0 ? "border-amber-400 ring-2 ring-amber-200" : "border-slate-300"
        }`;

  return (
    <div ref={wrapRef} className="relative">
      <style>{`
        @keyframes sb-bell-swing {
          0%, 60%, 100% { transform: rotate(0); }
          8% { transform: rotate(18deg); }
          16% { transform: rotate(-16deg); }
          24% { transform: rotate(12deg); }
          32% { transform: rotate(-8deg); }
          40% { transform: rotate(4deg); }
        }
        .sb-bell-swing { animation: sb-bell-swing 2.4s ease-in-out infinite; transform-origin: 50% 10%; }
        @media (prefers-reduced-motion: reduce) { .sb-bell-swing { animation: none; } }
      `}</style>
      <button
        type="button"
        onClick={toggle}
        title={unread > 0 ? `${unread} unread notification${unread === 1 ? "" : "s"}` : "Notifications"}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className={`relative inline-flex h-11 w-11 items-center justify-center rounded-full transition-all active:scale-95 ${buttonTone}`}
      >
        <FiBell size={20} className={unread > 0 && !open ? "sb-bell-swing" : ""} />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[11px] font-black text-white ring-2 ring-white shadow">
              {unread > 99 ? "99+" : unread}
            </span>
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-x-4 top-24 z-[200] md:absolute md:inset-x-auto md:right-0 md:top-14 md:w-[380px] overflow-hidden rounded-2xl border border-[#D8E2EF] bg-white text-left shadow-2xl">
          <div className="flex items-center justify-between border-b border-[#E5ECF4] px-4 py-3">
            <div>
              <p className="text-sm font-black text-[#071E3D]">Notifications</p>
              <p className="text-[11px] text-[#7B8AA6]">{unread > 0 ? `${unread} unread` : "You're all caught up"}</p>
            </div>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-[#0B6B8A] hover:bg-[#EAF4FF]"
              >
                <FiCheck size={12} /> Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {loading && items.length === 0 ? (
              <p className="py-10 text-center text-xs font-semibold text-[#7B8AA6]">Loading…</p>
            ) : error && items.length === 0 ? (
              <p className="py-10 text-center text-xs font-semibold text-rose-600">Couldn't load notifications.</p>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-[#7B8AA6]">
                <FiBell size={26} className="opacity-40" />
                <p className="text-xs font-semibold">No notifications yet.</p>
              </div>
            ) : (
              items.map((n) => {
                const style = KIND_STYLE[n.kind] || { icon: FiBell, color: "bg-slate-100 text-slate-600" };
                const Icon = style.icon;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleClick(n)}
                    className={`flex w-full items-start gap-3 border-b border-[#F0F4F9] px-4 py-3 text-left transition-colors hover:bg-[#F6FAFF] ${
                      n.is_read ? "" : "bg-[#F0F7FF]"
                    }`}
                  >
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${style.color}`}>
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className={`text-[13px] leading-snug text-[#071E3D] ${n.is_read ? "font-semibold" : "font-black"}`}>
                          {n.title}
                        </span>
                        {!n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#0B6B8A]" />}
                      </span>
                      {n.body && (
                        <span className="mt-0.5 block text-[12px] leading-relaxed text-slate-600 line-clamp-3">{n.body}</span>
                      )}
                      <span className="mt-1 block text-[10px] font-semibold text-[#7B8AA6]">{timeAgo(n.created_at)}</span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
