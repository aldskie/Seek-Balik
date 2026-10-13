import React, { useMemo, useState, useRef, useEffect } from "react";
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
  FaArrowRight,
  FaArrowLeft,
  FaTimes,
  FaArrowUp,
  FaListOl,
} from "react-icons/fa";
import UserGuide from "../components/UserGuide";

const faqData = [
  {
    category: "Getting Started",
    icon: <FaInfoCircle />,
    description: "Learn the basics of using Seek & Balik.",
    questions: [
      {
        id: "what-is-seek-balik",
        q: "What is Seek & Balik?",
        a: "Seek & Balik is the Lost and Found Management System of Saint Louis College. It provides a centralized platform for reporting lost items, surrendering found items, submitting claims, and tracking Lost & Found activities.",
      },
      {
        id: "who-can-use",
        q: "Who can use Seek & Balik?",
        a: "Students and employees authorized to use the Saint Louis College system can access the available features. Administrators and moderators are responsible for managing reports, items, and claims.",
      },
      {
        id: "need-account",
        q: "Do I need an account?",
        a: "Yes. An account is required for features such as submitting reports, claiming items, and tracking your Lost & Found activity.",
      },
    ],
  },

  {
    category: "Registration & Login",
    icon: <FaKey />,
    description: "Problems with your account or signing in?",
    questions: [
      {
        id: "register",
        q: "How do I register?",
        a: "Select Register from the login page and provide the required school information. Use your official Saint Louis College email when requested.",
      },
      {
        id: "temporary-password",
        q: "Why did I receive a temporary password?",
        a: "Newly created accounts may receive a temporary password through email. Use it to log in, then change your password when prompted.",
      },
      {
        id: "forgot-password",
        q: "I forgot my password. What should I do?",
        a: "Contact the Student Affairs Office or an authorized system administrator for assistance with resetting your account.",
      },
      {
        id: "cannot-login",
        q: "Why can't I log in?",
        a: "Make sure you are using the correct school email and password. Also check your internet connection and account status. If you still cannot log in, contact an administrator.",
      },
    ],
  },

  {
    category: "Lost Items",
    icon: <FaBoxOpen />,
    description: "Everything about reporting something you've lost.",
    questions: [
      {
        id: "report-lost",
        q: "How do I report a lost item?",
        a: "Log in to Seek & Balik, select Report a Lost Item, provide the required information about your item, and submit the report for review.",
      },
      {
        id: "multiple-lost",
        q: "Can I report multiple lost items?",
        a: "Yes. Each lost item should have its own report so that every item can be properly identified and processed.",
      },
      {
        id: "edit-lost",
        q: "Can I edit my report after submitting it?",
        a: "If the system does not provide an editing option after submission, contact Student Affairs or an authorized administrator if you need to correct important information.",
      },
      {
        id: "lost-status",
        q: "What happens after I submit a lost item report?",
        a: "Your report is submitted for review. Its status may change as authorized staff process the report and as new information becomes available.",
      },
    ],
  },

  {
    category: "Surrendered Items",
    icon: <FaBoxOpen />,
    description: "Learn how surrendered belongings are submitted and processed.",
    questions: [
      {
        id: "surrender",
        q: "How do I surrender a found item?",
        a: "Use the surrender process in the system and provide accurate information about the item. The item will then be processed by authorized staff.",
      },
      {
        id: "surrender-information",
        q: "What information should I provide when surrendering an item?",
        a: "Provide accurate information such as the item's description, where it was found, when it was found, and any other details requested by the system.",
      },
      {
        id: "after-surrender",
        q: "What happens after I surrender an item?",
        a: "The surrendered item is reviewed and processed by authorized staff. Once approved for listing, it may become available for users to view and potentially claim.",
      },
    ],
  },

  {
    category: "Claims",
    icon: <FaClipboardCheck />,
    description: "Learn how to verify ownership and claim an item.",
    questions: [
      {
        id: "claim",
        q: "How do I claim a surrendered item?",
        a: "Open the surrendered item, select Claim, provide the requested ownership verification information, and submit your claim request.",
      },
      {
        id: "verification",
        q: "Why do I need to answer verification questions?",
        a: "Verification questions help staff determine whether the claimant can provide enough information to establish ownership of the item.",
      },
      {
        id: "multiple-claims",
        q: "Can I submit multiple claims for the same item?",
        a: "Only one claim request should be submitted for the same surrendered item. Make sure your information is accurate before submitting.",
      },
      {
        id: "meeting",
        q: "Where is the verification meeting held?",
        a: "Verification meetings are handled through the Student Affairs Office according to the schedule provided by the system or authorized staff.",
      },
      {
        id: "approved-claim",
        q: "What happens when my claim is approved?",
        a: "You will receive instructions regarding the next steps for verification and item release. Follow the instructions provided by Student Affairs or authorized staff.",
      },
      {
        id: "rejected-claim",
        q: "What happens when my claim is rejected?",
        a: "A rejected claim means the submitted information was not sufficient to verify ownership. Contact Student Affairs if you need clarification regarding the decision.",
      },
    ],
  },

  {
    category: "Tracking",
    icon: <FaSearch />,
    description: "Check the status of your submitted reports and claims.",
    questions: [
      {
        id: "track",
        q: "How do I track my report?",
        a: "Use the Track Item feature and provide the information requested by the system to view the status of your submitted Lost & Found activity.",
      },
      {
        id: "statuses",
        q: "What do the different statuses mean?",
        a: "Statuses indicate the current stage of processing. Depending on the process, a report may be Pending, Approved, Claimed, or Rejected.",
      },
      {
        id: "pending",
        q: "Why is my report still pending?",
        a: "Pending means your report is still waiting for review or processing by authorized staff. Processing time may vary depending on the report.",
      },
    ],
  },

  {
    category: "Leaderboard & Points",
    icon: <FaTrophy />,
    description: "Understand the Honest Finders Leaderboard.",
    questions: [
      {
        id: "leaderboard",
        q: "How does the Honest Finders Leaderboard work?",
        a: "The Honest Finders Leaderboard ranks users based on points earned through eligible Lost & Found activities such as successful item surrender and verified claims.",
      },
      {
        id: "points",
        q: "How are points earned?",
        a: "Points are awarded according to the rules configured by system administrators for eligible Lost & Found activities.",
      },
      {
        id: "ranking",
        q: "Why can't I see the leaderboard?",
        a: "The leaderboard may be disabled by an administrator. When it is inactive, rankings and related points may not be displayed.",
      },
    ],
  },

  {
    category: "Privacy & Security",
    icon: <FaUserShield />,
    description: "Learn how your account and personal information are protected.",
    questions: [
      {
        id: "personal-info",
        q: "Who can see my personal information?",
        a: "Personal information should only be accessible to authorized personnel who need it to manage reports, claims, and other system processes.",
      },
      {
        id: "contact-info",
        q: "Can other students see my contact information?",
        a: "Private claimant and account information should not be publicly displayed to other users.",
      },
      {
        id: "account-security",
        q: "How can I keep my account secure?",
        a: "Keep your password private, never share your account, and change your password if you believe someone else may have access to it.",
      },
    ],
  },
];

