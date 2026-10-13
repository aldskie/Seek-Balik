import React, { useMemo, useRef, useState } from "react";
import {
  FaDatabase,
  FaDownload,
  FaUpload,
  FaHistory,
  FaCheckCircle,
  FaExclamationTriangle,
  FaFileAlt,
  FaTimes,
  FaUndo,
} from "react-icons/fa";

import {
  API_URL,
  getItems,
  createLostItem,
  editLostItem,
  getClaims,
  getUsers,
  createUser,
  updateUserById,
  getAvailableSchedules,
  createAvailableSchedule,
  getLeaderboard,
  getPointsTracking,
  addPointsRecord,
  getLeaderboardSettings,
  updateLeaderboardSettings,
  getReportIssues,
  createReportIssue,
  updateReportIssue,
} from "../api/api";
import { useApp } from "../context/AppContext";
import { logActivity, getActivityLogs, importActivityLogs } from "../utils/Activitylog";
import { confirmAction } from "../components/ConfirmDialog";

// ==========================================================
// CONFIG
// ==========================================================

const BACKUP_APP_ID = "seek-balik-lost-and-found";
const BACKUP_VERSION = 1;

// Chrome / Edge can open a "Save as" window so the admin chooses the
// folder or drive for the backup file (needs a secure page: localhost or
// https). Other browsers fall back to a normal download.
const canPickSaveLocation =
  typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";
const BASE_URL = API_URL.replace(/\/$/, "");

// Question Bank uses its own fetch-based API (see QuestionBank.jsx).
async function questionApi(path, options = {}) {
  // Logged-in staff token: the server only lets Admin / Moderator change
  // questions, so a restore needs it.
  const token = localStorage.getItem("accessToken");
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = JSON.stringify(await res.json());
    } catch (_) {
      /* not JSON */
    }
    throw new Error(`Question API failed (${res.status}): ${detail}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

const getQuestions = () => questionApi("/questions/");

// Every section that goes into the backup file.
// `restorable: false` = saved in the backup but there is no API to write it back.
const SECTIONS = [
  { key: "items", label: "Lost & Found Items", fetch: getItems, restorable: true },
  { key: "claims", label: "Claim Requests", fetch: getClaims, restorable: false },
  { key: "users", label: "Users", fetch: getUsers, restorable: true },
  { key: "questions", label: "Question Bank", fetch: getQuestions, restorable: true },
  { key: "schedules", label: "Available Schedules", fetch: getAvailableSchedules, restorable: true },
  { key: "pointsTracking", label: "Points Tracking", fetch: getPointsTracking, restorable: true },
  { key: "leaderboard", label: "Leaderboard", fetch: getLeaderboard, restorable: false },
  { key: "leaderboardSettings", label: "Leaderboard Settings", fetch: getLeaderboardSettings, restorable: true },
  { key: "reportIssues", label: "Report Issues", fetch: getReportIssues, restorable: true },
  { key: "activityLogs", label: "Activity Logs", fetch: getActivityLogs, restorable: true },
];

const SECTION_BY_KEY = Object.fromEntries(SECTIONS.map((s) => [s.key, s]));

// Restore order: accounts before the records that point to them (issue
// reports, points), settings last.
const RESTORE_ORDER = [
  "users",
  "questions",
  "items",
  "schedules",
  "pointsTracking",
  "reportIssues",
  "leaderboardSettings",
  "activityLogs",
];

// Fields never sent back to the API (server-managed or file fields).
const SKIP_KEYS = [
  "id",
  "pk",
  "image",
  "images",
  "file",
  "screenshot",
  "created_at",
  "updated_at",
  "__backup_images",
];

// ==========================================================
// HELPERS
// ==========================================================

const toList = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (data && typeof data === "object") return [data];
  return [];
};


const scalarEntries = (rec) =>
  Object.entries(rec || {}).filter(
    ([k, v]) => !SKIP_KEYS.includes(k) && v !== null && v !== undefined && typeof v !== "object"
  );

const toPayload = (rec) => Object.fromEntries(scalarEntries(rec));

const toFormData = (rec) => {
  const fd = new FormData();
  scalarEntries(rec).forEach(([k, v]) => fd.append(k, v));
  return fd;
};

const errorText = (err) => {
  const data = err?.response?.data;
  if (data) return typeof data === "string" ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200);
  return err?.message || "Unknown error";
};

const formatBytes = (bytes) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

const timestampForFile = () => {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}`;
};

