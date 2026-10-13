import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider } from "./context/AppContext";
import AppInner from "./pages/AppInner"; 
import DashboardLayout from "./components/DashboardLayout";
import DashboardRoutes from "./components/DashboardRoutes";
import Leaderboard from "./pages/Leaderboards";
import RequireRole from "./components/RequireRole";
import 'leaflet/dist/leaflet.css';
import HelpPage from "./pages/HelpPage";
import ConfirmHost from "./components/ConfirmDialog";
import StaffSessionGuard from "./components/StaffSessionGuard";
export default function App() {
  return (
    <AppProvider>
      <ConfirmHost />
      <Router>
        {/* 5-minute inactivity logout for admin/moderator dashboard */}
        <StaffSessionGuard />
        <Routes>

          {/* PUBLIC PAGES */}
          <Route path="/" element={<AppInner />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/help" element={<HelpPage />} />

          {/* DASHBOARD ROUTE — admin & moderator only. Student/school-ID
              accounts (and anyone not logged in) get bounced back to "/". */}
          <Route
            path="/dashboard/*"
            element={
              <RequireRole allowedRoles={["admin", "moderator"]} redirectTo="/">
                <DashboardLayout />
              </RequireRole>
            }
          >
            <Route path="*" element={<DashboardRoutes />} />
          </Route>

          {/* FALLBACK REDIRECT TO HOME */}
          <Route path="*" element={<Navigate to="/" replace />} />

        </Routes>
      </Router>
    </AppProvider>
  );
}