import React, { useEffect, useMemo, useState } from 'react';
import { FaRedo, FaTimes, FaExclamationCircle, FaLock } from 'react-icons/fa';
import { reclaimClaim, getBlockedSlots } from '../api/api';

// ==========================================================
// RE-CLAIM AFTER A MISSED MEETING
//
// Opened from My Claim Requests (or the board's "Re-claim" button) for a
// claim whose meeting day passed without the item being released
// ("Session Timed Out"). The claimant only picks a new date and time —
// their original ownership answers are reused as-is (they're shown here
// read-only), so they can't be changed. See reclaim_claim in
// backend/claim/views.py and backend/claim/noshow.py.
// ==========================================================
const MAX_MISSED = 3;

const WEEKDAY_SLOTS = [
  '8:00 AM - 9:00 AM',
  '9:00 AM - 10:00 AM',
  '10:00 AM - 11:00 AM',
  '11:00 AM - 12:00 PM',
  '1:00 PM - 2:00 PM',
  '2:00 PM - 3:00 PM',
  '3:00 PM - 4:00 PM',
  '4:00 PM - 5:00 PM',
];
const SATURDAY_SLOTS = WEEKDAY_SLOTS.slice(0, 3);

const slotsFor = (ymd) => {
  if (!ymd) return [];
  const d = new Date(`${ymd}T00:00:00`);
  if (isNaN(d.getTime())) return [];
  const day = d.getDay(); // 0 = Sunday
  if (day === 0) return [];
  if (day === 6) return SATURDAY_SLOTS;
  return WEEKDAY_SLOTS;
};

// Hides slots that already started when the chosen date is today.
const slotStillOpen = (ymd, slot) => {
  const today = new Date().toLocaleDateString('en-CA');
  if (ymd !== today) return true;
  const m = slot.split('-')[0].trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return true;
  let h = Number(m[1]);
  if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
  if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
  const start = new Date();
  start.setHours(h, Number(m[2]), 0, 0);
  return start > new Date();
};

const ReclaimModal = ({ claim, onClose, onDone }) => {
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingTime, setMeetingTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const today = new Date().toLocaleDateString('en-CA');
  const missed = (claim?.missed_meetings || 0) + 1; // this timed-out claim + earlier ones
  const left = Math.max(0, MAX_MISSED - missed);

  // Days / slots staff disabled in Claim Requests → Manage Slots.
  const [blocks, setBlocks] = useState([]);
  useEffect(() => {
    if (!meetingDate) {
      setBlocks([]);
      return;
    }
    let cancelled = false;
    getBlockedSlots({ date: meetingDate })
      .then((data) => !cancelled && setBlocks(Array.isArray(data) ? data : []))
      .catch(() => !cancelled && setBlocks([]));
    return () => {
      cancelled = true;
    };
  }, [meetingDate]);
  const dayBlock = blocks.find((b) => !b.time_slot) || null;

  const slots = useMemo(
    () =>
      dayBlock
        ? []
        : slotsFor(meetingDate).filter(
            (s) => slotStillOpen(meetingDate, s) && !blocks.some((b) => b.time_slot === s)
          ),
    [meetingDate, blocks, dayBlock]
  );

  // Drop a picked time that just became unavailable.
  useEffect(() => {
    if (meetingTime && !slots.includes(meetingTime)) setMeetingTime('');
  }, [slots, meetingTime]);

  const answers = [1, 2, 3, 4]
    .map((n) => ({ q: claim?.[`question_${n}`], a: claim?.[`answer_${n}`] }))
    .filter((x) => x.q);

  const submit = async () => {
    setError('');
    if (!meetingDate || !meetingTime) {
      setError('Please pick a new meeting date and time.');
      return;
    }
    try {
      setSaving(true);
      const created = await reclaimClaim(claim.id, {
        meeting_date: meetingDate,
        meeting_time: meetingTime,
      });
      onDone && onDone(created);
    } catch (err) {
      const data = err?.response?.data;
      setError(
        (typeof data?.detail === 'string' && data.detail) ||
          'Could not submit your re-claim. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  if (!claim) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-[#2D366D] px-6 py-4 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
              <FaRedo size={16} />
            </div>
            <div>
              <h3 className="text-lg font-bold">Re-claim Item</h3>
              <p className="text-xs text-white/80">
                {claim.item_details?.title || 'Item'} · pick a new meeting date and time
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
            aria-label="Close"
          >
            <FaTimes />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-5">
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <FaExclamationCircle className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-xs font-medium leading-relaxed text-amber-800">
              You missed your meeting on <b>{claim.meeting_date}</b>. Missed meetings for this item:{' '}
              <b>{missed} of {MAX_MISSED}</b>.{' '}
              {left > 0
                ? `If you miss ${left === 1 ? 'one more' : `${left} more`}, you'll have to claim this item in person at the Student Affairs Office.`
                : 'You can no longer claim this item online.'}
            </p>
          </div>

          {/* Previous answers — reused as-is */}
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              <FaLock size={10} /> Your previous answers (kept the same)
            </p>
            {answers.length ? (
              <ul className="space-y-1.5">
                {answers.map((x, i) => (
                  <li key={i} className="text-sm">
                    <span className="text-slate-500">{x.q}</span>{' '}
                    <span className="font-semibold text-slate-800">{x.a || '-'}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Your original claim details will be reused.</p>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-[#2D366D]">New meeting date</span>
              <input
                type="date"
                min={today}
                value={meetingDate}
                onChange={(e) => {
                  setMeetingDate(e.target.value);
                  setMeetingTime('');
                }}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#2D366D] focus:ring-4 focus:ring-[#2D366D]/15"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-[#2D366D]">New meeting time</span>
              <select
                value={meetingTime}
                onChange={(e) => setMeetingTime(e.target.value)}
                disabled={!meetingDate || slots.length === 0}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#2D366D] focus:ring-4 focus:ring-[#2D366D]/15 disabled:bg-slate-100"
              >
                <option value="">
                  {!meetingDate
                    ? 'Pick a date first'
                    : dayBlock
                    ? 'Unavailable on this day'
                    : slots.length === 0
                    ? 'No slots on this day'
                    : 'Select a time'}
                </option>
                {slots.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          {dayBlock && (
            <p className="text-[11px] font-semibold text-red-600">
              The Student Affairs Office isn't accepting claim meetings on this day
              {dayBlock.reason ? ` (${dayBlock.reason})` : ''}. Please choose another day.
            </p>
          )}
          <p className="text-[11px] text-slate-400">
            Monday to Friday 8:00 AM to 5:00 PM, Saturday 8:00 AM to 11:00 AM, no meetings on Sunday.
            Staff will review your re-claim before the meeting is confirmed.
          </p>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-xl border border-slate-300 bg-white py-2.5 font-semibold text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#2D366D] py-2.5 font-semibold text-white hover:bg-[#1E2755] disabled:opacity-60"
          >
            <FaRedo size={13} /> {saving ? 'Submitting...' : 'Submit Re-claim'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReclaimModal;