const popularQuestions = [
  {
    icon: <FaClipboardCheck />,
    title: "How do I claim an item?",
    search: "claim",
  },
  {
    icon: <FaBoxOpen />,
    title: "How do I report a lost item?",
    search: "report lost",
  },
  {
    icon: <FaKey />,
    title: "I forgot my password",
    search: "forgot password",
  },
  {
    icon: <FaSearch />,
    title: "How do I track my report?",
    search: "track",
  },
];

export default function HelpCenter() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(null);
  const [showTop, setShowTop] = useState(false);
  const contentRef = useRef(null);

  const normalizedSearch = search.trim().toLowerCase();

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

  const searchPopular = (value) => {
    setSearch(value);
    setOpen(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Clears any search (the guide only shows on the main view) and
  // scrolls down to the step-by-step user guide.
  const openGuide = () => {
    setSearch("");
    setOpen(null);
    setTimeout(() => {
      document.getElementById("user-guide")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  // Goes back to wherever the visitor came from (PublicBoard links here via
  // window.location.href = "/help", a full navigation rather than an
  // in-app route change) — browser history.back() reverses that. Falls
  // back to the landing page if there's nowhere to go back to (e.g. this
  // was opened directly / in a new tab with no history).
  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else window.location.href = "/";
  };

  useEffect(() => {
  const handle = () => setShowTop(window.scrollY > 250);

  window.addEventListener("scroll", handle);
  return () => window.removeEventListener("scroll", handle);
}, []);

  return (
    // Fits the viewport instead of being a long scrolling page: the hero
    // (with the back button and search) stays put, and only the FAQ
    // content area below it scrolls, matching how the rest of the app's
    // views (PublicBoard, Leaderboard, Profile) behave.
    <div className="min-h-screen bg-[#F5F8FA] text-slate-800">

      {/* =========================================================
          HERO
      ========================================================= */}
      
<section className="relative overflow-hidden bg-[#0B648D]">
  <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-white/5 blur-xl" />

  <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-4">

    {/* Back button — right-aligned */}
    <div className="mb-4 flex justify-end">
      <button
        onClick={goBack}
        className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-2 text-white text-sm font-semibold backdrop-blur"
      >
        <FaArrowLeft size={12}/>
        Back
      </button>
    </div>

    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">

      <div className="max-w-xl">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-bold tracking-wider text-blue-100">
          <FaQuestionCircle/>
          SEEK & BALIK SUPPORT
        </div>

        <h1 className="mt-3 text-3xl md:text-5xl font-black text-white leading-tight">
          Help Center
        </h1>

        <p className="mt-2 text-blue-100 text-sm md:text-base leading-6">
          Everything you need to report, surrender, claim, track, and manage Lost & Found requests in one place.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-white text-center text-sm min-w-[220px]">
        <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
          <div className="text-xl font-black">8</div>
          Help Topics
        </div>
        <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
          <div className="text-xl font-black">30+</div>
          FAQs
        </div>
      </div>
    </div>

    <div className="mt-5 relative">
      <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-[#0B648D]"/>

      <input
        value={search}
        onChange={(e)=>{setSearch(e.target.value);setOpen(null);}}
        placeholder="Search claims, passwords, tracking, lost items..."
        className="
  w-full
  h-14
  rounded-2xl
  bg-white
  border border-white/30
  pl-12 pr-12
  text-sm text-slate-700
  placeholder:text-slate-400
  shadow-lg
  outline-none
  focus:border-[#0B648D]
  focus:ring-4 focus:ring-white/30
  transition-all
"
      />

      {search && (
        <button
          onClick={clearSearch}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
        >
          <FaTimes/>
        </button>
      )}
    </div>

    <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar pb-1">
      <button
        onClick={openGuide}
        className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-[#F59E0B] px-4 py-2 text-xs font-bold text-slate-900 hover:bg-white hover:text-[#0B648D] transition"
      >
        <FaListOl size={11}/>
        Step-by-step Guide
      </button>
      {faqData.map((cat)=>(
        <button
          key={cat.category}
          onClick={()=>searchPopular(cat.category)}
          className="whitespace-nowrap rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white hover:text-[#0B648D] transition"
        >
          {cat.category}
        </button>
      ))}
    </div>

    {normalizedSearch && (
      <div className="mt-3 text-xs text-blue-100">
        {resultCount} results for "{search.trim()}"
      </div>
    )}
  </div>
</section>


      {/* =========================================================
          MAIN — the only part of the page that scrolls
      ========================================================= */}
      <main ref={contentRef} className="max-w-6xl mx-auto px-5 pb-16">
        <div className="max-w-6xl mx-auto px-5 pb-16">

        {/* =======================================================
            DEFAULT LANDING CONTENT
        ======================================================= */}
        {!normalizedSearch && (
          <>

            {/* ABOUT + QUICK INFO */}
            <section className="grid md:grid-cols-2 gap-5 mt-6 relative">

              <div className="bg-white rounded-2xl p-6 md:p-7 shadow-lg border border-slate-100">

                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center text-[#0B648D] shrink-0">
                    <FaInfoCircle />
                  </div>

                  <div>
                    <h2 className="font-bold text-lg text-slate-800">
                      About Seek & Balik
                    </h2>

                    <p className="mt-2 text-sm text-slate-500 leading-6">
                      Seek & Balik is the Lost and Found Management System
                      of Saint Louis College, designed to make reporting,
                      surrendering, claiming, and tracking items easier.
                    </p>
                  </div>
                </div>

              </div>

              <div className="bg-white rounded-2xl p-6 md:p-7 shadow-lg border border-slate-100">

                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center text-[#0B648D] shrink-0">
                    <FaQuestionCircle />
                  </div>

                  <div>
                    <h2 className="font-bold text-lg text-slate-800">
                      Need an answer?
                    </h2>

                    <p className="mt-2 text-sm text-slate-500 leading-6">
                      Search above or browse the frequently asked questions
                      below to find the information you need.
                    </p>
                  </div>
                </div>

              </div>

            </section>

            
            {/* ================= QUICK ACTIONS ================= */}
            <section className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-[#0B648D]">
                    Quick Actions
                  </p>
                  <h2 className="text-2xl font-black text-slate-800">
                    Popular Help
                  </h2>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {popularQuestions.map((item)=>(
                  <button
                    key={item.title}
                    onClick={()=>searchPopular(item.search)}
                    className="rounded-2xl bg-gradient-to-br from-white to-slate-50 border border-slate-200 p-4 hover:border-[#0B648D] hover:shadow-md transition text-left"
                  >
                    <div className="w-10 h-10 rounded-xl bg-[#E6F4FB] flex items-center justify-center text-[#0B648D]">
                      {item.icon}
                    </div>

                    <p className="mt-3 text-sm font-semibold text-slate-700 leading-5">
                      {item.title}
                    </p>

                    <p className="mt-3 text-xs font-bold text-[#0B648D]">
                      Open FAQ →
                    </p>
                  </button>
                ))}
              </div>
            </section>

            {/* ================= STEP-BY-STEP USER GUIDE ================= */}
            <UserGuide />

          </>
        )}

        {/* =======================================================
            SEARCH EMPTY STATE
        ======================================================= */}
        {normalizedSearch && results.length === 0 && (
          <div className="mt-10">

            <div className="bg-white border border-slate-200 rounded-3xl px-6 py-14 text-center shadow-sm">

              <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 text-2xl">
                <FaSearch />
              </div>

              <h2 className="mt-5 text-xl font-black text-slate-800">
                No answers found
              </h2>

              <p className="mt-2 max-w-md mx-auto text-sm text-slate-500 leading-6">
                We couldn't find anything matching your search.
                Try a different keyword such as "claim", "password",
                "lost", or "track".
              </p>

              <button
                onClick={clearSearch}
                className="mt-6 px-5 py-2.5 rounded-xl bg-[#0B648D] hover:bg-[#095676] text-white text-sm font-semibold transition"
              >
                Browse all FAQs
              </button>

            </div>

          </div>
        )}

        {/* =======================================================
            FAQ SECTION
        ======================================================= */}
        {results.length > 0 && (
          <section className={normalizedSearch ? "mt-10" : "mt-12"}>

            {!normalizedSearch && (
              <div className="mb-6">
                <p className="text-xs font-bold tracking-widest text-[#0B648D] uppercase">
                  Help topics
                </p>

                <h2 className="text-2xl font-black text-slate-800 mt-1">
                  Frequently asked questions
                </h2>

                <p className="mt-2 text-sm text-slate-500">
                  Browse the topics below or use the search bar above.
                </p>
              </div>
            )}

            <div className="space-y-4">

              {results.map((section) => (
                <div
                  key={section.category}
                  className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm"
                >

                  {/* CATEGORY */}
                  <div className="px-6 py-5 flex items-center gap-4">

                    <div className="w-11 h-11 rounded-xl bg-blue-50 text-[#0B648D] flex items-center justify-center shrink-0">
                      {section.icon}
                    </div>

                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-800">
                        {section.category}
                      </h3>

                      <p className="text-xs text-slate-400 mt-0.5">
                        {section.description}
                      </p>
                    </div>

                    <div className="ml-auto shrink-0 px-3 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">
                      {section.questions.length}
                    </div>

                  </div>

                  {/* QUESTIONS */}
                  <div className="border-t border-slate-100">

                    {section.questions.map((item) => {
                      const isOpen = open === item.id;

                      return (
                        <div
                          key={item.id}
                          className="border-b last:border-b-0 border-slate-100"
                        >

                          <button
                            onClick={() => toggle(item.id)}
                            className="w-full px-4 md:px-6 py-4 md:py-5 flex items-center justify-between gap-4 text-left hover:bg-slate-50 transition-all duration-200"
                            aria-expanded={isOpen}
                          >

                            <span
                              className={`text-sm md:text-[15px] font-semibold transition-colors ${
                                isOpen
                                  ? "text-[#0B648D]"
                                  : "text-slate-700"
                              }`}
                            >
                              {item.q}
                            </span>

                            <span
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${
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

                          {isOpen && (
                            <div className="px-4 md:px-6 pb-5 animate-fadeIn">
                              <div className="ml-0 md:mr-14 rounded-xl bg-slate-50 border border-slate-100 px-5 py-4">
                                <p className="text-sm text-slate-600 leading-7">
                                  {item.a}
                                </p>
                              </div>
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
            CONTACT / FOOTER CARD
        ======================================================= */}
        <section className="mt-12">

          <div className="bg-[#154B70] rounded-3xl px-7 py-8 md:px-10 flex flex-col md:flex-row md:items-center justify-between gap-6 overflow-hidden relative">

            <div className="relative z-10">
              <p className="text-blue-200 text-xs font-bold tracking-widest uppercase">
                Still need assistance?
              </p>

              <h2 className="mt-2 text-2xl font-black text-white">
                Can't find what you're looking for?
              </h2>

              <p className="mt-2 text-sm text-blue-100">
                Contact the Student Affairs Office or an authorized system administrator.
              </p>
            </div>

            <div className="relative z-10 shrink-0">
              <div className="px-5 py-3 rounded-xl bg-white/10 border border-white/10 text-white text-sm font-semibold">
                Student Affairs Office
              </div>
            </div>

            <div className="absolute right-[-50px] top-[-80px] w-64 h-64 rounded-full bg-white/5" />

          </div>

        </section>

        </div>
      
</main>

      {showTop && (
        <button
          onClick={() => contentRef.current?.scrollTo({top:0,behavior:"smooth"})}
          className="fixed bottom-5 right-5 z-50 w-12 h-12 rounded-full bg-[#0B648D] text-white shadow-xl hover:bg-[#084d6c]"
        >
          <FaArrowUp className="mx-auto"/>
        </button>
      )}

    </div>
  );
}
