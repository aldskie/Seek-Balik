import React, { useEffect, useState } from "react";
import {
  FaKey,
  FaCompass,
  FaClipboardCheck,
  FaBoxOpen,
  FaSearch,
  FaBell,
  FaTrophy,
  FaTimes,
  FaExpand,
  FaChevronLeft,
  FaChevronRight,
} from "react-icons/fa";

// ==========================================================
// USER GUIDE (Help Center)
//
// Step-by-step walkthroughs for students and employees, each step with
// a real screenshot of the system. Screenshots live in /public/help/
// and are served as /help/<name>.webp. They were taken with sample
// accounts (Maria Santos, Juan Dela Cruz) so no real user data shows.
// The orange rings in the pictures mark the button to click.
// ==========================================================

const img = (name) => `/help/${name}.webp`;

const USER_GUIDES = [
  {
    id: "login",
    title: "Log in or create an account",
    icon: <FaKey />,
    summary: "Sign in with your SLC school email, or register for the first time.",
    steps: [
      {
        title: "Click LOGIN",
        text: "Open Seek & Balik and click the LOGIN button at the top-right corner of the page.",
        image: img("01-board-login"),
      },
      {
        title: "Enter your email and password",
        text: "Type your school email (for example 23100000@slc-sflu.edu.ph) and your password, then click LOGIN. Forgot it? Click \"Forgot password?\".",
        image: img("02-login"),
      },
      {
        title: "No account yet? Click Register",
        text: "On the login window, click Register. Read the Terms and Conditions and Data Privacy Consent, tick the checkbox, then click I Agree.",
        image: img("03-register"),
      },
      {
        title: "Fill in the registration form",
        text: "Enter your first and last name, your school ID email and (optional) contact number, then click REGISTER. Enter the 6-digit code sent to your email. Your temporary password is emailed after the code is verified.",
        image: img("03b-register-form"),
      },
      {
        title: "Log in and change your password",
        text: "Log in using the temporary password from your email. You will be asked to set a new password the first time you sign in.",
      },
    ],
  },
  {
    id: "board",
    title: "Find your way around the board",
    icon: <FaCompass />,
    summary: "What each button does, and how to search and filter items.",
    steps: [
      {
        title: "Know the buttons",
        text: "After logging in you will see the public board. The buttons at the top are: Profile, Report lost (+), Help (?), Track (magnifier), My claims (calendar) and Leaderboard (trophy). The bell at the top-right shows your notifications.",
        image: img("04-board"),
      },
      {
        title: "Search for an item",
        text: "Type in the Search box to find items by name, category or location. The list updates as you type.",
        image: img("05-search"),
      },
      {
        title: "Filter by category",
        text: "Click Filters and pick a category (for example Accessories or ID) to show only those items. Choose All Categories or click Reset to see everything again.",
        image: img("06-filters"),
      },
      {
        title: "Filter by date",
        text: "Use the From and To boxes beside the search to show only items logged between two dates. Click the × on a filter tag, or CLEAR ALL, to remove filters.",
        image: img("06b-date-range"),
      },
    ],
  },
  {
    id: "claim",
    title: "Claim a surrendered item",
    icon: <FaClipboardCheck />,
    summary: "Found your item on the board? Here's how to request it back.",
    steps: [
      {
        title: "Open the SURRENDERED tab and click Claim",
        text: "Click the SURRENDERED tab to see items that were turned in to the SAO. Find your item and click its Claim button.",
        image: img("07-surrendered"),
      },
      {
        title: "Check the item and answer the questions",
        text: "Make sure the item at the top is the one you're claiming. Your name and school ID are filled in from your account. Answer each ownership verification question — only the real owner should know these details.",
        image: img("10-claim-modal"),
      },
      {
        title: "Pick a verification schedule",
        text: "Scroll down, add any other unique description, then choose your Preferred Date and Preferred Time. Click Review & Submit, check your answers, and confirm.",
        image: img("10b-claim-schedule"),
      },
      {
        title: "Go to the Student Affairs Office",
        text: "The SAO reviews your claim. Once it's Scheduled, go to the Student Affairs Office on your meeting date and bring your School ID to receive the item.",
      },
    ],
  },
  {
    id: "report",
    title: "Report a lost item",
    icon: <FaBoxOpen />,
    summary: "Lost something on campus? Post a report so staff can help.",
    steps: [
      {
        title: "Click the + button",
        text: "On the board, click the round + (Report a Lost Item) button beside the Help button.",
        image: img("04-board"),
      },
      {
        title: "Fill in the report",
        text: "Choose the Category and Item Name, tick up to 3 places where you might have lost it, and set the date and approximate time. Add a description and a photo if you have one, then click Submit and confirm.",
        image: img("12-report-form"),
      },
      {
        title: "Save your ticket number",
        text: "After submitting you'll get a ticket number (for example TKT-128-516D). Keep it — you can use it to track your report. Your report stays Pending until the SAO approves it.",
      },
    ],
  },
  {
    id: "track",
    title: "Track your claims and reports",
    icon: <FaSearch />,
    summary: "Check the status of everything you've submitted.",
    steps: [
      {
        title: "Open My Claim Requests",
        text: "Click the calendar button to see all your claims and their status: Pending, Scheduled, Declined or Session Timed Out. Click a claim to see its meeting date, time and location.",
        image: img("13-my-claims"),
      },
      {
        title: "Track with a ticket number",
        text: "Click the magnifier (Track Item) button, type your ticket number and click Track to see the item's current status.",
        image: img("14-track"),
      },
    ],
  },
  {
    id: "notifications",
    title: "Check your notifications",
    icon: <FaBell />,
    summary: "Get updates when your claim or report changes.",
    steps: [
      {
        title: "Click the bell",
        text: "The bell at the top-right glows and shows a red number when you have new updates — like a scheduled meeting, an approved report or points earned. Click it to read them, or click Mark all read.",
        image: img("15-notifications"),
      },
    ],
  },
  {
    id: "leaderboard",
    title: "Leaderboard and your profile",
    icon: <FaTrophy />,
    summary: "See the Honest Finders ranking and manage your account.",
    steps: [
      {
        title: "View the Leaderboard",
        text: "Click the trophy button to see the Honest Finders Leaderboard. Surrendering items that get claimed earns you points. Use the search box to find a name or ID.",
        image: img("16-leaderboard"),
      },
      {
        title: "Manage your profile",
        text: "Click the profile icon at the top-left of the board to view your details. Use EDIT PROFILE to update your name or contact number, CHANGE PASSWORD to set a new password, and Log out to sign out.",
        image: img("17-profile"),
      },
    ],
  },
];

