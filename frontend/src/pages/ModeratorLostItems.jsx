import React, { useEffect, useState, useRef } from 'react';
import { Eye, Pencil, Archive, Trash2, CheckCircle, AlertCircle, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getItems, getItemById, API_URL, editLostItem, createLostItem, deleteLostItem } from "../api/api";
import PhotoUpload from '../components/PhotoUpload';
import { logActivity } from '../utils/Activitylog';
import Pagination from "../components/Pagination";
import { showToast } from "../utils/toast";

const AREAS = [
  'Grandstand',
  'Verbist Building',
  'Chapel',
  'Administrative Building (Main Building)',
  'Library',
  'Gymnasium',
  'ICT Center',
  'New Building (CEA Building)',
  'New Elementary Building',
  'SLC Canteen',
  'Old Elementary Building',
  'Conrado Dela Cruz Sports Center (CDC)',
  'Senior High School Department Building',
  'HM Laboratory Building',
  'Student Affairs Office Lobby',
  'Others'
];
// Same lists as LostItems.jsx and the backend ItemDetails choices.
const CATS = ['Accessories', 'ID', 'Academic Materials', 'Bags & Wallets', 'Clothing', 'Electronic', 'Keys'];
const STATUSES = ['Pending', 'Approved', 'Declined', 'Claimed'];

const statusColor = (s) =>
  s === 'Claimed' ? 'bg-purple-100 text-purple-500' :
  s === 'Pending' ? 'bg-orange-100 text-orange-500' :
  'bg-green-100 text-green-500';

const EMPTY = {
  title: '',
  category: 'Accessories',
  poster_name: '',
  location: 'SLC Canteen',
  created_date: '',
  created_time: '',
  description: '',
  status: 'Pending',
  image: null
};

