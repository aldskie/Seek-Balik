import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  FaUser, 
  FaLock, 
  FaExclamationCircle, 
  FaShieldAlt, 
  FaArrowRight, 
  FaTimes,
  FaSignOutAlt,
  FaIdCard,
  FaEnvelope,
  FaChevronDown,
  FaEye,
  FaEyeSlash
} from 'react-icons/fa';

// ================= USER PROFILE & LOGOUT DROPDOWN =================
export function UserProfile({ user, onLogout }) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const userData = user || JSON.parse(localStorage.getItem('slc_user')) || {
    id: '2026-0001',
    name: 'SLC User'
  };

  const handleLogoutClick = () => {
    localStorage.removeItem('slc_user');
    if (onLogout) onLogout();
    navigate('/');
  };

  return (
    <div className="relative font-sans inline-block text-left">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 bg-white/10 hover:bg-white/20 text-white px-3.5 py-1.5 rounded-full border border-white/20 transition-all duration-200 focus:outline-none"
      >
        <div className="w-7 h-7 rounded-full bg-amber-400 text-[#005B82] flex items-center justify-center font-black text-xs shadow-sm">
          {userData.id ? userData.id.charAt(0) : 'U'}
        </div>
        <div className="text-left hidden sm:block">
          <p className="text-xs font-bold leading-none">{userData.name || 'SLC Account'}</p>
          <p className="text-[10px] text-sky-100/80 leading-none mt-0.5">{userData.id}</p>
        </div>
        <FaChevronDown size={10} className={`text-sky-200 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 mt-2 w-72 bg-white rounded-3xl shadow-2xl border border-slate-200/80 z-40 overflow-hidden animate-in fade-in duration-200">
            <div className="bg-gradient-to-r from-[#005B82] to-[#007fb5] p-5 text-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-400 text-[#005B82] flex items-center justify-center font-black text-lg shadow-md border-2 border-white/20">
                  {userData.id ? userData.id.charAt(0) : 'U'}
                </div>
                <div>
                  <h4 className="font-bold text-sm leading-snug">{userData.name || 'SLC Student'}</h4>
                  <span className="inline-flex items-center gap-1 bg-white/20 text-white text-[10px] px-2 py-0.5 rounded-full font-medium mt-1">
                    <FaShieldAlt size={9} className="text-amber-300" /> Verified User
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 space-y-3 text-xs text-slate-600 bg-slate-50/50">
              <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white border border-slate-100">
                <FaIdCard className="text-[#005B82]" size={14} />
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">User ID</p>
                  <p className="font-bold text-slate-700">{userData.id}</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 p-2 rounded-xl bg-white border border-slate-100">
                <FaEnvelope className="text-[#005B82]" size={14} />
                <div className="overflow-hidden">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">System Status</p>
                  <p className="font-medium text-emerald-600 truncate">● Active Session</p>
                </div>
              </div>
            </div>

            {/* LOGOUT BUTTON */}
            <div className="p-3 bg-white border-t border-slate-100">
              <button
                onClick={handleLogoutClick}
                className="w-full py-2.5 px-4 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-2xl text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <FaSignOutAlt size={13} />
                <span>Log Out of System</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ================= LOGIN FORM CONTENT =================
function LoginFormContent({ isModal, onClose, onLoginSuccess }) {
  const navigate = useNavigate();
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  // Eye button on the password field: show / hide what was typed.
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = (e) => {
    e.preventDefault();
    setError('');

    if (!studentId.trim() || !password.trim()) {
      setError('Please enter both your Id Number and Password.');
      return;
    }

    setLoading(true);

    setTimeout(() => {
      setLoading(false);
      const user = { id: studentId, name: 'SLC Student' };
      localStorage.setItem('slc_user', JSON.stringify(user));

      if (onLoginSuccess) onLoginSuccess(user);
      if (onClose) onClose();

      // Redirect if standalone page
      if (!isModal) {
        navigate('/landing');
      }
    }, 800);
  };

  return (
    <div className="bg-white w-full max-w-md rounded-3xl shadow-xl border border-slate-200/80 overflow-hidden relative">
      {/* Modal Close Button */}
      {isModal && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center text-white transition-colors"
        >
          <FaTimes size={14} />
        </button>
      )}

      {/* Card Header */}
      <div className="bg-gradient-to-r from-[#005B82] to-[#007fb5] p-8 text-center text-white relative">
        <div className="w-16 h-16 bg-white/10 rounded-2xl mx-auto flex items-center justify-center mb-3 backdrop-blur-sm border border-white/20">
          <FaShieldAlt size={30} className="text-amber-300" />
        </div>
        <h2 className="text-2xl font-black tracking-tight">Student Portal Login</h2>
        <p className="text-xs text-sky-100 mt-1">Sign in to report, track, or claim lost items</p>
      </div>

      {/* Form */}
      <form onSubmit={handleLogin} className="p-8 space-y-5">
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-600 flex items-center gap-2">
            <FaExclamationCircle className="shrink-0 text-sm" />
            <span>{error}</span>
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            User Account
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <FaUser size={13} />
            </div>
            <input
              type="text"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder="e.g. 2026-0001"
              className="w-full pl-10 pr-4 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#005B82]/30 bg-slate-50/50"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
            Password
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <FaLock size={13} />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="w-full pl-10 pr-10 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#005B82]/30 bg-slate-50/50"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              title={showPassword ? 'Hide password' : 'Show password'}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-xl text-slate-400 transition hover:text-[#005B82]"
            >
              {showPassword ? <FaEyeSlash size={14} /> : <FaEye size={14} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-[#005B82] hover:bg-[#004766] disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <span>Login</span>
              <FaArrowRight size={12} />
            </>
          )}
        </button>
      </form>
    </div>
  );
}

// ================= MAIN COMBINED LOGIN PAGE / MODAL =================
export default function LoginPage({ isModal = false, isOpen = true, onClose, onLoginSuccess }) {
  if (isModal) {
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 font-sans animate-in fade-in duration-200">
        <LoginFormContent isModal={true} onClose={onClose} onLoginSuccess={onLoginSuccess} />
      </div>
    );
  }

  // Render full page view
  return (
    <div className="min-h-screen bg-[#f4f7f9] font-sans text-slate-800 flex flex-col justify-between">
      {/* Header */}
      <header className="bg-[#005B82] text-white px-8 py-3.5 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center font-bold text-xs border border-white/20">
            SLC
          </div>
          <div>
            <h1 className="font-serif text-xl font-bold tracking-wide">Saint Louis College</h1>
            <p className="text-[11px] text-sky-100 font-sans tracking-wide">
              Seek & Balik: A Lost and Found Management System
            </p>
          </div>
        </div>
      </header>

      {/* Login Card */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <LoginFormContent isModal={false} onLoginSuccess={onLoginSuccess} />
      </div>

      <footer className="text-center text-[11px] text-slate-400 py-4">
        SLC Seek & Balik Centralized Account Services
      </footer>
    </div>
  );
}