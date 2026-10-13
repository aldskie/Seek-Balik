import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiAlertTriangle,
  FiCalendar,
  FiChevronLeft,
  FiChevronRight,
  FiLock,
  FiSlash,
  FiUnlock,
  FiX,
} from "react-icons/fi";
import { createBlockedSlot, deleteBlockedSlot, getBlockedSlots } from "../api/api";
import { confirmAction } from "./ConfirmDialog";
import { logActivity } from "../utils/Activitylog";

// ==========================================================
// MANAGE SLOTS (calendar)
//
// Lets a moderator/admin disable claim meetings for a whole day or for
// single time slots when an urgent matter or event comes up. Disabled
// slots are saved on the server (claim BlockedSlot model), so:
//   - ClaimModal.jsx stops offering them to claimants, and
//   - the server rejects any claim / reclaim / staff schedule on them.
//
// Meetings that were ALREADY booked in a slot are not cancelled — the
// calendar shows how many there are so staff can reschedule them from
// the Schedule Meeting tab.
// ==========================================================

export const MEETING_TIME_SLOTS = [
  "8:00 AM - 9:00 AM",
  "9:00 AM - 10:00 AM",
  "10:00 AM - 11:00 AM",
  "11:00 AM - 12:00 PM",
  "1:00 PM - 2:00 PM",
  "2:00 PM - 3:00 PM",
  "3:00 PM - 4:00 PM",
  "4:00 PM - 5:00 PM",
];

// Saturdays: 8 AM - 11 AM only. Sundays: closed. (Server enforces the same.)
const SATURDAY_SLOTS = ["8:00 AM - 9:00 AM", "9:00 AM - 10:00 AM", "10:00 AM - 11:00 AM"];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const pad = (n) => String(n).padStart(2, "0");
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (key) => new Date(`${key}T00:00:00`);

export const slotsForDay = (dateKey) => {
  const day = fromKey(dateKey).getDay();
  if (day === 0) return [];
  if (day === 6) return SATURDAY_SLOTS;
  return MEETING_TIME_SLOTS;
};

const errorMessage = (err, fallback) => {
  const data = err?.response?.data;
  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (data.detail) return data.detail;
  const first = Object.values(data)[0];
  return Array.isArray(first) ? first[0] : first || fallback;
};

const safeLog = async (entry) => {
  try {
    await logActivity(entry);
  } catch (err) {
    console.error("Activity log error:", err);
  }
};