// ---------- item photos ----------
const resolveUrl = (path) =>
  path.startsWith("http") || path.startsWith("data:") ? path : `${BASE_URL}/${path.replace(/^\//, "")}`;

const imageUrlsOf = (item) => {
  const raw = item?.images || item?.image || item?.file;
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list
    .map((x) => (typeof x === "string" ? x : x?.image || x?.file || x?.url))
    .filter((x) => typeof x === "string" && x)
    .map(resolveUrl);
};

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const dataUrlToFile = async (dataUrl, name) => {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], name, { type: blob.type || "image/jpeg" });
};

// ---------- display ----------
const fullName = (u) => `${u.first_name || ""} ${u.last_name || ""}`.trim();

const describe = (sectionKey, rec) => {
  const id = rec?.id ?? rec?.pk;
  switch (sectionKey) {
    case "items":
      return {
        title: rec.title || rec.item_name || rec.name || `Item #${id}`,
        sub: [rec.type, rec.category, rec.status, rec.location].filter(Boolean).join(" • "),
      };
    case "users":
      return {
        title: fullName(rec) || rec.username || rec.email || `User #${id}`,
        sub: [rec.email, rec.role, rec.is_archived ? "Archived" : null].filter(Boolean).join(" • "),
      };
    case "questions":
      return { title: rec.text || `Question #${id}`, sub: rec.category || "" };
    case "claims":
      return {
        title: `Claim #${id}`,
        sub: [rec.item_title || rec.item, rec.status, rec.claimant_name || rec.email]
          .filter((x) => x !== null && x !== undefined && typeof x !== "object")
          .join(" • "),
      };
    case "activityLogs":
      return {
        title: `${rec.actor_name || "System"} — ${rec.action || ""}`,
        sub: [rec.target_title, rec.created_at && new Date(rec.created_at).toLocaleString()]
          .filter(Boolean)
          .join(" • "),
      };
    case "leaderboardSettings":
      return { title: "Leaderboard Settings", sub: scalarEntries(rec).slice(0, 4).map(([k, v]) => `${k}: ${v}`).join(" • ") };
    default: {
      const title = rec.title || rec.subject || rec.name || rec.student_name || rec.text || (id ? `Record #${id}` : "Record");
      const sub = scalarEntries(rec)
        .filter(([, v]) => v !== title)
        .slice(0, 3)
        .map(([, v]) => String(v))
        .join(" • ");
      return { title, sub };
    }
  }
};

// Is this backup record already in the live system?
const existsInSystem = (sectionKey, rec, current) => {
  if (!current) return false;
  if (sectionKey === "leaderboardSettings") return true;
  if (sectionKey === "activityLogs") return current.some((c) => c.id === rec.id);
  if (sectionKey === "users") {
    return current.some(
      (c) => (rec.id != null && c.id === rec.id) || (rec.email && c.email === rec.email)
    );
  }
  return rec.id != null && current.some((c) => c.id === rec.id);
};

// ==========================================================
// RESTORE ONE RECORD (returns a short message, throws on failure)
// ==========================================================

