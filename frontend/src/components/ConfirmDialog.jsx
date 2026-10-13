import React, { useEffect, useState } from "react";
import { AlertCircle, AlertTriangle } from "lucide-react";

// ==========================================================
// SHARED CONFIRMATION DIALOG
//
// Usage anywhere in the app:
//
//   import { confirmAction } from "../components/ConfirmDialog";
//
//   if (!(await confirmAction({ message: "Save these changes?" }))) return;
//
// Options: { title, message, confirmLabel, cancelLabel, tone: "default" | "danger" }
// Resolves true when the user confirms, false when they cancel.
//
// <ConfirmHost /> is mounted once in App.jsx. If it isn't mounted for some
// reason, confirmAction falls back to the browser's confirm box.
// ==========================================================

let enqueue = null;

export function confirmAction(options = {}) {
  const opts = typeof options === "string" ? { message: options } : options;
  if (!enqueue) {
    return Promise.resolve(window.confirm(opts.message || "Are you sure?"));
  }
  return new Promise((resolve) => enqueue({ ...opts, resolve }));
}

export function ConfirmHost() {
  const [queue, setQueue] = useState([]);

  useEffect(() => {
    enqueue = (request) => setQueue((q) => [...q, request]);
    return () => {
      enqueue = null;
    };
  }, []);

  const current = queue[0];

  useEffect(() => {
    if (!current) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  if (!current) return null;

  function close(result) {
    current.resolve(result);
    setQueue((q) => q.slice(1));
  }

  const danger = current.tone === "danger";
  const Icon = danger ? AlertTriangle : AlertCircle;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[28px] bg-white px-8 py-8 text-center shadow-2xl">
        <div
          className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full ${
            danger ? "bg-rose-50 text-rose-600" : "bg-[#EAF4F8] text-[#0B6B8A]"
          }`}
        >
          <Icon size={30} strokeWidth={2.5} />
        </div>

        <h5 className="mb-3 text-lg font-black text-[#144B70]">
          {current.title || "System Confirmation"}
        </h5>

        <p className="mx-auto mb-8 max-w-[300px] text-sm font-medium leading-6 text-[#5F6F8C]">
          {current.message || "Are you sure you want to continue?"}
        </p>

        <div className="space-y-3">
          <button
            type="button"
            autoFocus
            onClick={() => close(true)}
            className={`h-12 w-full rounded-xl text-sm font-black uppercase tracking-wide text-white shadow-md transition active:scale-[0.98] ${
              danger ? "bg-rose-600 hover:bg-rose-700" : "bg-[#0B6B8A] hover:bg-[#095A74]"
            }`}
          >
            {current.confirmLabel || "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => close(false)}
            className="h-12 w-full rounded-xl border border-[#0B6B8A] bg-white text-sm font-black uppercase tracking-wide text-[#0B6B8A] transition hover:bg-[#EAF4FF]"
          >
            {current.cancelLabel || "Cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmHost;
