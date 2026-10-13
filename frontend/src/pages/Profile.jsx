import React, { useEffect, useState, useRef } from "react";
import { X, User, Mail, Phone, Shield, Lock, Camera, LogOut } from "lucide-react";
import { getCurrentUser } from "../api/api"; 
import ChangePasswordModal from "../components/ChangePasswordModal";
import { showToast } from "../utils/toast";

const ProfileModal = ({ isOpen, onClose, onLogout, setShowProfile }) => {
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

  // If isOpen is false, do not render anything
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

  const handleLogout = () => {
    if (setShowProfile) setShowProfile(false);
    if (onLogout) onLogout();
  };

  const profileImage =
    localImage ||
    profileData?.profile_picture ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(
      (profileData?.first_name || "Admin") + " " + (profileData?.last_name || "User")
    )}&background=0B6FA4&color=fff&size=256`;

  return (
    <>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
        <div className="w-full max-w-[500px] overflow-hidden rounded-[24px] bg-white shadow-2xl">
          {/* HEADER SECTION */}
          <div className="relative h-[90px] bg-gradient-to-r from-[#147daa] to-[#16678d]">
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
            >
              <X size={18} />
            </button>

            <div className="absolute left-1/2 bottom-0 translate-y-1/2 -translate-x-1/2">
              <div className="relative">
                <img
                  src={profileImage}
                  alt="Profile"
                  className="h-[88px] w-[88px] rounded-full border-4 border-white object-cover shadow-lg bg-white"
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
                  className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-[#0B6FA4] text-white shadow-md hover:bg-[#095d8a] transition-colors"
                >
                  <Camera size={13} />
                </button>
              </div>
            </div>
          </div>

          {/* CONTENT SECTION */}
          <div className="px-6 pb-6 pt-14">
            <h1 className="text-center text-xl font-black text-slate-800">
              {loading ? "Loading..." : `${profileData?.first_name || ""} ${profileData?.last_name || ""}`.trim() || "System Administrator"}
            </h1>
            <p className="mt-0.5 text-center text-xs font-bold uppercase tracking-widest text-slate-400">
              {profileData?.role || "Admin"} Account
            </p>

            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ProfileField icon={User} label="First Name" value={profileData?.first_name || ""} />
              <ProfileField icon={User} label="Last Name" value={profileData?.last_name || ""} />
              <ProfileField icon={Mail} label="Email" value={profileData?.email || ""} />
              <ProfileField icon={Phone} label="Contact Number" value={profileData?.contact || ""} />
              
              {/* Added explicitly to show Admin Role and Position */}
              <ProfileField icon={Shield} label="Role" value={profileData?.role?.toUpperCase() || "ADMIN"} />
              <ProfileField icon={Shield} label="Position" value={profileData?.position || "Not Assigned"} />
            </div>

            <div className="mt-5 flex gap-3 sm:justify-end">
              <button
                type="button"
                onClick={handleLogout}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 px-4 text-xs font-bold text-white hover:bg-red-600 transition-colors sm:flex-initial"
              >
                <LogOut size={15} />
                Logout
              </button>
              <button
                type="button"
                onClick={() => setIsChangePassOpen(true)}
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0B7DB3] px-4 text-xs font-bold text-white hover:bg-[#096892] transition-colors sm:flex-initial"
              >
                <Lock size={15} />
                Change Password
              </button>
            </div>
          </div>
        </div>
      </div>

      {isChangePassOpen && (
        <ChangePasswordModal
          isOpen={isChangePassOpen}
          mustChangePassword={false}
          onSuccess={() => setIsChangePassOpen(false)}
          onCancel={() => setIsChangePassOpen(false)}
        />
      )}
    </>
  );
};

const ProfileField = ({ icon: Icon, label, value }) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
    <div className="mb-1 flex items-center gap-1.5">
      <Icon size={14} className="text-[#0B6FA4]" />
      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>
    </div>
    <input
      readOnly
      value={value}
      placeholder={`No ${label.toLowerCase()} set`}
      className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 outline-none"
    />
  </div>
);

export default ProfileModal;