function toTitleCase(text) {
  if (!text) return "";
  return text
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// ─── Item Modal (Add/Edit) ───────────────────────────────────────────────────
const ItemModal = ({ item, onSave, onClose }) => {
  const [saving, setSaving] = useState(false);

  const normalizeForm = (source) => {
    const base = source || EMPTY;
    const location = base.location || "SLC Canteen";

    if (location && !AREAS.includes(location)) {
      return {
        ...base,
        location: "Others",
        other_location: location,
      };
    }

    return {
      ...base,
      location,
      other_location: base.other_location || "",
    };
  };

  const [form, setForm] = useState(normalizeForm(item));
  const isEdit = !!item;

  useEffect(() => {
    setForm(normalizeForm(item));
  }, [item]);

  const set = (key, value) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
      ...(key === "location" && value !== "Others"
        ? { other_location: "" }
        : {}),
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;

    const today = new Date().toLocaleDateString("en-CA");

    if (form.created_date && form.created_date > today) {
      showToast("Date reported cannot be in the future.");
      return;
    }

    if (
      !form.title?.trim() ||
      !form.poster_name?.trim() ||
      !form.created_date?.trim() ||
      (form.location === "Others" && !form.other_location?.trim())
    ) {
      return;
    }

    setSaving(true);

    try {
      const payload = {
        ...form,
        location:
          form.location === "Others"
            ? form.other_location.trim()
            : form.location,
      };

      delete payload.other_location;
      await onSave(payload);
    } catch (error) {
      console.error("Error saving lost item:", error);
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoChange = (e) => {
    const { name, value, files } = e.target;
    set(name, files ? files[0] : value);
  };

  const inputClass =
    "h-11 w-full rounded-xl border border-slate-300 px-4 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#1478a7] disabled:bg-slate-100";
  const labelClass = "mb-2 block text-xs font-bold uppercase text-slate-700";
  const today = new Date().toLocaleDateString("en-CA");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-md bg-white shadow-2xl">
        <div className="flex items-start justify-between bg-gradient-to-r from-[#0B648D] to-[#155F87] px-6 py-3 text-white">
          <div>
            <h3 className="text-lg font-bold">
              {isEdit ? "Edit Lost Item" : "Add Lost Item"}
            </h3>
            <p className="mt-1 text-sm text-white/90">
              {isEdit ? "Update lost item details" : "Submit details for a lost item"}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-base text-white transition hover:bg-white/25"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form
          onSubmit={handleSave}
          className="max-h-[calc(92vh-88px)] overflow-y-auto px-6 py-5"
        >
          <div className="mx-auto max-w-3xl space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Item Name *</label>
                <input
                  className={inputClass}
                  value={form.title || ""} maxLength={30}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="e.g. Black Wallet"
                  required
                />
              </div>

              <div>
                <label className={labelClass}>Reported By *</label>
                <input
                  className={inputClass}
                  value={form.poster_name || ""}
                  onChange={(e) => set("poster_name", e.target.value)}
                  placeholder="Full name"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Category</label>
                <select
                  className={inputClass}
                  value={form.category || "Accessories"}
                  onChange={(e) => set("category", e.target.value)}
                >
                  {CATS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>Area Lost</label>
                <select
                  className={inputClass}
                  value={form.location || "SLC Canteen"}
                  onChange={(e) => set("location", e.target.value)}
                >
                  {AREAS.map((a) => (
                    <option key={a} value={a}>
                      {a === 'Others' ? 'Others (please specify)' : a}
                    </option>
                  ))}
                </select>

                {form.location === "Others" && (
                  <>
                    <p className="mt-2 mb-1 text-[11px] font-bold uppercase text-slate-500">If others, please specify *</p>
                    <input
                      className={inputClass}
                      value={form.other_location || ""}
                      onChange={(e) => set("other_location", e.target.value)}
                      placeholder="Please specify the area lost"
                      autoFocus
                      required
                    />
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Date Reported *</label>
                <input
                  className={inputClass}
                  type="date"
                  value={form.created_date || ""}
                  onChange={(e) => set("created_date", e.target.value)}
                  max={today}
                  required
                />
              </div>

              {!isEdit ? (
                <div>
                  <label className={labelClass}>Time Reported</label>
                  <input
                    className={inputClass}
                    type="time"
                    value={form.created_time || ""}
                    onChange={(e) => set("created_time", e.target.value)}
                  />
                </div>
              ) : (
                <div>
                  <label className={labelClass}>Status</label>
                  <select
                    className={inputClass}
                    value={form.status || "Pending"}
                    onChange={(e) => set("status", e.target.value)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div>
              <label className={labelClass}>Description</label>
              <textarea
                className="min-h-[88px] w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#1478a7]"
                rows={2}
                value={form.description || ""} maxLength={100}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Describe the item..."
              />
              <p className="mt-1 text-right text-[11px] font-semibold text-slate-400">{(form.description || "").length}/100</p>
            </div>

            {!isEdit && (
              <PhotoUpload
                name="image"
                value={form.image}
                onChange={handlePhotoChange}
              />
            )}

            <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
              <button
                type="submit"
                disabled={saving}
                className={`flex-1 py-3 rounded-xl text-white text-sm font-semibold uppercase tracking-wide shadow-md transition-all duration-200 ${
                  saving
                    ? "bg-slate-400 cursor-not-allowed opacity-70"
                    : "bg-gradient-to-b from-[#384388] to-[#2D366D] hover:from-[#44509B] hover:to-[#2D366D] hover:shadow-lg active:scale-[0.98]"
                }`}
              >
                {saving ? "Saving..." : isEdit ? "Save Changes" : "Add Item"}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="h-12 rounded-xl bg-slate-200 text-sm font-black uppercase tracking-wide text-slate-500 transition hover:bg-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Confirm Dialog ─────────────────────────────────────────────────────────
const ConfirmModal = ({ message, onConfirm, onClose }) => (
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
          onClick={onConfirm}
          className="h-12 w-full rounded-xl bg-[#0B6B8A] text-sm font-black uppercase tracking-wide text-white shadow-md transition hover:bg-[#095A74] active:scale-[0.98]"
        >
          Confirm
        </button>

        <button
          onClick={onClose}
          className="h-12 w-full rounded-xl border border-[#0B6B8A] bg-white text-sm font-black uppercase tracking-wide text-[#0B6B8A] transition hover:bg-[#EAF4F8]"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
);

// ─── LostItems Main Page ────────────────────────────────────────────────────
// Status tabs shown above the table (same as the admin Lost Items page).
const STATUS_FILTERS = ['Pending', 'Approved', 'Declined', 'Claimed'];
const inStatusTab = (status, tab) =>
  status === tab;

// Reason saved when a moderator declines a report — same wording as the
// admin Lost Items page.
const DEFAULT_DECLINE_REMARKS =
  'Your report could not be approved. Please visit the Student Affairs Office for more details.';

const LostItems = ({ currentFilter, role }) => {
  const { lostItems, addLostItem, updateLostItem } = useApp();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Pending');
  const [addOpen, setAddOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [editItem, setEditItem] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState(null);
  const [activeConfirmation, setActiveConfirmation] = useState(null);
  const [notificationMessage, setNotificationMessage] = useState(null);

  const tableContainerRef = useRef(null);

  useEffect(() => {
    fetchItems();

    const interval = setInterval(() => {
      fetchItems();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [currentFilter, statusFilter, search]);

  const goToPage = (page) => {
    setCurrentPage(page);
    tableContainerRef.current?.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  async function fetchItems() {
    try {
      const response = await getItems();
      setItems(response);
    } catch (error) {
      console.error('Error fetching items:', error);
    }
  }

  const getImageUrl = (img) => {
    if (!img) return null;
    const first = Array.isArray(img) ? img[0] : img;
    if (!first) return null;
    const path = typeof first === 'string' ? first : (first.image || first.file || first.url);
    if (!path) return null;
    return path.startsWith('http') ? path : `${API_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  };

  // Resolves EVERY photo attached to an item (not just the first one) so the
  // review modal can show all 1-3 uploaded photos instead of just one.
  const getImageUrls = (img) => {
    if (!img) return [];
    const list = Array.isArray(img) ? img : [img];
    return list
      .map((item) => {
        if (!item) return null;
        const path = typeof item === 'string' ? item : (item.image || item.file || item.url);
        if (!path) return null;
        return path.startsWith('http') ? path : `${API_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
      })
      .filter(Boolean);
  };

  async function handleView(item) {
    try {
      const response = await getItemById(item.id);
      let data = response;
      if (Array.isArray(response)) data = response[0];
      else if (response && response.results) data = response.results[0];

      setSelectedItem(data);
    } catch (error) {
      console.error("Error fetching item details:", error);
      setSelectedItem(item);
    }
  }

  async function handleEdit(item) {
    try {
      const response = await getItemById(item.id);
      let data = response;
      if (Array.isArray(response)) data = response[0];
      else if (response && response.results) data = response.results[0];

      setEditItem({
        ...data,
        created_date: data.created_date || '',
      });
    } catch (error) {
      console.error('Error fetching item for edit:', error);
      setEditItem({
        ...item,
        created_date: item.created_date || '',
      });
    }
  }

  async function handleSaveEdit(updatedForm) {
    try {
      const updatedItem = {
        ...editItem,
        ...updatedForm,
      };

      const formData = new FormData();
      formData.append('title', updatedItem.title || '');
      formData.append('poster_name', updatedItem.poster_name || '');
      formData.append('category', updatedItem.category || '');
      formData.append('location', updatedItem.location || '');
      formData.append('created_date', updatedItem.created_date || '');
      formData.append('created_time', updatedItem.created_time || '');
      formData.append('description', updatedItem.description || '');
      formData.append('status', updatedItem.status || '');

      await editLostItem(editItem.id, formData);

      showToast('Item updated successfully!');
      await fetchItems();
      setEditItem(null);
    } catch (error) {
      console.error('Error updating item:', error);
      showToast('Failed to update item. Please try again.');
    }
  }

  async function handleAddItem(form) {
    try {
      const formData = new FormData();
      formData.append('title', form.title);
      formData.append('category', form.category);
      formData.append('poster_name', form.poster_name);
      formData.append('location', form.location);
      formData.append('created_date', form.created_date);
      formData.append('created_time', form.created_time || '');
      formData.append('description', form.description || '');

      // Admin/Moderator reports skip Pending review and go straight to Approved
      const isStaff = ['admin', 'moderator'].includes((role || '').toLowerCase());
      formData.append('status', isStaff ? 'Approved' : 'Pending');

      if (Array.isArray(form.image)) {
        form.image.forEach((file) => {
          if (file instanceof File) formData.append('image', file);
        });
      } else if (form.image instanceof File) {
        formData.append('image', form.image);
      }

      await createLostItem(formData);

      logActivity({
        actor_name: form.poster_name,
        actor_role: isStaff ? (role || '').toLowerCase() : 'reporter',
        action: 'created',
        target_title: form.title,
        details: 'reported a lost item',
      });

      showToast(isStaff ? 'Item added and approved successfully!' : 'Item added successfully!');
      await fetchItems();
      setAddOpen(false);
    } catch (error) {
      console.error('Error adding item:', error);
      showToast('Failed to add item. Please try again.');
    }
  }

  async function handleUpdateStatus(item, newStatus) {
    try {
      // Only the status changes, so nothing else on the report is re-sent.
      const formData = new FormData();
      formData.append('status', newStatus);

      await editLostItem(item.id, formData);

      logActivity({
        action: newStatus.toLowerCase(),
        target_title: item.title,
        details: `marked "${item.title}" as ${newStatus}`,
      });

      setNotificationMessage(`Item marked as ${newStatus}.`);
      await fetchItems();
      setSelectedItem(null);
    } catch (error) {
      console.error('Error updating item status:', error);
      setNotificationMessage('Failed to update item status. Please try again.');
    }
  }

  // 'archived'  -> soft archive (status 'Archived'); record is kept and shows
  //               up on Utilities > Archive where it can be restored.
  // 'declined'  -> status 'Declined' with the automatic reason (same as the
  //               admin page), so it shows under the Declined tab.
  async function handleArchive(id, actionType = 'archived') {
    try {
      const target = items.find((i) => i.id === id);

      if (actionType === 'declined') {
        const formData = new FormData();
        formData.append('status', 'Declined');
        formData.append('declined_remarks', DEFAULT_DECLINE_REMARKS);
        await editLostItem(id, formData);
      } else {
        const formData = new FormData();
        formData.append('status', 'Archived');
        await editLostItem(id, formData);
      }

      logActivity({
        action: actionType,
        target_title: target?.title,
        details: target?.title
          ? `${actionType === 'declined' ? 'declined' : 'archived'} "${target.title}"`
          : `${actionType === 'declined' ? 'declined' : 'archived'} an item`,
      });

      setNotificationMessage(
        actionType === 'declined'
          ? 'Item declined. You can find it under the Declined tab.'
          : 'Item archived. You can find it in Utilities > Archive.'
      );
      await fetchItems();
      setSelectedItem(null);
      setActiveConfirmation(null);
    } catch (error) {
      console.error('Error archiving item:', error.response?.data || error.message || error);

      const serverMsg =
        error.response?.data?.detail ||
        (typeof error.response?.data === 'string' ? error.response.data : null);

      setNotificationMessage(serverMsg || 'Failed to archive item. Please try again.');
    }
  }

  // Shared by the filtered table and the per-tab counts below.
  const matchesSearch = (item) => {
    const searchText = search.toLowerCase();
    return (
      item.title?.toLowerCase().includes(searchText) ||
      item.category?.toLowerCase().includes(searchText) ||
      item.poster_name?.toLowerCase().includes(searchText) ||
      item.location?.toLowerCase().includes(searchText) ||
      item.status?.toLowerCase().includes(searchText)
    );
  };

  const filteredLost = items
    .filter((item) =>
      item.type?.toUpperCase() === 'LOST' &&
      inStatusTab(item.status, statusFilter) &&
      matchesSearch(item)
    )
    .sort((a, b) => b.id - a.id);

  const statusCounts = STATUS_FILTERS.reduce((acc, s) => {
    acc[s] = items.filter(
      (item) => item.type?.toUpperCase() === 'LOST' && inStatusTab(item.status, s) && matchesSearch(item)
    ).length;
    return acc;
  }, {});

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(filteredLost.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedItems = filteredLost.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const getVisiblePages = () => {
    const maxVisiblePages = 5;
    if (totalPages <= maxVisiblePages) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }
    let startPage = currentPage < maxVisiblePages ? 1 : currentPage - 3;
    let endPage = startPage + maxVisiblePages - 1;

    if (endPage > totalPages) {
      endPage = totalPages;
      startPage = totalPages - maxVisiblePages + 1;
    }
    return Array.from(
      { length: endPage - startPage + 1 },
      (_, index) => startPage + index
    );
  };

  const visiblePages = getVisiblePages();

  return (
    <div className="bg-white rounded-[18px] border border-[#D8E2EF] shadow-[0_8px_24px_rgba(45,54,109,0.08)] overflow-hidden flex flex-col h-[calc(100vh-135px)]">

        {/* Header */}
        <div className="bg-white px-6 sm:px-8 py-4 border-b border-[#D8E2EF] shrink-0">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 shrink-0">
            <div>
              <div className="flex items-center gap-3">
                
                <div>
                  <h3 className="text-base sm:text-lg font-black uppercase tracking-[0.16em] text-[#071E3D]">
                    Lost Items
                  </h3>
                  <p className="text-xs sm:text-sm text-[#7B8AA6] italic mt-0.5">
                    Manage all reported lost items within the campus
                  </p>
                </div>
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
                  placeholder="Search lost items..."
                  className="w-full pl-10 pr-4 py-2.5 border border-[#CBD8E8] rounded-full text-sm outline-none bg-white text-[#071E3D] placeholder:text-[#8A98B3] focus:ring-2 focus:ring-[#0B6B8A]/20 focus:border-[#0B6B8A] transition-all"
                />
              </div>

              <button
                onClick={() => setAddOpen(true)}
                className="px-6 py-2.5 rounded-full bg-[#2D366D] text-white font-black uppercase tracking-[0.1em] text-xs shadow-[0_6px_14px_rgba(45,54,109,0.25)] hover:bg-[#24305C] transition-all whitespace-nowrap"
              >
                📋 Add Lost Item
              </button>
            </div>
          </div>
        </div>

        {/* Status Filter Switch — sliding pill toggle, aligned to the right
            (same as the admin Lost Items page). */}
        <div className="flex items-center justify-end border-b border-[#D8E2EF] bg-white px-6 sm:px-8 py-3 shrink-0">
          <div className="relative inline-flex rounded-full bg-slate-100 p-1">
            {/* Sliding indicator that moves behind the active label */}
            <div
              className="absolute inset-y-1 rounded-full bg-[#0B6B8A] shadow-md transition-all duration-300 ease-out"
              style={{
                width: `calc(${100 / STATUS_FILTERS.length}% - 4px)`,
                left: `calc(${(100 / STATUS_FILTERS.length) * STATUS_FILTERS.indexOf(statusFilter)}% + 2px)`,
              }}
            />

            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`relative z-10 whitespace-nowrap rounded-full px-5 py-1.5 text-xs font-black uppercase tracking-wide transition-colors duration-300 ${
                  statusFilter === s ? "text-white" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {s}
                <span className={`ml-1.5 ${statusFilter === s ? "text-white/80" : "text-slate-400"}`}>
                  ({statusCounts[s] ?? 0})
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Table Content */}
        <div ref={tableContainerRef} className="flex-1 overflow-auto bg-white">
          <table className="w-full min-w-[1000px] table-fixed border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="w-[12%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Ticket</th>
                <th className="w-[15%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Item Name</th>
                <th className="w-[12%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Category</th>
                <th className="w-[16%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Reported By</th>
                <th className="w-[16%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Area</th>
                <th className="w-[12%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Date</th>
                <th className="w-[9%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Status</th>
                <th className="w-[8%] bg-[#0B6B8A] p-4 border border-gray-300 text-center text-[11px] font-black uppercase text-white">Action</th>
              </tr>
            </thead>

            <tbody className="bg-white">
              {paginatedItems.length > 0 ? (
                paginatedItems.map((item, index) => (
                  <tr key={item.id} className={`h-[56px] transition-colors ${index % 2 === 0 ? "bg-white" : "bg-[#F6FAFF]"} hover:bg-[#EAF4FF]`}>
                    <td className="border border-gray-300 p-2 text-center align-middle font-bold text-[#0B6B8A] text-xs">{item.ticket_code}</td>
                    <td className="border border-gray-300 p-4 text-center align-middle text-slate-700 text-[13px]">{toTitleCase(item.title)}</td>
                    <td className="border border-gray-300 p-4 text-center align-middle">
                      <span className="inline-flex items-center justify-center px-3 py-1 text-[13px] uppercase text-[#2D366D]">
                        {toTitleCase(item.category) || '-'}
                      </span>
                    </td>
                    <td className="border border-gray-300 p-4 text-center align-middle text-slate-600 text-[13px]">{toTitleCase(item.poster_name) || '-'}</td>
                    <td className="border border-gray-300 p-4 text-center align-middle text-slate-700 text-[13px]">
                      <div className="flex items-center justify-center whitespace-normal leading-tight">
                        <span>{toTitleCase(item.location) || '-'}</span>
                      </div>
                    </td>
                    <td className="border border-gray-300 p-4 text-center align-middle text-slate-700 text-[13px]">
                      <span className="block">{item.created_date || '-'}</span>
                      <span className="block">{item.created_time || '-'}</span>
                    </td>
                    <td className="border border-gray-300 p-4 text-center align-middle">
                      <span className={`rounded px-3 py-1 text-[10px] font-black uppercase ${statusColor(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="border border-gray-300 p-2 text-center align-middle">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleView(item)}
                          title="Review Item"
                          className="inline-flex h-8 w-8 items-center justify-center rounded bg-[#0B6B8A] text-white transition hover:bg-[#095A74]"
                        >
                          <Eye size={16} />
                        </button>

                        <button
                          onClick={() => handleEdit(item)}
                          title="Edit Item"
                          className="inline-flex h-8 w-8 items-center justify-center rounded bg-[#2D366D] text-white transition hover:opacity-90"
                        >
                          <Pencil size={16} />
                        </button>

                        <button
                          onClick={() => setActiveConfirmation({
                            text: `Are you sure you want to archive "${item.title}"?`,
                            action: () => handleArchive(item.id)
                          })}
                          title="Archive Item"
                          className="inline-flex h-8 w-8 items-center justify-center rounded bg-amber-600 text-white transition hover:bg-amber-700"
                        >
                          <Archive size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="bg-white py-24 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <span className="text-4xl font-black tracking-tighter text-[#071E3D] opacity-20">
                        EMPTY
                      </span>
                      <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#7B8AA6]">
                        {search
                          ? `No ${statusFilter.toLowerCase()} items found for "${search}"`
                          : `No ${statusFilter.toLowerCase()} items found`}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <Pagination
          currentPage={currentPage}
          totalItems={filteredLost.length}
          pageSize={ITEMS_PER_PAGE}
          onPageChange={goToPage}
        />

      {/* Add Item Modal */}
      {addOpen && (
        <ItemModal
          item={null}
          onSave={handleAddItem}
          onClose={() => setAddOpen(false)}
        />
      )}

      {/* Edit Item Modal */}
      {editItem && (
        <ItemModal
          item={editItem}
          onSave={handleSaveEdit}
          onClose={() => setEditItem(null)}
        />
      )}

      {/* Review Modal */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedItem(null);
          }}
        >
          <div className="w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-md bg-white shadow-2xl">
            <div className="flex items-start justify-between bg-gradient-to-r from-[#0B648D] to-[#155F87] px-6 py-3 text-white">
              <div>
                <h3 className="text-lg font-bold">Item Review</h3>
                <p className="mt-1 text-sm text-white/90">
                  Review lost item details before approval
                </p>
              </div>

              <button
                onClick={() => setSelectedItem(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[calc(92vh-88px)] overflow-y-auto px-6 py-5">
              <div className="mx-auto max-w-3xl space-y-4">
                {(() => {
                  const imgs = getImageUrls(selectedItem.images || selectedItem.image || selectedItem.file);
                  if (imgs.length === 0) {
                    return (
                      <img
                        src="https://via.placeholder.com/900x500?text=No+Image"
                        className="h-72 w-full rounded-xl border border-slate-200 bg-slate-100 object-cover"
                        alt="No Item"
                      />
                    );
                  }
                  if (imgs.length === 1) {
                    return (
                      <img
                        src={imgs[0]}
                        className="h-72 w-full rounded-xl border border-slate-200 bg-slate-100 object-cover"
                        alt="Item Preview"
                      />
                    );
                  }
                  return (
                    <div className="grid grid-cols-3 gap-2">
                      {imgs.map((src, idx) => (
                        <img
                          key={idx}
                          src={src}
                          className="h-40 w-full rounded-xl border border-slate-200 bg-slate-100 object-cover"
                          alt={`Item Preview ${idx + 1}`}
                        />
                      ))}
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 block text-xs font-bold uppercase text-slate-700">Item Name</p>
                    <div className="min-h-11 rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700">
                      {toTitleCase(selectedItem.title) || '-'}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 block text-xs font-bold uppercase text-slate-700">Reported By</p>
                    <div className="min-h-11 rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-700">
                      {toTitleCase(selectedItem.poster_name) || '-'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 block text-xs font-bold uppercase text-slate-700">Category</p>
                    <div className="min-h-11 rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-700">
                      {toTitleCase(selectedItem.category) || '-'}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 block text-xs font-bold uppercase text-slate-700">Area Lost</p>
                    <div className="min-h-11 rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-700">
                      {toTitleCase(selectedItem.location) || '-'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 block text-xs font-bold uppercase text-slate-700">Date Reported</p>
                    <div className="min-h-11 rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-700">
                      <div><span className="font-semibold">Start:</span> {selectedItem.created_date || '-'}{selectedItem.created_time ? ` · ${String(selectedItem.created_time).slice(0, 5)}` : ''}</div>
                      {(selectedItem.end_date || selectedItem.end_time) && (
                        <div><span className="font-semibold">End:</span> {selectedItem.end_date || selectedItem.created_date}{selectedItem.end_time ? ` · ${String(selectedItem.end_time).slice(0, 5)}` : ''}</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 block text-xs font-bold uppercase text-slate-700">Status</p>
                    <div className="min-h-11 rounded-xl border border-slate-300 px-4 py-3 text-sm font-bold text-slate-700">
                      <span className={`inline-block rounded px-3 py-1 text-xs font-black uppercase ${statusColor(selectedItem.status)}`}>
                        {selectedItem.status}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="mb-2 block text-xs font-bold uppercase text-slate-700">Description</p>
                  <div className="min-h-[80px] w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-700">
                    {selectedItem.description || 'No description provided.'}
                  </div>
                </div>

                {selectedItem.status === 'Approved' && (
                  <div className="flex items-center gap-4 rounded-xl border border-green-200 bg-green-50 p-4">
                    <div className="rounded-xl bg-green-500 p-2 text-white shadow-md">
                      <CheckCircle size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-black uppercase text-green-700">Item Publicly Visible</p>
                      <p className="text-xs font-bold uppercase text-green-600">
                        This item has been approved and is now visible to users.
                      </p>
                    </div>
                  </div>
                )}

                {/* Review Action Controls — gated by current status */}
                <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
                  {selectedItem.status === 'Pending' ? (
                    <>
                      <button
                        onClick={() => setActiveConfirmation({
                          text: "Are you sure you want to approve this item?",
                          action: () => handleUpdateStatus(selectedItem, 'Approved')
                        })}
                        className="flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#384388] to-[#2D366D] text-sm font-semibold uppercase tracking-wide text-white shadow-md transition-all duration-200 hover:from-[#44509B] hover:to-[#2D366D] hover:shadow-lg active:scale-[0.98]"
                      >
                        <CheckCircle size={18} />
                        Approve Item
                      </button>
                      <button
                        onClick={() => setActiveConfirmation({
                          text: "Are you sure you want to decline and remove this item?",
                          action: () => handleArchive(selectedItem.id, 'declined')
                        })}
                        className="flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-200 text-sm font-black uppercase tracking-wide text-slate-500 transition hover:bg-slate-300"
                      >
                        <AlertCircle size={18} />
                        Decline
                      </button>
                    </>
                  ) : (
                    <>
                      {selectedItem.status === 'Approved' && (
                        <button
                          onClick={() => setActiveConfirmation({
                            text: "Are you sure you want to mark this item as Claimed?",
                            action: () => handleUpdateStatus(selectedItem, 'Claimed')
                          })}
                          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#384388] to-[#2D366D] text-sm font-semibold uppercase tracking-wide text-white shadow-md transition-all duration-200 hover:from-[#44509B] hover:to-[#2D366D]"
                        >
                          <CheckCircle size={18} />
                          Mark Claimed
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedItem(null)}
                        className="flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-200 text-sm font-black uppercase tracking-wide text-slate-500 transition hover:bg-slate-300"
                      >
                        Close
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Confirmation Dialog */}
      {activeConfirmation && (
        <ConfirmModal
          message={activeConfirmation.text}
          onConfirm={() => {
            activeConfirmation.action();
            setActiveConfirmation(null);
          }}
          onClose={() => setActiveConfirmation(null)}
        />
      )}

      {/* Global Toast Notification */}
      {notificationMessage && (
        <div className="fixed bottom-5 right-5 z-[120] flex items-center gap-3 rounded-xl bg-slate-800 px-5 py-3 text-white shadow-xl">
          <span className="text-sm font-medium">{notificationMessage}</span>
          <button
            onClick={() => setNotificationMessage(null)}
            className="text-slate-400 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
};

export default LostItems;