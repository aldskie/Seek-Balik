// ProfileModal.jsx
import React, { useEffect, useState, useRef } from "react";
import { X, User, Mail, Phone, Shield, Lock, Camera, BadgeCheck, Clock } from "lucide-react";
import { getCurrentUser } from "../api/api";
import ChangePasswordModal from "./ChangePasswordModal";
import { showToast } from "../utils/toast";

const ProfileModal = ({ isOpen, onClose, onLogout, setShowProfileModal }) => {
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isChangePassOpen, setIsChangePassOpen] = useState(false);
  const [localImage, setLocalImage] = useState(null);
  const fileInputRef = useRef(null);

  const fetchCurrentUser = async () => {
    try {
      setLoading(true);
      const currentUser = await getCurrentUser();
      setProfileData(currentUser);
    } catch (error) {
      console.error("Failed to fetch current user:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCurrentUser();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCameraClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("Please select a valid image file.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setLocalImage(reader.result);
      showToast("Profile picture updated in view (Frontend only).");
    };
    reader.readAsDataURL(file);
  };

  const profileImage =
    localImage ||
    profileData?.profile_picture ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(
      (profileData?.first_name || "Admin") + " " + (profileData?.last_name || "User")
    )}&background=0B6FA4&color=fff&size=256`;

  const fullName =
    `${profileData?.first_name || ""} ${profileData?.last_name || ""}`.trim() || "User Profile";

  const roleLabel = profileData?.position || profileData?.role || "Not Assigned";

  const formattedJoinDate = profileData?.created_at || profileData?.date_joined
    ? new Date(profileData?.created_at || profileData?.date_joined).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  const userId = profileData?.id ?? profileData?.user_id;

  return (
    <>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
        <div className="w-full max-w-[520px] overflow-hidden rounded-[24px] bg-white shadow-2xl">
          {/* HEADER SECTION */}
          <div className="relative h-[110px] bg-gradient-to-r from-[#0B6FA4] to-[#155F87]">
            <div
              className="absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
                backgroundSize: "18px 18px",
              }}
            />

            <button
              type="button"
              onClick={onClose}
              title="Close Profile"
              aria-label="Close Profile"
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors"
            >
              <X size={18} />
            </button>

            <div className="absolute left-1/2 bottom-0 translate-y-1/2 -translate-x-1/2">
              <div className="relative">
                <img
                  src={profileImage}
                  alt="Profile"
                  className="h-[92px] w-[92px] rounded-full border-4 border-white object-cover shadow-lg bg-white"
                />
                <span
                  title="Active session"
                  className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-white bg-emerald-500"
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={handleCameraClick}
                  title="Upload Profile Picture"
                  aria-label="Upload Profile Picture"
                  className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-[#0B6FA4] text-white shadow-md ring-2 ring-white hover:bg-[#095d8a] transition-colors"
                >
                  <Camera size={13} />
                </button>
              </div>
            </div>
          </div>

          {/* CONTENT SECTION */}
          <div className="px-6 pb-6 pt-16">
            <div className="text-center">
              <h1 className="text-xl font-black text-slate-800">
                {loading ? "Loading..." : fullName}
              </h1>

              <div className="mt-2 flex items-center justify-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EEF6FA] px-3 py-1 text-[12px] font-bold text-[#0B6FA4]">
                  <BadgeCheck size={13} />
                  {roleLabel}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[12px] font-bold text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Active
                </span>
              </div>

              {(formattedJoinDate || userId) && (
                <p className="mt-2 flex items-center justify-center gap-1 text-[12px] font-medium text-slate-400">
                  <Clock size={12} />
                  {formattedJoinDate ? `Member since ${formattedJoinDate}` : `User ID #${userId}`}
                </p>
              )}
            </div>

            {/* PERSONAL INFORMATION */}
            <div className="mt-6">
              <p className="mb-2 px-1 text-[12px] font-black uppercase tracking-widest text-slate-400">
                Personal Information
              </p>
              <div className="grid grid-cols-1 gap-x-2 rounded-2xl border border-slate-100 p-1.5 sm:grid-cols-2">
                <ProfileField icon={User} label="First Name" value={profileData?.first_name || ""} />
                <ProfileField icon={User} label="Last Name" value={profileData?.last_name || ""} />
                <ProfileField icon={Mail} label="Email" value={profileData?.email || ""} />
                <ProfileField icon={Phone} label="Contact Number" value={profileData?.contact_number || ""} />
              </div>
            </div>

            {/* ACCOUNT & SECURITY */}
            <div className="mt-5">
              <p className="mb-2 px-1 text-[12px] font-black uppercase tracking-widest text-slate-400">
                Account &amp; Security
              </p>
              <div className="rounded-2xl border border-slate-100 p-1.5">
                <ProfileField icon={Shield} label="Position / Role" value={roleLabel} />
              </div>
            </div>

            {/* ACTION BUTTONS */}
            <div className="mt-6 flex flex-col gap-2.5 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setIsChangePassOpen(true)}
                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#0B7DB3] px-4 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#096892]"
              >
                <Lock size={15} />
                Change Password
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CONNECTED CHANGE PASSWORD MODAL */}
      {isChangePassOpen && (
        <ChangePasswordModal
          mustChangePassword={false}
          onSuccess={() => setIsChangePassOpen(false)}
          onCancel={() => setIsChangePassOpen(false)}
        />
      )}
    </>
  );
};

const ProfileField = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-slate-50">
    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#EEF6FA] text-[#0B6FA4]">
      <Icon size={15} />
    </div>
    <div className="min-w-0">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`truncate text-sm font-semibold ${value ? "text-slate-700" : "text-slate-300"}`}>
        {value || `No ${label.toLowerCase()} set`}
      </p>
    </div>
  </div>
);

export default ProfileModal;