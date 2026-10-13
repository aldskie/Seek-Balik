import React from 'react';

const MobileNav = ({ currentPage, setCurrentPage, role, onLogout }) => {
  const items = [
    { id: 'Dashboard', label: 'Home', emoji: '◼' },
    { id: 'Lost Items', label: 'Lost', emoji: '◈' },
    { id: 'Found Items', label: 'Surrendered', emoji: '◈' },
    ...(role === 'Admin'
      ? [{ id: 'Users', label: 'Users', emoji: '◉' }]
      : []),
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-30 flex sm:hidden">
      {items.map(item => (
        <button
          key={item.id}
          onClick={() => setCurrentPage(item.id)}
          className={`flex-1 flex flex-col items-center py-3 gap-0.5 text-[8px] font-black uppercase tracking-wide transition-colors relative ${currentPage === item.id
              ? 'text-[#2D366D]'
              : 'text-slate-400'
            }`}
        >
          <span className="text-base leading-none">
            {item.emoji}
          </span>

          {item.label}
        </button>
      ))}

      <button
        onClick={onLogout}
        className="flex-1 flex flex-col items-center py-3 gap-0.5 text-[8px] font-black uppercase tracking-wide text-red-400"
      >
        <span className="text-base leading-none">↩</span>
        Logout
      </button>
    </nav>
  );
};

export default MobileNav;