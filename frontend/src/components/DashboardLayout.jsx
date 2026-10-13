import React, { useState } from "react";
import { Outlet, useNavigate, Navigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import useClock from "../hooks/useClock";
import Sidebar from "./Sidebar";
import MobileNav from "./MobileNav";
import Header from "./Header";
import NotificationBell from "./NotificationBell";

const DashboardLayout = () => {
  const { time, date } = useClock();

  const {
    isLoggedIn,
    userRole,
    logout
  } = useApp();

  const [isCollapsed, setIsCollapsed] = useState(false);

  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  // Where a clicked notification takes staff.
  const openNotification = (n) => {
    const data = n?.data || {};
    let path = data.path;
    if (path === "lost-items") {
      path = userRole?.toLowerCase() === "moderator" ? "/dashboard/moderator-lost" : "/dashboard/lost-items";
    }
    if (!path) return;
    navigate(path, data.claim_id != null ? { state: { openClaimId: data.claim_id } } : undefined);
  };

  if (!isLoggedIn) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#F4F7FE]">

      {/* HEADER */}
      <div className="no-print">
        <Header
          variant="dashboard"
          time={time}
          date={date}
          onLogout={handleLogout}
          onLogoClick={() => setIsCollapsed((prev) => !prev)}
          actions={<NotificationBell tone="dark" onOpen={openNotification} />}
        />
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* SIDEBAR */}
        <div className="no-print">
          <Sidebar
            role={userRole}
            onLogout={handleLogout}
            isCollapsed={isCollapsed}
            setIsCollapsed={setIsCollapsed}
          />
        </div>

        {/* CONTENT */}
        <main className="flex-1 overflow-y-auto p-6">

          <div className="block md:hidden mb-4 bg-white px-4 py-2 rounded-xl no-print">
            <p className="text-[9px] font-black text-slate-400 uppercase text-center">
              {date} · {time}
            </p>
          </div>

          <div className="print-area">
            <Outlet />
          </div>

        </main>

      </div>

      <div className="no-print">
        <MobileNav />
      </div>

    </div>
  );
};

export default DashboardLayout;