export default function UserGuide() {
  const [activeId, setActiveId] = useState(USER_GUIDES[0].id);
  const [zoom, setZoom] = useState(null); // { src, title }

  const guide = USER_GUIDES.find((g) => g.id === activeId) || USER_GUIDES[0];
  const guideIndex = USER_GUIDES.indexOf(guide);

  useEffect(() => {
    if (!zoom) return undefined;
    const onKey = (e) => e.key === "Escape" && setZoom(null);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [zoom]);

  const goTo = (i) => {
    const next = USER_GUIDES[i];
    if (!next) return;
    setActiveId(next.id);
    document.getElementById("user-guide")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section id="user-guide" className="mt-10 scroll-mt-4">
      <div className="mb-4">
        <p className="text-xs font-bold uppercase tracking-widest text-[#0B648D]">User Guide</p>
        <h2 className="text-2xl font-black text-slate-800">How to use Seek & Balik</h2>
        <p className="mt-1 text-sm text-slate-500">
          Pick a topic and follow the steps. The orange ring in each picture shows where to click.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* Topic list */}
        <nav className="flex gap-2 overflow-x-auto pb-1 lg:sticky lg:top-4 lg:flex-col lg:self-start lg:overflow-visible" aria-label="Guide topics">
          {USER_GUIDES.map((g, i) => {
            const active = g.id === guide.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setActiveId(g.id)}
                aria-current={active ? "true" : undefined}
                className={`flex shrink-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition lg:w-full ${
                  active
                    ? "border-[#0B648D] bg-[#0B648D] text-white shadow-md"
                    : "border-slate-200 bg-white text-slate-700 hover:border-[#0B648D]/50"
                }`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    active ? "bg-white/15 text-white" : "bg-[#E6F4FB] text-[#0B648D]"
                  }`}
                >
                  {g.icon}
                </span>
                <span className="whitespace-nowrap lg:whitespace-normal">
                  <span className={`mr-1 text-xs ${active ? "text-blue-100" : "text-slate-400"}`}>{i + 1}.</span>
                  {g.title}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Steps */}
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#E6F4FB] text-[#0B648D]">
              {guide.icon}
            </span>
            <div>
              <h3 className="text-lg font-black text-slate-800">{guide.title}</h3>
              <p className="text-sm text-slate-500">{guide.summary}</p>
            </div>
          </div>

          <ol className="mt-5 space-y-6">
            {guide.steps.map((s, i) => (
              <li key={s.title} className="flex gap-3 sm:gap-4">
                <div className="flex flex-col items-center">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0B648D] text-sm font-black text-white">
                    {i + 1}
                  </span>
                  {i < guide.steps.length - 1 && <span className="mt-2 w-0.5 flex-1 bg-slate-200" />}
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <p className="font-bold text-slate-800">{s.title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{s.text}</p>
                  {s.image && (
                    <button
                      type="button"
                      onClick={() => setZoom({ src: s.image, title: `Step ${i + 1}: ${s.title}` })}
                      className="group relative mt-3 block w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 text-left shadow-sm transition hover:shadow-md"
                      aria-label={`Enlarge screenshot for step ${i + 1}`}
                    >
                      <img
                        src={s.image}
                        alt={`Screenshot: ${s.title}`}
                        loading="lazy"
                        width="1280"
                        height="760"
                        className="block h-auto w-full"
                      />
                      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white opacity-90 transition group-hover:opacity-100">
                        <FaExpand size={10} /> Enlarge
                      </span>
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => goTo(guideIndex - 1)}
              disabled={guideIndex === 0}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-[#0B648D] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <FaChevronLeft size={10} /> Previous
            </button>
            <span className="text-xs font-semibold text-slate-400">
              Topic {guideIndex + 1} of {USER_GUIDES.length}
            </span>
            <button
              type="button"
              onClick={() => goTo(guideIndex + 1)}
              disabled={guideIndex === USER_GUIDES.length - 1}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0B648D] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#095676] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next topic <FaChevronRight size={10} />
            </button>
          </div>
        </div>
      </div>

      {/* Enlarged screenshot */}
      {zoom && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/75 p-4"
          onClick={() => setZoom(null)}
          role="dialog"
          aria-modal="true"
          aria-label={zoom.title}
        >
          <div className="relative w-full max-w-6xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-3 text-white">
              <p className="text-sm font-semibold">{zoom.title}</p>
              <button
                type="button"
                onClick={() => setZoom(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
                aria-label="Close"
              >
                <FaTimes />
              </button>
            </div>
            <img src={zoom.src} alt={zoom.title} className="max-h-[85vh] w-full rounded-xl object-contain shadow-2xl" />
          </div>
        </div>
      )}
    </section>
  );
}
