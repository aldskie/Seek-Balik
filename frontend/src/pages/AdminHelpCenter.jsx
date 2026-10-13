import React, { useMemo, useState, useEffect } from "react";
import {
  FaSearch,
  FaQuestionCircle,
  FaInfoCircle,
  FaChevronDown,
  FaChevronUp,
  FaBoxOpen,
  FaUserShield,
  FaClipboardCheck,
  FaKey,
  FaTrophy,
  FaUsers,
  FaCog,
  FaArrowRight,
  FaTimes,
  FaArrowUp,
} from "react-icons/fa";

const faqData = [
  {
    category: "Dashboard Overview",
    icon: <FaInfoCircle />,
    description: "Learn the basics of the Admin and Moderator Dashboard.",
    questions: [
      {
        id: "dashboard-purpose",
        q: "What is the Admin Dashboard?",
        a: "The Admin Dashboard is the control center of Seek & Balik where administrators manage reports, claims, users, leaderboard settings, and overall system operations.",
      },
      {
        id: "moderator-dashboard",
        q: "What is the Moderator Dashboard?",
        a: "The Moderator Dashboard allows moderators to review lost reports, approve surrendered items, verify claim requests, and monitor Lost & Found activities assigned to them.",
      },
      {
        id: "roles-difference",
        q: "What is the difference between Administrator and Moderator?",
        a: "Moderators manage reports, surrendered items, and claims. Administrators have full access to user management, moderator management, leaderboard configuration, and system settings.",
      },
    ],
  },

  {
    category: "Managing Lost Reports",
    icon: <FaBoxOpen />,
    description: "Review and process submitted lost item reports.",
    questions: [
      {
        id: "approve-report",
        q: "How do I approve a lost report?",
        a: "Open the report, verify the submitted information, review the item description and attached image, then approve the report if it meets the requirements.",
      },
      {
        id: "reject-report",
        q: "When should I reject a report?",
        a: "Reject reports that contain incomplete information, duplicate submissions, false information, or inappropriate content.",
      },
      {
        id: "pending-report",
        q: "What does Pending status mean?",
        a: "Pending means the report is waiting for moderator review before becoming visible or moving to the next stage of processing.",
      },
      {
        id: "edit-report",
        q: "Can moderators edit reports?",
        a: "Moderators may update administrative information when necessary but should not modify ownership information without verification.",
      },
    ],
  },

  {
    category: "Surrendered Items & Claims",
    icon: <FaClipboardCheck />,
    description: "Review surrendered items and verify ownership claims.",
    questions: [
      {
        id: "approve-found-item",
        q: "How do I approve a surrendered item?",
        a: "Review the submitted item details, verify its category, location, and image, then approve it so users can submit claims.",
      },
      {
        id: "verify-claim",
        q: "How do I review a claim request?",
        a: "Compare the claimant's ownership answers with the stored item information before approving or rejecting the request.",
      },
      {
        id: "approve-claim",
        q: "When should a claim be approved?",
        a: "Approve claims only after ownership has been successfully verified through the verification process.",
      },
      {
        id: "reject-claim",
        q: "When should a claim be rejected?",
        a: "Reject claims that fail ownership verification or provide insufficient identifying information.",
      },
      {
        id: "verification-meeting",
        q: "What happens after a claim is approved?",
        a: "The claimant proceeds to Student Affairs for identity verification before the item is officially released.",
      },
    ],
  },

  {
    category: "Leaderboard & Points",
    icon: <FaTrophy />,
    description: "Manage the Honest Finders Leaderboard and point-awarding system.",
    questions: [
      {
        id: "leaderboard-purpose",
        q: "What is the Honest Finders Leaderboard?",
        a: "The Honest Finders Leaderboard recognizes users who honestly surrender found items and help return them to their rightful owners.",
      },
      {
        id: "point-system",
        q: "What is the official conceptual pointing system?",
        a: "Item Category Points: Electronics (+5), Identification Documents (+4), Wallets & Bags (+4), Keys & Access Items (+3), Academic Materials (+2), Accessories (+3). Activity Points: Approved Surrendered Item Report (+4), Successfully Claimed by Rightful Owner (+4), Honest Return Completion Bonus (+8).",
      },
      {
        id: "award-points",
        q: "When should moderators award points?",
        a: "Points are awarded only after a surrendered item report has been approved. Additional points are awarded after successful claim verification and item release.",
      },
      {
        id: "no-points",
        q: "When should points NOT be awarded?",
        a: "Rejected reports, duplicate submissions, fake reports, cancelled claims, and failed ownership verification should not receive points.",
      },
      {
        id: "leaderboard-control",
        q: "How do administrators enable or disable the leaderboard?",
        a: "Administrators can enable or disable the Honest Finders Leaderboard through the Leaderboard Control page in the dashboard.",
      },
      {
        id: "manual-points",
        q: "Can administrators manually adjust points?",
        a: "Yes. Administrators may manually add or deduct points when correcting verified administrative records or moderation decisions.",
      },
    ],
  },

  {
    category: "User Management",
    icon: <FaUsers />,
    description: "Manage user accounts, moderators, and account permissions.",
    questions: [
      {
        id: "create-moderator",
        q: "How do I create a moderator account?",
        a: "Navigate to User Management from the dashboard, create a new account, assign the Moderator role, and save the account information.",
      },
      {
        id: "deactivate-user",
        q: "How do I deactivate a user account?",
        a: "Open User Management, select the user account, and change its status to Inactive. Inactive users cannot access protected features until reactivated.",
      },
      {
        id: "reactivate-user",
        q: "Can an inactive account be reactivated?",
        a: "Yes. Administrators can reactivate accounts through User Management without creating a new account.",
      },
      {
        id: "reset-password",
        q: "Can administrators reset user passwords?",
        a: "Yes. Administrators may generate a temporary password for users who cannot access their account. Users should change the temporary password after logging in.",
      },
      {
        id: "change-role",
        q: "Can I change a user's role?",
        a: "Administrators can promote users to Moderator, remove moderator privileges, or restore regular user access through User Management.",
      },
      {
        id: "delete-user",
        q: "Can user accounts be permanently deleted?",
        a: "Only administrators should remove user accounts according to institutional policies. Deleted accounts may also remove related system access records.",
      },
    ],
  },

  {
    category: "Moderator Management",
    icon: <FaUserShield />,
    description: "Manage moderator responsibilities and permissions.",
    questions: [
      {
        id: "moderator-permissions",
        q: "What permissions do moderators have?",
        a: "Moderators can review reports, approve surrendered items, verify ownership claims, update report statuses, and monitor Lost & Found activities.",
      },
      {
        id: "moderator-limitations",
        q: "What actions are restricted for moderators?",
        a: "Moderators cannot manage user accounts, create administrators, modify leaderboard settings, reset rankings, or access system configuration pages.",
      },
      {
        id: "remove-moderator",
        q: "How do I remove moderator access?",
        a: "Administrators can remove moderator privileges through User Management by changing the user's role.",
      },
      {
        id: "multiple-moderators",
        q: "Can multiple moderators work at the same time?",
        a: "Yes. Multiple moderators may process reports simultaneously, but each report should only be handled by one moderator at a time to avoid duplicate actions.",
      },
    ],
  },

  {
    category: "Reports & Activity Logs",
    icon: <FaClipboardCheck />,
    description: "Monitor administrative actions inside Seek & Balik.",
    questions: [
      {
        id: "activity-log",
        q: "What are activity logs?",
        a: "Activity logs record important administrative actions performed within the system for accountability and auditing purposes.",
      },
      {
        id: "logged-actions",
        q: "What actions are recorded?",
        a: "Examples include approving reports, rejecting claims, creating moderator accounts, resetting passwords, changing leaderboard settings, releasing claimed items, and manually adjusting points.",
      },
      {
        id: "view-logs",
        q: "Who can view activity logs?",
        a: "Complete activity logs should only be available to administrators responsible for monitoring dashboard operations.",
      },
      {
        id: "logs-important",
        q: "Why are activity logs important?",
        a: "Activity logs help administrators investigate issues, review moderation history, and maintain accountability for administrative actions.",
      },
    ],
  },

  {
    category: "Privacy & Security",
    icon: <FaUserShield />,
    description: "Protect claimant information and maintain secure dashboard access.",
    questions: [
      {
        id: "claimant-info",
        q: "Who can access claimant information?",
        a: "Only authorized moderators and administrators responsible for claim verification should access claimant information.",
      },
      {
        id: "student-privacy",
        q: "Can moderators view all student information?",
        a: "Moderators should only access information necessary to verify reports and claims. Sensitive information should never be shared outside the verification process.",
      },
      {
        id: "protect-data",
        q: "How should personal information be handled?",
        a: "Personal information must only be used for Lost & Found verification and administrative purposes within Seek & Balik.",
      },
      {
        id: "suspicious-activity",
        q: "What should I do if suspicious activity is detected?",
        a: "Immediately report suspicious activity to the system administrator and avoid modifying records until the issue has been verified.",
      },
      {
        id: "admin-security",
        q: "How should administrator accounts be secured?",
        a: "Use strong passwords, never share administrator credentials, and change passwords immediately if unauthorized access is suspected.",
      },
    ],
  },

  {
    category: "System Support & Troubleshooting",
    icon: <FaCog />,
    description: "Resolve common dashboard and moderation issues.",
    questions: [
      {
        id: "dashboard-loading",
        q: "Why isn't the dashboard loading?",
        a: "Check your internet connection, refresh the page, and ensure your account has permission to access the dashboard.",
      },
      {
        id: "approve-error",
        q: "Why can't I approve a report or claim?",
        a: "The report may already be processed by another moderator or your account may not have sufficient permissions.",
      },
      {
        id: "leaderboard-update",
        q: "Why aren't leaderboard points updating?",
        a: "Points update only after approved reports and successful ownership verification. If the leaderboard is inactive, rankings will not appear.",
      },
      {
        id: "system-error",
        q: "What should I do if a system error occurs?",
        a: "Document the issue, avoid repeating administrative actions, and notify the system administrator for investigation.",
      },
    ],
  },
];