async function restoreRecord(sectionKey, rec, exists, current) {
  switch (sectionKey) {
    case "items": {
      if (exists) {
        await editLostItem(rec.id, toFormData(rec));
        return "Updated existing item with backup values";
      }
      const fd = toFormData(rec);
      const photos = rec.__backup_images || [];
      for (let i = 0; i < photos.length; i += 1) {
        const file = await dataUrlToFile(photos[i].dataUrl, photos[i].name || `photo-${i + 1}.jpg`);
        fd.append("image", file);
      }
      await createLostItem(fd);
      return photos.length ? `Re-created item with ${photos.length} photo(s)` : "Re-created item (no photo in backup)";
    }

    case "users": {
      // Admin accounts are never re-created or re-activated from a backup:
      // that would start the admin handover and could lock out the
      // current admin. Only their name/contact details are refreshed.
      const isAdminRecord = String(rec.role || "").toLowerCase() === "admin";
      if (isAdminRecord && !exists) {
        return "Admin account skipped (admins are never re-created from a backup)";
      }

      const payload = {
        username: rec.username,
        first_name: rec.first_name,
        last_name: rec.last_name,
        email: rec.email,
        contact_number: rec.contact_number,
        role: rec.role,
        is_active: rec.is_active,
        is_archived: rec.is_archived ?? false,
      };
      if (rec.student_id) payload.student_id = rec.student_id;
      if (isAdminRecord) {
        delete payload.role;
        delete payload.is_active;
        delete payload.is_archived;
      }
      Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

      if (exists) {
        const match = current.find((c) => c.id === rec.id) || current.find((c) => c.email === rec.email);
        await updateUserById(match.id, payload);
        return isAdminRecord ? "Updated admin's name/contact only" : "Updated existing account";
      }
      try {
        await createUser(payload);
      } catch (err) {
        // The account exists but isn't listed yet (not verified, or hasn't
        // logged in with its temporary password) - nothing to restore.
        const emailErr = err?.response?.data?.email;
        if (emailErr && /exist/i.test(String(emailErr))) {
          return "Already in system (not yet activated) — skipped";
        }
        throw err;
      }
      return "Re-created account";
    }

    case "questions": {
      const payload = {
        text: rec.text,
        category: rec.category,
        categories: rec.categories || [],
        is_default: !!rec.is_default,
        options: rec.options || [],
        option_groups: rec.option_groups || {},
      };
      if (exists) {
        await questionApi(`/questions/${rec.id}/`, { method: "PUT", body: JSON.stringify(payload) });
        return "Updated existing question";
      }
      await questionApi("/questions/", { method: "POST", body: JSON.stringify(payload) });
      return "Re-created question";
    }

    case "schedules": {
      if (exists) return "Already in system — skipped";
      await createAvailableSchedule(toPayload(rec));
      return "Re-created schedule";
    }

    case "pointsTracking": {
      if (exists) return "Already in system — skipped";
      await addPointsRecord(toPayload(rec));
      return "Re-created points record";
    }

    case "leaderboardSettings": {
      await updateLeaderboardSettings(toPayload(rec));
      return "Settings restored";
    }

    case "reportIssues": {
      if (exists) {
        await updateReportIssue(rec.id, toPayload(rec));
        return "Updated existing report";
      }
      // Restored as it was: original reporter, status, admin notes and
      // date (the backend accepts these only from an admin restore).
      const fd = toFormData(rec);
      ["id", "user", "screenshot", "reporter_name"].forEach((k) => fd.delete(k));
      fd.set("restore", "1");
      await createReportIssue(fd);
      return "Re-created report (original reporter, status and notes kept)";
    }

    case "activityLogs": {
      if (exists) return "Already in system — skipped";
      // Logs are kept on the server now; the original date is kept.
      await importActivityLogs([rec]);
      return "Log entry restored";
    }

    default:
      throw new Error("This section cannot be restored");
  }
}

// ==========================================================
// COMPONENT
// ==========================================================

