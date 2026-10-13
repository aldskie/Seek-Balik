import React, { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import LoginModal from '../components/LoginModal';

import PublicBoard from './PublicLanding';


import { useLocation, useNavigate } from 'react-router-dom';

const AppInner = () => {
  const { setLogin } = useApp();
  const [showLogin, setShowLogin] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // "Log in again" on the staff Session Expired notice
  // (StaffSessionGuard.jsx) sends { openLogin: true } here; a password
  // change (UserProfile.jsx) sends "/?login=1".
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('login') === '1') {
      setShowLogin(true);
      navigate(location.pathname, { replace: true });
      return;
    }
    if (location.state?.openLogin) {
      setShowLogin(true);
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, location.search]);

  const handleLogin = (role) => {
  setLogin(role);
  setShowLogin(false);

  navigate('/dashboard', { replace: true });
};

  return (
    <>
      <PublicBoard onOpenLogin={() => setShowLogin(true)} />
      {showLogin && <LoginModal onLogin={handleLogin} onClose={() => setShowLogin(false)} />}
    </>
  );
};

export default AppInner;