const quickActions = [
  {
    icon: <FaBoxOpen />,
    title: "Approve Lost Reports",
    search: "approve report",
  },
  {
    icon: <FaClipboardCheck />,
    title: "Review Claims",
    search: "claim",
  },
  {
    icon: <FaTrophy />,
    title: "Leaderboard Points",
    search: "points",
  },
  {
    icon: <FaUsers />,
    title: "User Management",
    search: "user",
  },
];

export default function AdminHelpCenter() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(null);
  const [showTop, setShowTop] = useState(false);

  const normalizedSearch = search.trim().toLowerCase();

  useEffect(() => {
    const handleScroll = () => {
      setShowTop(window.scrollY > 250);
    };

    window.addEventListener("scroll", handleScroll);

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const results = useMemo(() => {
    if (!normalizedSearch) return faqData;

    return faqData
      .map((section) => ({
        ...section,
        questions: section.questions.filter((item) => {
          const searchableText = `
            ${section.category}
            ${section.description}
            ${item.q}
            ${item.a}
          `.toLowerCase();

          return searchableText.includes(normalizedSearch);
        }),
      }))
      .filter((section) => section.questions.length > 0);
  }, [normalizedSearch]);

  const resultCount = results.reduce(
    (total, section) => total + section.questions.length,
    0
  );

  const toggle = (id) => {
    setOpen((current) => (current === id ? null : id));
  };

  const clearSearch = () => {
    setSearch("");
    setOpen(null);
  };

  const searchQuick = (value) => {
    setSearch(value);
    setOpen(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-[#F5F8FA] text-slate-800">
      {/* =========================================================
          HERO
      ========================================================= */}
      <section className="relative overflow-hidden bg-[#0B648D]">
        <div className="absolute -right-24 -top-24 w-80 h-80 rounded-full bg-white/5" />
        <div className="absolute right-32 top-24 w-40 h-40 rounded-full bg-white/5" />
        <div className="absolute -left-16 bottom-[-80px] w-64 h-64 rounded-full bg-[#154B70]/50" />

        <div className="relative max-w-6xl mx-auto px-5 pt-8 pb-10">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            {/* LEFT */}
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/10 px-3 py-1 text-xs font-bold tracking-widest text-blue-100 uppercase">
                <FaQuestionCircle />
                ADMIN & MODERATOR SUPPORT
              </div>

              <h1 className="mt-4 text-4xl md:text-5xl font-black text-white leading-tight">
                Dashboard Help Center
              </h1>

              <p className="mt-4 text-blue-100 text-base leading-7">
                Complete operational guide for administrators and moderators of the
                Seek & Balik Lost and Found Management System.
              </p>
            </div>

            {/* RIGHT STATS */}
            <div className="grid grid-cols-2 gap-3 min-w-[230px]">
              <div className="rounded-2xl bg-white/10 backdrop-blur p-4 text-center text-white">
                <p className="text-3xl font-black">{faqData.length}</p>
                <p className="text-xs uppercase tracking-wide text-blue-100">
                  Help Categories
                </p>
              </div>

              <div className="rounded-2xl bg-white/10 backdrop-blur p-4 text-center text-white">
                <p className="text-3xl font-black">
                  {faqData.reduce(
                    (total, section) => total + section.questions.length,
                    0
                  )}
                </p>
                <p className="text-xs uppercase tracking-wide text-blue-100">
                  Dashboard FAQs
                </p>
              </div>
            </div>
          </div>

          {/* SEARCH BAR */}
          <div className="mt-8 relative max-w-3xl">
            <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />

            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOpen(null);
              }}
              placeholder="Search reports, claims, users, leaderboard, security..."
              className="w-full h-14 rounded-2xl bg-white border border-white/30 pl-12 pr-12 text-sm text-slate-700 placeholder:text-slate-400 shadow-xl outline-none focus:border-[#0B648D] focus:ring-4 focus:ring-white/20 transition"
            />

            {search && (
              <button
                onClick={clearSearch}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
              >
                <FaTimes />
              </button>
            )}
          </div>

          {normalizedSearch && (
            <p className="mt-3 text-sm text-white/90">
              {resultCount} result{resultCount !== 1 ? "s" : ""} found for{" "}
              <span className="font-semibold">"{search.trim()}"</span>
            </p>
          )}
        </div>
      </section>

      {/* =========================================================
          MAIN CONTENT
      ========================================================= */}
      <main className="max-w-6xl mx-auto px-5 pb-16">
        {/* ABOUT CARDS */}
        {!normalizedSearch && (
          <>
            <section className="grid md:grid-cols-2 gap-5 mt-8">
              <div className="bg-white rounded-3xl border border-slate-100 shadow-lg p-6">
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#0B648D] flex items-center justify-center">
                  <FaInfoCircle />
                </div>

                <h2 className="mt-4 font-bold text-lg">
                  Administrator Responsibilities
                </h2>

                <p className="mt-2 text-sm text-slate-500 leading-6">
                  Manage users, moderators, leaderboard settings, reports,
                  dashboard configuration, security, and system operations.
                </p>
              </div>

              <div className="bg-white rounded-3xl border border-slate-100 shadow-lg p-6">
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#0B648D] flex items-center justify-center">
                  <FaClipboardCheck />
                </div>

                <h2 className="mt-4 font-bold text-lg">
                  Moderator Responsibilities
                </h2>

                <p className="mt-2 text-sm text-slate-500 leading-6">
                  Review reports, approve surrendered items, verify ownership
                  claims, update report statuses, and monitor Lost & Found
                  activities.
                </p>
              </div>
            </section>

            {/* QUICK ACTIONS */}
            <section className="mt-10">
              <div className="mb-5">
                <p className="text-xs font-bold uppercase tracking-widest text-[#0B648D]">
                  Quick Actions
                </p>

                <h2 className="text-2xl font-black mt-1 text-slate-800">
                  Most Viewed Dashboard Guides
                </h2>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {quickActions.map((item) => (
                  <button
                    key={item.title}
                    onClick={() => searchQuick(item.search)}
                    className="group bg-white rounded-2xl border border-slate-200 p-5 text-left hover:border-[#0B648D] hover:shadow-lg transition-all"
                  >
                    <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center text-[#0B648D]">
                      {item.icon}
                    </div>

                    <h3 className="mt-4 text-sm font-bold text-slate-700 leading-5">
                      {item.title}
                    </h3>

                    <div className="mt-4 flex items-center gap-2 text-xs font-bold text-[#0B648D]">
                      Open Guide
                      <FaArrowRight className="group-hover:translate-x-1 transition" />
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {/* =======================================================
            SEARCH EMPTY STATE
        ======================================================= */}
        {normalizedSearch && results.length === 0 && (
          <section className="mt-10">
            <div className="bg-white border border-slate-200 rounded-3xl px-6 py-14 text-center shadow-sm">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 text-2xl">
                <FaSearch />
              </div>

              <h2 className="mt-5 text-xl font-black text-slate-800">
                No dashboard guide found
              </h2>

              <p className="mt-2 max-w-md mx-auto text-sm text-slate-500 leading-6">
                We couldn't find anything matching your search. Try keywords like{" "}
                <span className="font-semibold">report</span>,{" "}
                <span className="font-semibold">claim</span>,{" "}
                <span className="font-semibold">leaderboard</span>,{" "}
                <span className="font-semibold">user</span>, or{" "}
                <span className="font-semibold">security</span>.
              </p>

              <button
                onClick={clearSearch}
                className="mt-6 px-5 py-3 rounded-xl bg-[#0B648D] hover:bg-[#095676] text-white text-sm font-semibold transition"
              >
                Browse all Help Topics
              </button>
            </div>
          </section>
        )}

        {/* =======================================================
            FAQ SECTION
        ======================================================= */}
        {results.length > 0 && (
          <section className={normalizedSearch ? "mt-10" : "mt-12"}>
            {!normalizedSearch && (
              <div className="mb-7">
                <p className="text-xs font-bold uppercase tracking-widest text-[#0B648D]">
                  Dashboard Help Topics
                </p>

                <h2 className="text-3xl font-black mt-2 text-slate-800">
                  Frequently Asked Questions
                </h2>

                <p className="mt-2 text-sm text-slate-500 leading-6">
                  Browse administrator and moderator guides below or use the search
                  bar to instantly find dashboard instructions.
                </p>
              </div>
            )}

            <div className="space-y-5">
              {results.map((section) => (
                <div
                  key={section.category}
                  className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden"
                >
                  {/* CATEGORY HEADER */}
                  <div className="px-6 py-5 flex items-center gap-4 bg-gradient-to-r from-white to-slate-50">
                    <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#0B648D] flex items-center justify-center shrink-0">
                      {section.icon}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-lg text-slate-800">
                        {section.category}
                      </h3>

                      <p className="text-xs text-slate-500 mt-1">
                        {section.description}
                      </p>
                    </div>

                    <div className="px-3 py-1 rounded-full bg-[#E6F4FB] text-[#0B648D] text-xs font-bold shrink-0">
                      {section.questions.length} FAQ
                    </div>
                  </div>

                  {/* QUESTIONS */}
                  <div className="border-t border-slate-100">
                    {section.questions.map((item) => {
                      const isOpen = open === item.id;

                      return (
                        <div
                          key={item.id}
                          className="border-b border-slate-100 last:border-none"
                        >
                          <button
                            onClick={() => toggle(item.id)}
                            className="w-full px-5 md:px-6 py-5 flex items-center justify-between gap-5 text-left hover:bg-slate-50 transition duration-200"
                          >
                            <span
                              className={`font-semibold text-sm md:text-[15px] leading-6 transition-colors ${
                                isOpen ? "text-[#0B648D]" : "text-slate-700"
                              }`}
                            >
                              {item.q}
                            </span>

                            <span
                              className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${
                                isOpen
                                  ? "bg-[#0B648D] text-white"
                                  : "bg-slate-100 text-slate-400"
                              }`}
                            >
                              {isOpen ? (
                                <FaChevronUp className="text-xs" />
                              ) : (
                                <FaChevronDown className="text-xs" />
                              )}
                            </span>
                          </button>

                          {/* ANSWER */}
                          {isOpen && (
                            <div className="px-5 md:px-6 pb-6">
                              {/* Special styling for Pointing System */}
                              {item.id === "point-system" ? (
                                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
                                  <h4 className="font-bold text-[#0B648D] mb-4">
                                    Honest Finders Leaderboard — Official Conceptual Pointing System
                                  </h4>

                                  <div className="grid md:grid-cols-2 gap-5">
                                    <div>
                                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                                        Category by Item
                                      </p>

                                      <div className="space-y-2 text-sm">
                                        <div className="flex justify-between bg-white rounded-lg px-3 py-2">
                                          <span>Electronics</span>
                                          <span className="font-bold text-green-600">+5</span>
                                        </div>

                                        <div className="flex justify-between bg-white rounded-lg px-3 py-2">
                                          <span>Identification Documents</span>
                                          <span className="font-bold text-green-600">+4</span>
                                        </div>

                                        <div className="flex justify-between bg-white rounded-lg px-3 py-2">
                                          <span>Wallets & Bags</span>
                                          <span className="font-bold text-green-600">+4</span>
                                        </div>

                                        <div className="flex justify-between bg-white rounded-lg px-3 py-2">
                                          <span>Keys & Access Items</span>
                                          <span className="font-bold text-green-600">+3</span>
                                        </div>

                                        <div className="flex justify-between bg-white rounded-lg px-3 py-2">
                                          <span>Academic Materials</span>
                                          <span className="font-bold text-green-600">+2</span>
                                        </div>

                                        <div className="flex justify-between bg-white rounded-lg px-3 py-2">
                                          <span>Accessories</span>
                                          <span className="font-bold text-green-600">+3</span>
                                        </div>
                                      </div>
                                    </div>

                                    <div>
                                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                                        Activity Points
                                      </p>

                                      <div className="space-y-2 text-sm">
                                        <div className="flex justify-between bg-white rounded-lg px-3 py-2">
                                          <span>Approved Surrendered Item Report</span>
                                          <span className="font-bold text-green-600">+4</span>
                                        </div>

                                        <div className="flex justify-between bg-white rounded-lg px-3 py-2">
                                          <span>Successfully Claimed by Rightful Owner</span>
                                          <span className="font-bold text-green-600">+4</span>
                                        </div>

                                        <div className="flex justify-between bg-white rounded-lg px-3 py-2 border border-green-200">
                                          <span className="font-semibold">
                                            Honest Return Completion Bonus
                                          </span>
                                          <span className="font-bold text-green-700">+8</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="mt-5 rounded-xl bg-white border border-blue-100 p-4">
                                    <p className="text-sm text-slate-600 leading-7">
                                      Points are awarded only after a report has been reviewed and approved by an authorized moderator or administrator. Bonus points are granted once the surrendered item has been successfully claimed and released to its rightful owner after verification.
                                    </p>
                                  </div>
                                </div>
                              ) : (
                                <div className="rounded-xl bg-slate-50 border border-slate-100 px-5 py-4">
                                  <p className="text-sm text-slate-600 leading-7">
                                    {item.a}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* =======================================================
            CONTACT / SUPPORT CARD
        ======================================================= */}
        <section className="mt-14">
          <div className="relative overflow-hidden rounded-3xl bg-[#154B70] px-7 py-8 md:px-10">
            <div className="absolute right-[-70px] top-[-70px] h-60 w-60 rounded-full bg-white/5" />
            <div className="absolute left-[-60px] bottom-[-60px] h-40 w-40 rounded-full bg-[#0B648D]/40" />

            <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-blue-200">
                  Administrative Support
                </p>

                <h2 className="mt-2 text-2xl md:text-3xl font-black text-white">
                  Need help with dashboard operations?
                </h2>

                <p className="mt-3 max-w-2xl text-sm leading-7 text-blue-100">
                  Contact the Student Affairs Office or the System Administrator
                  for assistance regarding report management, claim verification,
                  leaderboard configuration, user accounts, moderator permissions,
                  and technical issues within the Seek & Balik dashboard.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/10 px-6 py-4 text-white backdrop-blur">
                <p className="text-xs uppercase tracking-wider text-blue-200">
                  Support Office
                </p>

                <p className="mt-2 text-lg font-bold">Student Affairs Office</p>

                <p className="text-sm text-blue-100">Saint Louis College</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* =========================================================
          SCROLL TO TOP BUTTON
      ========================================================= */}
      {showTop && (
        <button
          onClick={() =>
            window.scrollTo({
              top: 0,
              behavior: "smooth",
            })
          }
          className="fixed bottom-5 right-5 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-[#0B648D] text-white shadow-xl transition hover:bg-[#095676]"
        >
          <FaArrowUp />
        </button>
      )}
    </div>
  );
}
