import slcLogo from "../assets/slc-logo.png";
import saoLogo from "../assets/sao.png";
import seekBalikLogo from "../assets/seek-balik-logo.jpg";

const Header = ({
  variant = "public",
  time,
  date,
  onOpenLogin,
  showLogin = false,
  rightContent,
  onLogoClick,
  // Extra controls beside the clock on the dashboard (e.g. the
  // notification bell).
  actions,
}) => {
  return (
    <header className="w-full bg-[#005F86] border-b border-white/10 px-4 sm:px-5 lg:px-6 py-2 sm:py-3 flex flex-col md:flex-row md:justify-between md:items-center gap-4">

  <div className="flex items-center gap-3 sm:gap-4 min-w-0">

    <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
      <img
        src={slcLogo}
        alt="SLC Logo"
        onClick={onLogoClick}
        className={`w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 object-contain ${
          onLogoClick ? "cursor-pointer hover:opacity-80 transition-opacity" : ""
        }`}
      />

  
      <img
        src={saoLogo}
        alt="SAO Logo"
        className="w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 object-contain rounded-full"
      />
    </div>

    <div className="leading-tight min-w-0">
      <h1 className="text-white text-2xl sm:text-3xl lg:text-4xl font-normal font-old-english leading-none">
        Saint Louis College
      </h1>

      <p className="text-white text-xs sm:text-sm lg:text-base mt-1">
        Seek & Balik: A Lost and Found Management System
      </p>
    </div>

  </div>

  {variant === "dashboard" ? (
    <div className="flex items-center justify-between md:justify-end gap-4 md:mr-8 border-t border-white/15 md:border-t-0 pt-3 md:pt-0 w-full md:w-auto">
      <div className="flex md:flex-col items-baseline md:items-end gap-3 md:gap-0 text-white">
        <p className="text-lg sm:text-xl lg:text-2xl font-bold font-mono">
          {time}
        </p>

        <p className="text-xs uppercase opacity-70">
          {date}
        </p>
      </div>

      {actions}
    </div>
  ) : (
    <div className="w-full md:w-auto flex justify-start md:justify-end border-t border-white/15 md:border-t-0 pt-3 md:pt-0">
      {rightContent}

      {!rightContent && showLogin && (
        <button
          type="button"
          onClick={onOpenLogin}
          title="Log in to your account"
          // Rounded pill with clear clickable feedback: pointer cursor,
          // lift + glow on hover, press-down on click, focus ring.
          className="group inline-flex w-full sm:w-auto cursor-pointer items-center justify-center gap-2 rounded-full border border-white/50 bg-white px-6 py-2.5 text-sm font-bold uppercase tracking-wide text-[#005F86] shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#EAF6FB] hover:shadow-lg active:translate-y-0 active:scale-95 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
            aria-hidden="true"
          >
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" y1="12" x2="3" y2="12" />
          </svg>
          Login
        </button>
      )}
    </div>
  )}
</header>
  );
};

export default Header;