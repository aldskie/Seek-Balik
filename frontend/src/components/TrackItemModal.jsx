import { useState } from "react";
import { FaTimes, FaSearch, FaBan } from "react-icons/fa";
import { trackItem } from "../api/api";

const statusBadgeClass = (status) =>
  status === "Approved"
    ? "bg-green-100 text-green-700"
    : status === "Declined"
    ? "bg-red-100 text-red-700"
    : "bg-yellow-100 text-yellow-700";

// Ticket codes look like TKT-12-AB3F: "TKT", the item number, and 4
// letters/digits. Spaces and lower-case letters are tidied up first.
const TICKET_FORMAT = /^TKT-\d+-[A-Z0-9]{4}$/;
const normalizeTicket = (value) => String(value || "").replace(/\s+/g, "").toUpperCase();

export default function TrackItemModal({ onClose }) {
  const [ticketCode, setTicketCode] = useState("");
  const [item, setItem] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleTrack = async () => {
    if (!ticketCode || loading) return;

    const code = normalizeTicket(ticketCode);
    setError("");
    setItem(null);

    if (!TICKET_FORMAT.test(code)) {
      setError("Wrong ticket format. A ticket code looks like TKT-12-AB3F.");
      return;
    }

    setTicketCode(code);
    setLoading(true);

    try {
      const res = await trackItem(code);

      if (res.found) {
        setItem(res.item);
      } else {
        setError("No record found for this ticket code.");
      }
    } catch (err) {
      if (err?.response?.status === 404) {
        setError("No record found for this ticket code.");
      } else {
        setError("Unable to check the ticket right now. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleTrack();
    }
  };

  const isDeclined = item?.status === "Declined";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl max-h-[92vh] overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between bg-gradient-to-r from-[#0B648D] to-[#155F87] px-6 py-4 text-white shrink-0">
          <div>
            <h3 className="text-xl sm:text-2xl font-black font-sans">Track Item</h3>
            <p className="mt-1 text-sm text-white/90 font-sans">
              Enter your ticket code to check its current status.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
          >
            <FaTimes size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-6">
          {/* INPUT */}
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              value={ticketCode}
              onChange={(e) => setTicketCode(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter ticket code (e.g. TKT-1-1234)"
              autoFocus
              className="flex-1 border border-slate-300 rounded-xl px-4 py-3 outline-none text-sm font-semibold text-slate-700 placeholder:text-slate-400 placeholder:font-normal focus:border-[#155F87] focus:ring-2 focus:ring-[#0B648D]/20 font-sans"
            />

            <button
              onClick={handleTrack}
              disabled={loading || !ticketCode}
              className="flex items-center justify-center gap-2 bg-[#2D366D] text-white px-6 py-3 rounded-xl font-bold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed font-sans"
            >
              <FaSearch size={13} />
              {loading ? "Searching..." : "Track"}
            </button>
          </div>

          {/* ERROR */}
          {error && (
            <div className="mt-5 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm font-sans">
              {error}
            </div>
          )}

          {/* RESULT */}
          {item && (
            <div
              className={`mt-6 rounded-xl p-5 ${
                isDeclined ? "border border-red-200 bg-red-50" : "border border-slate-200 bg-slate-50"
              }`}
            >
              {/* HEADER */}
              <div className="flex justify-between items-center mb-4">
                <h2 className={`font-black font-sans ${isDeclined ? "text-red-700" : "text-[#2D366D]"}`}>
                  {isDeclined ? "Report Declined" : "Item Found"}
                </h2>

                <span
                  className={`text-xs px-3 py-1 rounded-full font-bold font-sans ${statusBadgeClass(item.status)}`}
                >
                  {item.status}
                </span>
              </div>

              {/* DECLINED NOTICE */}
              {isDeclined && (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-red-200 bg-white px-4 py-3">
                  <FaBan className="mt-0.5 shrink-0 text-red-500" size={16} />
                  <p className="text-sm font-medium text-red-700 font-sans">
                    This lost item report was reviewed and declined by an administrator or
                    moderator. If you believe this was a mistake, please contact the Lost &amp;
                    Found Office.
                  </p>
                </div>
              )}

              {/* DETAILS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-slate-700 font-sans">
                <div>
                  <p className="text-slate-400 text-xs uppercase">Title</p>
                  <p className="font-semibold">{item.title}</p>
                </div>

                <div>
                  <p className="text-slate-400 text-xs uppercase">Category</p>
                  <p className="font-semibold">{item.category}</p>
                </div>

                <div>
                  <p className="text-slate-400 text-xs uppercase">Location</p>
                  <p className="font-semibold">{item.location}</p>
                </div>

                <div>
                  <p className="text-slate-400 text-xs uppercase">Type</p>
                  <p className="font-semibold">{item.type}</p>
                </div>
              </div>

              {/* DATE + TIME */}
              <div className="mt-5 pt-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between text-sm font-sans">
                <div>
                  <p className="text-slate-400 text-xs uppercase">Date Logged</p>
                  <p className="font-semibold text-slate-700">
                    {item.created_date || "—"}
                  </p>
                </div>

                <div className="mt-3 sm:mt-0">
                  <p className="text-slate-400 text-xs uppercase">Time Logged</p>
                  <p className="font-semibold text-slate-700">
                    {item.created_time || "—"}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
