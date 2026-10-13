import React, { useState, useEffect } from "react";
import { getCurrentUser } from "../api/api";
import { Link, useLocation, useNavigate } from "react-router-dom";
import ProfileModal from "./ProfileModal";

import {
  FaTachometerAlt,
  FaExclamationTriangle,
  FaUsers,
  FaSignOutAlt,
  FaChevronRight,
  FaChevronDown,
  FaChartBar,
  FaFlag,
  FaQuestion,
  FaSearch,
  FaHandshake,
  FaTrophy,
  FaCog,
  FaHeartbeat,
  FaUndo,
  FaQuestionCircle,
  FaArchive,
  FaBug,
} from "react-icons/fa";

const Sidebar = ({ role, onLogout, isCollapsed, setIsCollapsed, onOpenHelp }) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({
    LostAndSurrendered: true,
    Utilities: true,
  });

  const normalizedRole = role?.toLowerCase();
  const formattedRole =
    role?.charAt(0).toUpperCase() + role?.slice(1).toLowerCase();

  const [currentUser, setCurrentUser] = useState(null);

  const profileImage =
    currentUser?.profile_picture ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(
      (currentUser?.first_name || "Admin") +
        " " +
        (currentUser?.last_name || "User")
    )}&background=0B6FA4&color=fff&size=128`;

  useEffect(() => {
    async function fetchCurrentUser() {
      try {
        const data = await getCurrentUser();
        setCurrentUser({
          ...data,
          full_name: `${data.first_name || ""} ${data.last_name || ""}`.trim(),
        });
      } catch (error) {
        console.error("Failed to fetch current user:", error);
      }
    }
    fetchCurrentUser();
  }, []);

  const handleLogout = () => {
    onLogout?.();
    setShowLogoutModal(false);
    navigate("/");
  };

  const toggleGroup = (groupId) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const menuItems = [
    {
      id: "Dashboard",
      label: "Dashboard",
      icon: FaTachometerAlt,
      path: "/dashboard",
      type: "single",
    },

    {
      id: "LostAndSurrendered",
      label: "Item Management",
      icon: FaExclamationTriangle,
      type: "group",
      children: [
        {
          id: "Lost Items",
          label: "Lost Items",
          icon: FaSearch,
          path:
            normalizedRole === "moderator"
              ? "/dashboard/moderator-lost"
              : "/dashboard/lost-items",
          type: "single",
        },
        {
          id: "Found Items",
          label: "Surrendered Items",
          icon: FaFlag,
          path: "/dashboard/surrendered-items",
          type: "single",
        },
        {
          id: "Claim Request",
          label: "Claim Request",
          icon: FaHandshake,
          path: "/dashboard/claim-requests",
          type: "single",
        },
      ],
    },

    {
      id: "Leaderboard",
      label: "Leaderboards",
      icon: FaTrophy,
      path: "/dashboard/leaderboard",
      type: "single",
    },

    {
      id: "Reports",
      label: "Reports",
      icon: FaChartBar,
      path: "/dashboard/reports",
      type: "single",
    },

    ...(normalizedRole === "admin"
      ? [
          {
            id: "Users",
            label: "User Management",
            icon: FaUsers,
            path: "/dashboard/users",
            type: "single",
          },
        ]
      : []),

    // ==========================
    // UTILITIES
    // ==========================
    {
      id: "Utilities",
      label: "Utilities",
      icon: FaCog,
      type: "group",
      children: [
        {
          id: "Question Bank",
          label: "Question Bank",
          icon: FaQuestion,
          path: "/dashboard/utilities/question-bank",
          type: "single",
        },
        {
          id: "Activity Logs",
          label: "Activity Logs",
          icon: FaHeartbeat,
          path: "/dashboard/utilities/activity-logs",
          type: "single",
        },
        // Report Issues — admin only.
        ...(normalizedRole === "admin"
          ? [
              {
                id: "Report Issues",
                label: "Reported Issues",
                icon: FaBug,
                path: "/dashboard/utilities/report-issues",
                type: "single",
              },
            ]
          : []),
        {
          id: "Help Center",
          label: "Help Center",
          icon: FaQuestionCircle,
          path: "/dashboard/help-center",
          type: "single",
        },
        {
          id: "Archive",
          label: "Archive",
          icon: FaArchive,
          path: "/dashboard/utilities/archive",
          type: "single",
        },
        ...(normalizedRole === "admin"
          ? [
              {
                id: "Backup and Restore",
                label: "Backup & Restore",
                icon: FaUndo,
                path: "/dashboard/utilities/backup-restore",
                type: "single",
              },
            ]
          : []),
      ],
    },
  ];

  return (
    <>
      <aside
        className={`h-full bg-gradient-to-b from-white to-[#F8FBFD] border-r border-slate-200 shadow-md flex flex-col justify-between transition-all duration-300 ${
          isCollapsed ? "w-[95px]" : "w-[260px]"
        }`}
      >
        <div className="py-7 flex-1 overflow-y-auto select-none">
          <div
            className={`px-6 mb-8 transition-all duration-300 ${
              isCollapsed
                ? "opacity-0 h-0 mb-0 overflow-hidden"
                : "opacity-100"
            }`}
          >
            <p className="text-[17px] font-medium text-slate-400">
              Welcome back,
            </p>

            <button
              type="button"
              title="View profile"
              onClick={() => setShowProfileModal(true)}
              className="mt-2 flex w-full items-center gap-3 rounded-xl py-1.5 pr-2 text-left transition hover:bg-[#EEF6FA]"
            >
              <img
                src={profileImage}
                alt=""
                className="h-10 w-10 flex-shrink-0 rounded-full border-2 border-white object-cover shadow-sm"
              />
              <span className="min-w-0">
                <span className="block truncate text-[17px] font-extrabold leading-tight text-[#0B6FA4]">
                  {currentUser?.full_name || "User"}
                </span>
                <span className="block truncate text-[15px] font-medium leading-tight text-slate-400">
                  {formattedRole || "User"}
                </span>
              </span>
            </button>
          </div>

          <nav className="px-4 space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;

              const isActive =
                item.type === "single" && item.path === "/dashboard"
                  ? pathname === "/dashboard"
                  : item.type === "single" && item.path
                  ? pathname.startsWith(item.path)
                  : false;

              if (item.type === "group") {
                const hasChildActive = item.children.some(
                  (child) => child.path && pathname.startsWith(child.path)
                );
                const isExpanded = expandedGroups[item.id] || hasChildActive;

                return (
                  <div key={item.id} className="space-y-1">
                    <button
                      type="button"
                      onClick={() => !isCollapsed && toggleGroup(item.id)}
                      className={`w-full flex items-center justify-between rounded-xl px-5 py-4 transition-all duration-200 ${
                        isCollapsed ? "justify-center" : "gap-4"
                      } ${
                        hasChildActive
                          ? "bg-gradient-to-r from-[#0B6FA4] to-[#155F87] text-white shadow-sm"
                          : "text-slate-600 hover:bg-[#EEF6FA] hover:text-[#0B6FA4]"
                      }`}
                    >
                      <div
                        className={`flex items-center ${
                          isCollapsed ? "" : "gap-4"
                        }`}
                      >
                        <Icon size={22} strokeWidth={2.2} />
                        {!isCollapsed && (
                          <span className="text-[15px] font-semibold">
                            {item.label}
                          </span>
                        )}
                      </div>

                      {!isCollapsed &&
                        (isExpanded ? (
                          <FaChevronDown size={18} />
                        ) : (
                          <FaChevronRight size={18} />
                        ))}
                    </button>

                    {!isCollapsed && isExpanded && (
                      <div className="ml-6 space-y-1">
                        {item.children.map((child) => {
                          const ChildIcon = child.icon;

                          if (child.type === "modal") {
                            return (
                              <button
                                key={child.id}
                                type="button"
                                onClick={child.action}
                                className="w-full flex items-center rounded-lg px-4 py-3 text-slate-500 transition-all duration-200 hover:bg-[#EEF6FA] hover:text-[#0B6FA4]"
                              >
                                <ChildIcon size={18} strokeWidth={2.2} />
                                <span className="ml-3 text-[13px] font-medium">
                                  {child.label}
                                </span>
                              </button>
                            );
                          }

                          const childActive = pathname.startsWith(child.path);

                          return (
                            <Link
                              key={child.id}
                              to={child.path}
                              className={`flex items-center rounded-lg px-4 py-3 transition-all duration-200 ${
                                childActive
                                  ? "bg-gradient-to-r from-[#0B6FA4] to-[#155F87] text-white shadow-sm"
                                  : "text-slate-500 hover:bg-[#EEF6FA] hover:text-[#0B6FA4]"
                              }`}
                            >
                              <ChildIcon size={18} strokeWidth={2.2} />
                              <span className="ml-3 text-[13px] font-medium">
                                {child.label}
                              </span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={item.id}
                  to={item.path}
                  className={`flex items-center rounded-xl px-5 py-4 transition-all duration-200 ${
                    isCollapsed ? "justify-center" : "gap-4"
                  } ${
                    isActive
                      ? "bg-gradient-to-r from-[#0B6FA4] to-[#155F87] text-white shadow-lg"
                      : "text-slate-500 hover:bg-[#EEF6FA] hover:text-[#0B6FA4]"
                  }`}
                >
                  <Icon size={25} strokeWidth={2.2} />

                  {!isCollapsed && (
                    <span className="text-[15px] font-semibold">
                      {item.label}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-slate-200 p-4 space-y-2">
          <button
            type="button"
            onClick={() => setShowLogoutModal(true)}
            className={`w-full flex items-center rounded-xl px-5 py-4 text-slate-500 transition-all duration-200 hover:bg-[#EEF6FA] hover:text-[#0B6FA4] ${
              isCollapsed ? "justify-center" : "gap-4"
            }`}
          >
            <FaSignOutAlt size={22} strokeWidth={2.2} />
            {!isCollapsed && (
              <span className="text-[15px] font-semibold">Logout</span>
            )}
          </button>
        </div>
      </aside>

      {/* Logout Modal */}
      {showLogoutModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-md p-6">
          <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-[0_30px_80px_rgba(0,0,0,.25)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#E8F4FA] text-[#0B648D]">
              <FaSignOutAlt size={30} />
            </div>

            <h3 className="mt-6 text-2xl font-bold text-[#154B70]">
              Confirm Logout
            </h3>

            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              You are about to end your current session. You will need to log in again to access the system.
            </p>

            <div className="mt-7 space-y-3">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full rounded-xl bg-[#0B648D] py-3 text-base font-bold uppercase text-white transition hover:bg-[#094f70] active:scale-[.98]"
              >
                Logout
              </button>

              <button
                type="button"
                onClick={() => setShowLogoutModal(false)}
                className="w-full rounded-xl border border-[#0B648D] py-3 font-semibold uppercase text-[#0B648D] transition hover:bg-blue-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile Modal */}
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        user={currentUser}
        onLogout={handleLogout}
        setShowProfileModal={setShowProfileModal}
      />
    </>
  );
};

export default Sidebar;