const BackupRestore = () => {
  const { currentUser } = useApp() || {};
  const fileInputRef = useRef(null);

  // backup
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [includePhotos, setIncludePhotos] = useState(true);
  const [progressText, setProgressText] = useState("");
  const [lastBackup, setLastBackup] = useState(null);

  // restore
  const [selectedFile, setSelectedFile] = useState(null);
  const [backupData, setBackupData] = useState(null); // parsed JSON
  const [currentData, setCurrentData] = useState({}); // live system data, per section
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [results, setResults] = useState([]);

  const [status, setStatus] = useState({ type: "", message: "" });
  const showStatus = (type, message) => setStatus({ type, message });

  const actor = () => ({
    actor_name: currentUser?.first_name ? fullName(currentUser) : "Admin",
    actor_role: currentUser?.role || "admin",
  });

  // ========================================================
  // BACKUP — save everything as one JSON file
  //
  // Chrome / Edge: a "Save as" window opens so the admin picks where the
  // file goes — Downloads, Documents, a flash drive, etc. Other browsers
  // don't support that window, so the file goes to their usual Downloads
  // folder instead.
  // ========================================================
  const handleCreateBackup = async () => {
    if (
      !(await confirmAction({
        message: canPickSaveLocation
          ? "Create a full backup of all system records now? You'll choose where to save the file next (e.g. Downloads, Documents or a flash drive)."
          : "Download a full backup of all system records now? This may take a moment.",
        confirmLabel: canPickSaveLocation ? "Choose Location" : "Download Backup",
      }))
    ) {
      return;
    }

    const fileName = `system-backup_${timestampForFile()}.json`;

    // Ask for the location FIRST, while the browser still counts this as
    // the admin's click (it refuses to open the window after a long wait).
    // The file is also opened for writing right away: some browsers only
    // allow that straight after the Save window, not after the backup has
    // spent a while collecting records.
    let saveHandle = null;
    let writable = null;
    if (canPickSaveLocation) {
      try {
        saveHandle = await window.showSaveFilePicker({
          suggestedName: fileName,
          startIn: "downloads",
          types: [{ description: "Backup file (JSON)", accept: { "application/json": [".json"] } }],
        });
        writable = await saveHandle.createWritable();
      } catch (err) {
        if (err?.name === "AbortError") return; // admin closed the window
        console.warn("Could not save to the chosen location, downloading instead:", err);
        saveHandle = null;
        writable = null;
      }
    }

    setIsBackingUp(true);
    showStatus("", "");

    try {
      const data = {};
      const failed = [];

      for (const section of SECTIONS) {
        setProgressText(`Collecting ${section.label}...`);
        try {
          const res = await section.fetch();
          data[section.key] = section.key === "leaderboardSettings" ? res : toList(res);
        } catch (err) {
          data[section.key] = [];
          failed.push(section.label);
          console.error(`Backup: failed to fetch ${section.label}`, err);
        }
      }

      // Embed item photos so deleted items can be re-created with their pictures.
      let photoCount = 0;
      let photoFailed = 0;
      if (includePhotos && Array.isArray(data.items)) {
        for (let i = 0; i < data.items.length; i += 1) {
          setProgressText(`Saving item photos (${i + 1}/${data.items.length})...`);
          const urls = imageUrlsOf(data.items[i]);
          const photos = [];
          for (const url of urls) {
            try {
              const blob = await (await fetch(url)).blob();
              photos.push({
                name: decodeURIComponent(url.split("/").pop().split("?")[0]) || "photo.jpg",
                type: blob.type,
                dataUrl: await blobToDataUrl(blob),
              });
              photoCount += 1;
            } catch (_) {
              photoFailed += 1;
            }
          }
          if (photos.length) data.items[i] = { ...data.items[i], __backup_images: photos };
        }
      }

      const counts = Object.fromEntries(
        SECTIONS.map((s) => [s.key, toList(data[s.key]).length])
      );

      const backup = {
        meta: {
          app: BACKUP_APP_ID,
          version: BACKUP_VERSION,
          created_at: new Date().toISOString(),
          created_by: actor().actor_name,
          includes_photos: includePhotos,
          photo_count: photoCount,
          counts,
        },
        data,
      };

      setProgressText(saveHandle ? "Saving file..." : "Preparing download...");
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      let savedTo = "your Downloads folder";
      let wroteToChosen = false;
      if (writable) {
        try {
          await writable.write(blob);
          await writable.close();
          savedTo = `"${saveHandle.name}"`;
          wroteToChosen = true;
        } catch (err) {
          console.warn("Writing to the chosen location failed, downloading instead:", err);
          try { await writable.abort(); } catch (_) { /* already closed */ }
        }
      }
      if (!wroteToChosen) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }

      setLastBackup(new Date());
      logActivity({
        ...actor(),
        action: "created",
        target_title: "System Backup",
        details: `Saved a full system backup (${formatBytes(blob.size)})`,
      });

      const warnings = [];
      if (failed.length) warnings.push(`could not read: ${failed.join(", ")}`);
      if (photoFailed) warnings.push(`${photoFailed} photo(s) could not be saved`);

      showStatus(
        warnings.length ? "error" : "success",
        warnings.length
          ? `Backup saved to ${savedTo} (${formatBytes(blob.size)}), but ${warnings.join("; ")}.`
          : `Backup saved to ${savedTo} (${formatBytes(blob.size)}, ${photoCount} photos).`
      );
    } catch (err) {
      // Don't leave an empty file behind at the chosen location.
      if (writable) {
        try { await writable.abort(); } catch (_) { /* already closed */ }
      }
      showStatus("error", `Backup failed: ${errorText(err)}`);
    } finally {
      setIsBackingUp(false);
      setProgressText("");
    }
  };

  // ========================================================
  // RESTORE — load file, compare with live data
  // ========================================================
  const loadCurrentData = async (keys) => {
    const entries = await Promise.all(
      keys.map(async (key) => {
        try {
          return [key, toList(await SECTION_BY_KEY[key].fetch())];
        } catch (_) {
          return [key, []];
        }
      })
    );
    setCurrentData(Object.fromEntries(entries));
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".json")) {
      showStatus("error", "Invalid file type. Please select a .json backup file created by this system.");
      e.target.value = "";
      return;
    }

    setIsLoadingFile(true);
    showStatus("", "");
    setResults([]);

    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.meta?.app !== BACKUP_APP_ID || !parsed?.data) {
        throw new Error("This file is not a valid backup from this system.");
      }

      setSelectedFile(file);
      setBackupData(parsed);

      await loadCurrentData(SECTIONS.filter((s) => s.restorable).map((s) => s.key));
    } catch (err) {
      showStatus("error", err instanceof SyntaxError ? "The file is damaged or not valid JSON." : err.message);
      clearSelectedFile();
    } finally {
      setIsLoadingFile(false);
    }
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setBackupData(null);
    setResults([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ---------- what a full restore will do, per section ----------
  const restorePlan = useMemo(() => {
    if (!backupData) return [];
    return SECTIONS.map((section) => {
      const records = toList(backupData.data[section.key]);
      const existing = section.restorable
        ? records.filter((rec) => existsInSystem(section.key, rec, currentData[section.key])).length
        : 0;
      return {
        ...section,
        total: records.length,
        existing,
        missing: section.restorable ? records.length - existing : 0,
      };
    });
  }, [backupData, currentData]);

  const restorableTotal = restorePlan
    .filter((p) => p.restorable)
    .reduce((n, p) => n + p.total, 0);

  // ---------- run restore ----------
  const handleConfirmRestore = async () => {
    setShowConfirmModal(false);
    setIsRestoring(true);
    showStatus("", "");

    const out = [];
    for (const sectionKey of RESTORE_ORDER) {
      if (!SECTION_BY_KEY[sectionKey]?.restorable) continue;

      const records = toList(backupData.data[sectionKey]);
      for (let i = 0; i < records.length; i += 1) {
        const rec = records[i];

        const { title } = describe(sectionKey, rec);
        setProgressText(`Restoring ${SECTION_BY_KEY[sectionKey].label}: ${title}`);
        const exists = existsInSystem(sectionKey, rec, currentData[sectionKey]);

        try {
          const message = await restoreRecord(sectionKey, rec, exists, currentData[sectionKey] || []);
          out.push({ section: SECTION_BY_KEY[sectionKey].label, title, ok: true, message });
        } catch (err) {
          out.push({ section: SECTION_BY_KEY[sectionKey].label, title, ok: false, message: errorText(err) });
        }
      }
    }

    const okCount = out.filter((r) => r.ok).length;
    const failCount = out.length - okCount;

    logActivity({
      ...actor(),
      action: "restored",
      target_title: selectedFile?.name || "System Backup",
      details: `Restored all data from backup (${okCount} record(s)${failCount ? `, ${failCount} failed` : ""})`,
    });

    setResults(out);
    setProgressText("");
    setIsRestoring(false);
    showStatus(
      failCount ? "error" : "success",
      failCount
        ? `Restore finished: ${okCount} succeeded, ${failCount} failed. See details below.`
        : `Restore finished: ${okCount} record(s) restored successfully.`
    );

    // Refresh "In system / Missing" labels.
    loadCurrentData(SECTIONS.filter((s) => s.restorable).map((s) => s.key));
  };


  const busy = isBackingUp || isRestoring || isLoadingFile;

  // ========================================================
  // RENDER
  // ========================================================
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Backup & Restore</h1>
        <p className="text-sm text-slate-500">
          Save a complete copy of system records, or restore all data from a backup file.
        </p>
      </div>

      {/* Status Banner */}
      {status.message && (
        <div
          className={`flex items-center gap-2 rounded-xl border p-4 text-sm font-semibold ${
            status.type === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {status.type === "error" ? (
            <FaExclamationTriangle className="h-5 w-5 shrink-0" />
          ) : (
            <FaCheckCircle className="h-5 w-5 shrink-0" />
          )}
          <span className="flex-1">{status.message}</span>
          <button type="button" onClick={() => showStatus("", "")} className="opacity-60 transition hover:opacity-100">
            <FaTimes />
          </button>
        </div>
      )}

      {/* Progress */}
      {progressText && (
        <div className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm font-semibold text-[#0B6FA4]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#0B6FA4] border-t-transparent" />
          {progressText}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Export Backup Card */}
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-3 text-[#0B6FA4]">
            <FaDownload size={22} />
            <h2 className="text-lg font-bold text-slate-800">Export Backup</h2>
          </div>
          <p className="mb-4 text-xs leading-relaxed text-slate-500">
            Saves one JSON file containing all items, claim requests, users, question bank, schedules,
            points, leaderboard, report issues and activity logs.
          </p>

          <div
            className={`mb-4 rounded-xl border p-3 text-[11px] leading-relaxed ${
              canPickSaveLocation
                ? "border-sky-200 bg-sky-50 text-[#0B6FA4]"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            {canPickSaveLocation ? (
              <>
                <span className="font-bold">You choose where to save it.</span> A Save window opens so you can
                pick Downloads, Documents, Desktop or a plugged-in flash drive.
              </>
            ) : (
              <>
                <span className="font-bold">This browser saves to Downloads.</span> To pick a folder or flash
                drive, open this page in Chrome or Edge, or turn on "Ask where to save each file" in your
                browser's download settings.
              </>
            )}
          </div>

          <label className="mb-6 flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={includePhotos}
              onChange={(e) => setIncludePhotos(e.target.checked)}
              disabled={busy}
              className="h-4 w-4 accent-[#0B6FA4]"
            />
            Include item photos (larger file, lets deleted items be restored with their pictures)
          </label>

          <div className="mt-auto space-y-4">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <FaHistory className="text-slate-400" />
              <span>
                Last backup:{" "}
                <span className="font-semibold text-slate-700">
                  {lastBackup ? lastBackup.toLocaleString() : "No backup this session"}
                </span>
              </span>
            </div>

            <button
              type="button"
              onClick={handleCreateBackup}
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-xl bg-[#0B6FA4] px-5 py-2.5 text-xs font-bold uppercase text-white transition hover:bg-[#095882] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FaDatabase /> {isBackingUp ? "Generating..." : canPickSaveLocation ? "Save System Backup" : "Download System Backup"}
            </button>
          </div>
        </div>

        {/* Restore System Card */}
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-3 text-emerald-600">
            <FaUpload size={22} />
            <h2 className="text-lg font-bold text-slate-800">Restore System</h2>
          </div>
          <p className="mb-6 text-xs leading-relaxed text-slate-500">
            Open a backup file from anywhere — Downloads, Documents or a flash drive — then restore all of
            its data. Records that already exist are overwritten with the backup's values.
          </p>

          <div className="mt-auto space-y-4">
            {selectedFile && (
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <FaFileAlt className="shrink-0 text-emerald-600" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-700">{selectedFile.name}</p>
                  <p className="text-[11px] text-slate-400">
                    {formatBytes(selectedFile.size)}
                    {backupData?.meta?.created_at &&
                      ` • created ${new Date(backupData.meta.created_at).toLocaleString()}`}
                    {backupData?.meta?.created_by && ` by ${backupData.meta.created_by}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={clearSelectedFile}
                  disabled={busy}
                  className="text-slate-400 transition hover:text-red-500 disabled:opacity-50"
                  title="Remove file"
                >
                  <FaTimes />
                </button>
              </div>
            )}

            <label
              className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold uppercase text-white transition hover:bg-emerald-700 ${
                busy ? "pointer-events-none opacity-50" : ""
              }`}
            >
              <FaUpload /> {isLoadingFile ? "Reading file..." : selectedFile ? "Change Backup File" : "Select Backup File"}
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          </div>
        </div>
      </div>

      {/* ================= RESTORE ALL ================= */}
      {backupData && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-1 border-b border-slate-200 p-5">
            <h3 className="text-base font-bold text-slate-800">What will be restored</h3>
            <p className="text-xs text-slate-500">
              Everything in the backup is written back. Existing records are overwritten with the backup's
              values; records that were deleted are re-created.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-3">Data</th>
                  <th className="px-5 py-3 text-center">In backup</th>
                  <th className="px-5 py-3 text-center">Overwrite</th>
                  <th className="px-5 py-3 text-center">Re-create</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {restorePlan.map((p) => (
                  <tr key={p.key} className={p.restorable ? "" : "text-slate-400"}>
                    <td className="px-5 py-3 font-semibold text-slate-700">
                      {p.label}
                      {!p.restorable && (
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                          {p.key === "leaderboard" ? "rebuilt from Points Tracking" : "kept in file only"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-center font-bold text-slate-700">{p.total}</td>
                    <td className="px-5 py-3 text-center">{p.restorable ? p.existing : "—"}</td>
                    <td className="px-5 py-3 text-center">{p.restorable ? p.missing : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] leading-relaxed text-slate-500">
              Admin accounts are never re-created or re-activated from a backup, so the current admin can't be
              locked out. Records added after this backup was made are left as they are.
            </p>
            <button
              type="button"
              onClick={() => setShowConfirmModal(true)}
              disabled={busy || restorableTotal === 0}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold uppercase text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FaUndo /> {isRestoring ? "Restoring..." : `Restore All Data (${restorableTotal})`}
            </button>
          </div>
        </div>
      )}

      {/* ================= RESULTS ================= */}
      {results.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="mb-4 text-base font-bold text-slate-800">Restore Results</h3>
          <ul className="max-h-[300px] space-y-2 overflow-auto">
            {results.map((r, i) => (
              <li
                key={i}
                className={`flex items-start gap-3 rounded-xl border p-3 text-xs ${
                  r.ok ? "border-emerald-100 bg-emerald-50/60" : "border-red-100 bg-red-50/60"
                }`}
              >
                {r.ok ? (
                  <FaCheckCircle className="mt-0.5 shrink-0 text-emerald-600" />
                ) : (
                  <FaExclamationTriangle className="mt-0.5 shrink-0 text-red-600" />
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-slate-700">
                    {r.section}: {r.title}
                  </p>
                  <p className={`break-words ${r.ok ? "text-emerald-700" : "text-red-700"}`}>{r.message}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ================= CONFIRM MODAL ================= */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-6 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-[0_30px_80px_rgba(0,0,0,.25)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 text-amber-600">
              <FaExclamationTriangle size={28} />
            </div>

            <h3 className="mt-6 text-2xl font-bold text-[#154B70]">Restore All Data?</h3>

            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              All <span className="font-semibold text-slate-700">{restorableTotal} record(s)</span> in{" "}
              <span className="font-semibold text-slate-700">{selectedFile?.name}</span> will be restored.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Existing records will be <span className="font-semibold text-red-500">overwritten</span> with the
              backup's values — changes made since the backup will be lost. Deleted records will be re-created
              (they may get a new ID). This can't be undone, so save a fresh backup first if you're unsure.
            </p>

            <div className="mt-7 space-y-3">
              <button
                type="button"
                onClick={handleConfirmRestore}
                className="w-full rounded-xl bg-emerald-600 py-3 text-base font-bold uppercase text-white transition hover:bg-emerald-700 active:scale-[.98]"
              >
                Yes, Restore &amp; Overwrite
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="w-full rounded-xl border border-[#0B648D] py-3 font-semibold uppercase text-[#0B648D] transition hover:bg-blue-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BackupRestore;
