import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import DashboardHome from "../pages/Dashboard";
import LostItems from "../pages/LostItems";
import FoundItems from "../pages/FoundItems";
import Reports from "../pages/Reports";
import Users from "../pages/Users";
import ModeratorLostItems from "../pages/ModeratorLostItems";
import ClaimRequests from "../pages/Claimrequests";
import LeaderboardControl from "../pages/LeaderboardControl";
import ActivityLogs from "../pages/ActivityLogs";
import AdminHelpCenter from "../pages/AdminHelpCenter";
import Archive from "../pages/Archive";
import ReportIssues from "../pages/ReportIssues";
import BackupRestore from "../pages/BackupandRestore";

import RequireRole from "./RequireRole";
import QuestionBank from "./QuestionBank";

const DashboardRoutes = () => {
  return (
    <Routes>
      {/* Dashboard Home */}
      <Route index element={<DashboardHome />} />

      {/* Lost & Found */}
      <Route path="lost-items" element={<LostItems />} />
      <Route path="surrendered-items" element={<FoundItems />} />
      <Route path="claim-requests" element={<ClaimRequests />} />
      <Route path="reports" element={<Reports />} />
      <Route path="leaderboard" element={<LeaderboardControl />} />

      {/* Moderator */}
      <Route
        path="moderator-lost"
        element={
          <RequireRole allowedRoles={["moderator"]}>
            <ModeratorLostItems />
          </RequireRole>
        }
      />

      {/* Admin */}
      <Route
        path="users"
        element={
          <RequireRole allowedRoles={["admin"]}>
            <Users />
          </RequireRole>
        }
      />

      {/* Utilities */}
      <Route path="utilities/question-bank" element={<QuestionBank />} />
      <Route path="utilities/activity-logs" element={<ActivityLogs />} />
      <Route path="activity-logs" element={<ActivityLogs />} />
      <Route
        path="utilities/report-issues"
        element={
          <RequireRole allowedRoles={["admin"]}>
            <ReportIssues />
          </RequireRole>
        }
      />
      <Route
        path="utilities/archive"
        element={
          <RequireRole allowedRoles={["admin", "moderator"]}>
            <Archive />
          </RequireRole>
        }
      />
      <Route
        path="utilities/backup-restore"
        element={
          <RequireRole allowedRoles={["admin"]}>
            <BackupRestore />
          </RequireRole>
        }
      />

      {/* Help Center (Admin + Moderator) */}
      <Route
        path="help-center"
        element={
          <RequireRole allowedRoles={["admin", "moderator"]}>
            <AdminHelpCenter />
          </RequireRole>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

export default DashboardRoutes;