const ManageSlotsModal = ({ open, onClose, bookedClaims = [], onChanged, notify }) => {
  const todayKey = toKey(new Date());

  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedKey, setSelectedKey] = useState(todayKey);
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");

  const monthStart = toKey(month);
  const monthEnd = toKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getBlockedSlots({ start: monthStart, end: monthEnd });
      setBlocks(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load disabled slots:", err);
      notify?.("Couldn't load disabled slots.", "error");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStart, monthEnd]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // date -> { wholeDay: block|null, slots: { [time_slot]: block } }
  const blocksByDay = useMemo(() => {
    const map = {};
    blocks.forEach((b) => {
      const key = String(b.date).slice(0, 10);
      if (!map[key]) map[key] = { wholeDay: null, slots: {} };
      if (!b.time_slot) map[key].wholeDay = b;
      else map[key].slots[b.time_slot] = b;
    });
    return map;
  }, [blocks]);

  // date -> { total, [time_slot]: count } of meetings already booked.
  const bookedByDay = useMemo(() => {
    const map = {};
    bookedClaims.forEach((c) => {
      const key = String(c.meeting_date || "").slice(0, 10);
      if (!key) return;
      if (!map[key]) map[key] = { total: 0 };
      map[key].total += 1;
      map[key][c.meeting_time] = (map[key][c.meeting_time] || 0) + 1;
    });
    return map;
  }, [bookedClaims]);

  // Calendar cells: leading blanks + each day of the month.
  const cells = useMemo(() => {
    const out = [];
    for (let i = 0; i < month.getDay(); i += 1) out.push(null);
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    for (let d = 1; d <= days; d += 1) {
      out.push(toKey(new Date(month.getFullYear(), month.getMonth(), d)));
    }
    return out;
  }, [month]);

  if (!open) return null;

  const selectedDay = blocksByDay[selectedKey] || { wholeDay: null, slots: {} };
  const selectedBooked = bookedByDay[selectedKey] || { total: 0 };
  const selectedSlots = slotsForDay(selectedKey);
  const selectedIsPast = selectedKey < todayKey;
  const selectedIsSunday = selectedSlots.length === 0;
  const prettySelected = fromKey(selectedKey).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const afterChange = async () => {
    await load();
    onChanged?.();
  };

  const bookedWarning = (count) =>
    count > 0
      ? `\n\n${count} meeting${count > 1 ? "s are" : " is"} already booked here. They will NOT be cancelled — reschedule ${count > 1 ? "them" : "it"} from the Schedule Meeting tab.`
      : "";

  const disable = async (timeSlot = "") => {
    const count = timeSlot ? selectedBooked[timeSlot] || 0 : selectedBooked.total;
    const what = timeSlot ? `${timeSlot} on ${prettySelected}` : `the whole day of ${prettySelected}`;
    const ok = await confirmAction({
      title: "Disable Claiming",
      message: `Disable claim meetings for ${what}? Claimants won't be able to pick it.${bookedWarning(count)}`,
      confirmLabel: "Disable",
      tone: "danger",
    });
    if (!ok) return;

    try {
      setBusy(true);
      await createBlockedSlot({ date: selectedKey, time_slot: timeSlot, reason: reason.trim() });
      safeLog({
        action: "Disable Slot",
        details: `Disabled ${what}${reason.trim() ? ` — ${reason.trim()}` : ""}`,
      });
      notify?.(timeSlot ? "Time slot disabled." : "Whole day disabled.");
      await afterChange();
    } catch (err) {
      console.error(err);
      notify?.(errorMessage(err, "Couldn't disable the slot."), "error");
    } finally {
      setBusy(false);
    }
  };

  const enable = async (block) => {
    const what = block.time_slot ? `${block.time_slot} on ${prettySelected}` : `the whole day of ${prettySelected}`;
    const ok = await confirmAction({
      title: "Enable Claiming",
      message: `Re-enable claim meetings for ${what}?`,
      confirmLabel: "Enable",
    });
    if (!ok) return;

    try {
      setBusy(true);
      await deleteBlockedSlot(block.id);
      safeLog({ action: "Enable Slot", details: `Re-enabled ${what}` });
      notify?.("Slot enabled again.");
      await afterChange();
    } catch (err) {
      console.error(err);
      notify?.(errorMessage(err, "Couldn't enable the slot."), "error");
    } finally {
      setBusy(false);
    }
  };

  const shiftMonth = (delta) =>
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  const canGoBack =
    month.getFullYear() > new Date().getFullYear() ||
    (month.getFullYear() === new Date().getFullYear() && month.getMonth() > new Date().getMonth());

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#071E3D]/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-5xl max-h-[92vh] overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="bg-[#0B6B8A] px-6 py-5 text-white shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-black">
                <FiCalendar /> Manage Slots
              </h2>
              <p className="mt-1 text-xs text-white/80">
                Disable claiming for a day or a time slot when an urgent matter or event comes up.
              </p>
            </div>
            <button
              onClick={onClose}
              title="Close"
              aria-label="Close"
              className="rounded-full bg-white/10 p-2 hover:bg-white/20 transition-colors"
            >
              <FiX size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-[1.25fr_1fr]">
          {/* CALENDAR */}
          <div className="p-5 border-b lg:border-b-0 lg:border-r border-[#D8E2EF]">
            <div className="mb-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                disabled={!canGoBack}
                aria-label="Previous month"
                className="rounded-full p-2 text-[#0B6B8A] hover:bg-[#EAF4FF] disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <FiChevronLeft size={18} />
              </button>
              <p className="text-sm font-black uppercase tracking-[0.14em] text-[#071E3D]">
                {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                {loading && <span className="ml-2 text-[10px] font-semibold normal-case tracking-normal text-[#7B8AA6]">loading…</span>}
              </p>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                className="rounded-full p-2 text-[#0B6B8A] hover:bg-[#EAF4FF]"
              >
                <FiChevronRight size={18} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((w) => (
                <div key={w} className="pb-1 text-center text-[10px] font-black uppercase tracking-wider text-[#7B8AA6]">
                  {w}
                </div>
              ))}

              {cells.map((key, i) => {
                if (!key) return <div key={`blank-${i}`} />;
                const d = fromKey(key);
                const isPast = key < todayKey;
                const isSunday = d.getDay() === 0;
                const info = blocksByDay[key];
                const wholeDay = !!info?.wholeDay;
                const partial = info ? Object.keys(info.slots).length : 0;
                const booked = bookedByDay[key]?.total || 0;
                const isSelected = key === selectedKey;

                let tone = "bg-white border-[#D8E2EF] text-[#071E3D] hover:border-[#0B6B8A]";
                if (isSunday || isPast) tone = "bg-slate-50 border-slate-100 text-slate-300";
                if (wholeDay) tone = "bg-rose-50 border-rose-300 text-rose-700";
                else if (partial) tone = "bg-amber-50 border-amber-300 text-amber-800";

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedKey(key)}
                    className={`relative flex h-[64px] flex-col items-start justify-between rounded-lg border p-1.5 text-left transition-all ${tone} ${
                      isSelected ? "ring-2 ring-[#0B6B8A] ring-offset-1" : ""
                    }`}
                  >
                    <span className={`text-xs font-black ${key === todayKey ? "rounded-full bg-[#0B6B8A] px-1.5 text-white" : ""}`}>
                      {d.getDate()}
                    </span>
                    <span className="w-full space-y-0.5">
                      {wholeDay && (
                        <span className="block truncate text-[9px] font-black uppercase">Disabled</span>
                      )}
                      {!wholeDay && partial > 0 && (
                        <span className="block truncate text-[9px] font-black uppercase">
                          {partial} slot{partial > 1 ? "s" : ""} off
                        </span>
                      )}
                      {isSunday && !wholeDay && !partial && (
                        <span className="block truncate text-[9px] font-semibold uppercase">Closed</span>
                      )}
                      {booked > 0 && (
                        <span className="block truncate text-[9px] font-bold text-[#0B6B8A]">
                          {booked} booked
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-wrap gap-3 text-[10px] font-bold uppercase tracking-wide text-[#7B8AA6]">
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-rose-300 bg-rose-50" /> Whole day disabled</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-amber-300 bg-amber-50" /> Some slots disabled</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-slate-100 bg-slate-50" /> Past / Sunday</span>
            </div>
          </div>

          {/* SELECTED DAY */}
          <div className="p-5 space-y-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-[#7B8AA6]">Selected Day</p>
              <p className="text-base font-black text-[#071E3D]">{prettySelected}</p>
              {selectedBooked.total > 0 && (
                <p className="mt-0.5 text-xs font-semibold text-[#0B6B8A]">
                  {selectedBooked.total} meeting{selectedBooked.total > 1 ? "s" : ""} booked on this day
                </p>
              )}
            </div>

            {selectedIsPast ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs font-semibold text-slate-500">
                This day has already passed.
              </div>
            ) : selectedIsSunday ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs font-semibold text-slate-500">
                No meetings on Sundays — nothing to disable.
              </div>
            ) : (
              <>
                {/* Reason */}
                {!selectedDay.wholeDay && (
                  <div>
                    <label className="mb-1 block text-xs font-bold text-[#071E3D]">
                      Reason <span className="font-medium text-[#7B8AA6]">(optional, shown to claimants)</span>
                    </label>
                    <input
                      type="text"
                      value={reason}
                      maxLength={200}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="e.g. Foundation Day event, office meeting"
                      className="w-full rounded-xl border border-[#CBD8E8] p-2.5 text-sm outline-none focus:border-[#0B6B8A] focus:ring-2 focus:ring-[#0B6B8A]/20"
                    />
                  </div>
                )}

                {/* Whole day */}
                {selectedDay.wholeDay ? (
                  <div className="rounded-xl border border-rose-300 bg-rose-50 p-4">
                    <div className="flex items-start gap-3">
                      <FiSlash className="mt-0.5 shrink-0 text-rose-600" size={18} />
                      <div className="flex-1">
                        <p className="text-xs font-black uppercase tracking-wider text-rose-700">Whole day disabled</p>
                        {selectedDay.wholeDay.reason && (
                          <p className="mt-1 text-[12px] font-semibold text-rose-700/90">{selectedDay.wholeDay.reason}</p>
                        )}
                        {selectedDay.wholeDay.created_by && (
                          <p className="mt-1 text-[10px] text-rose-700/70">by {selectedDay.wholeDay.created_by}</p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => enable(selectedDay.wholeDay)}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0B6B8A] px-4 py-2.5 text-xs font-black uppercase text-white hover:bg-[#095A74] disabled:opacity-50"
                    >
                      <FiUnlock size={14} /> Enable whole day
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => disable("")}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black uppercase text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    <FiSlash size={14} /> Disable whole day
                  </button>
                )}

                {/* Per-slot */}
                <div>
                  <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-[#7B8AA6]">Time Slots</p>
                  <div className="space-y-1.5">
                    {selectedSlots.map((slot) => {
                      const block = selectedDay.slots[slot];
                      const off = !!selectedDay.wholeDay || !!block;
                      const booked = selectedBooked[slot] || 0;
                      return (
                        <div
                          key={slot}
                          className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                            off ? "border-rose-200 bg-rose-50/60" : "border-[#D8E2EF] bg-white"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className={`text-[13px] font-bold ${off ? "text-rose-700 line-through decoration-rose-300" : "text-[#071E3D]"}`}>
                              {slot}
                            </p>
                            <p className="truncate text-[10px] font-semibold text-[#7B8AA6]">
                              {block?.reason ? `${block.reason} · ` : ""}
                              {booked > 0 ? (
                                <span className={off ? "text-amber-700" : "text-[#0B6B8A]"}>
                                  {off && <FiAlertTriangle className="mr-0.5 inline" size={10} />}
                                  {booked} booked
                                </span>
                              ) : (
                                "No bookings"
                              )}
                            </p>
                          </div>
                          {selectedDay.wholeDay ? (
                            <span className="text-[10px] font-black uppercase text-rose-600">Off</span>
                          ) : block ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => enable(block)}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#0B6B8A] px-2.5 py-1.5 text-[10px] font-black uppercase text-[#0B6B8A] hover:bg-[#EAF4FF] disabled:opacity-50"
                            >
                              <FiUnlock size={12} /> Enable
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => disable(slot)}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rose-300 px-2.5 py-1.5 text-[10px] font-black uppercase text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                            >
                              <FiLock size={12} /> Disable
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {selectedBooked.total > 0 && (selectedDay.wholeDay || Object.keys(selectedDay.slots).length > 0) && (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] font-semibold text-amber-800">
                    Meetings already booked in a disabled slot aren't cancelled. Open them from the
                    Schedule Meeting tab to pick a new slot.
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManageSlotsModal;
