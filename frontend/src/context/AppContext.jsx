import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { createClaim, getCurrentUser } from "../api/api";

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export const AppProvider = ({ children }) => {
  // =====================
  // STATE
  // =====================
  const [lostItems, setLostItems] = useState([]);
  const [foundItems, setFoundItems] = useState([]);
  const [users, setUsers] = useState([]);

  // Counters
  const lostCounter = useRef(1);
  const foundCounter = useRef(1);
  const userCounter = useRef(1);

  // =====================
  // AUTHENTICATION STATE
  // =====================
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(
    () => localStorage.getItem('isLoggedIn') === 'true'
  );
  const [userRole, setUserRole] = useState(
    () => localStorage.getItem('userRole') || ''
  );

  // Restore authenticated session on initial mount
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        try {
          const user = await getCurrentUser();
          // Still on the emailed temporary password: not a real session
          // yet. Log out so they must log in and change it first.
          if (user?.must_change_password) {
            logout();
            setAuthLoading(false);
            return;
          }
          setCurrentUser(user);
          setIsLoggedIn(true);
          setUserRole(user.role || '');
          localStorage.setItem('isLoggedIn', 'true');
          if (user.role) localStorage.setItem('userRole', user.role);
          localStorage.setItem('userName', `${user.first_name || ''} ${user.last_name || ''}`.trim());
        } catch (err) {
          console.error("Session verification failed:", err);
          logout();
        }
      }
      setAuthLoading(false);
    };

    initAuth();
  }, []);

  // Login handler accepting user profile object or role string
  const setLogin = (userOrRole) => {
    setIsLoggedIn(true);

    if (typeof userOrRole === 'object' && userOrRole !== null) {
      setCurrentUser(userOrRole);
      setUserRole(userOrRole.role || '');
      localStorage.setItem('userRole', userOrRole.role || '');
      localStorage.setItem(
        'userName',
        `${userOrRole.first_name || ''} ${userOrRole.last_name || ''}`.trim()
      );
    } else {
      setUserRole(userOrRole);
      localStorage.setItem('userRole', userOrRole);
    }

    localStorage.setItem('isLoggedIn', 'true');
    // Start the 5-minute inactivity clock (see PublicLanding.jsx).
    localStorage.setItem('lastActivityAt', String(Date.now()));
  };

  // Complete session reset
  const logout = () => {
    setIsLoggedIn(false);
    setUserRole('');
    setCurrentUser(null);
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userRole');
    localStorage.removeItem('userName');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('lastActivityAt');
  };

  // =====================
  // CLAIM API
  // =====================
  // FIX: this previously hand-picked only a subset of fields
  // (item, claimant_name, claimant_contact, claimant_email,
  // meeting_date, meeting_time, proof_description), silently dropping
  // question_1..4, answer_1..4, other_description, and
  // needs_manual_review before the request ever left the browser.
  // ClaimModal.jsx sends all of those, and ClaimRequests.jsx reads all
  // of them back (buildAnswerComparison, the Review modal's per-
  // question breakdown, isPendingReview's needs_manual_review check,
  // etc.) — so any claim submitted through the old whitelist either
  // came back malformed or was rejected outright by the backend
  // serializer if those fields were required, meaning it never got
  // created and could never show up in getClaims(). Forwarding the
  // full payload through unchanged fixes both cases.
  const submitClaimRequest = async (data) => {
    return await createClaim(data);
  };

  // =====================
  // LOST ITEMS
  // =====================
  const addLostItem = (item) =>
    setLostItems(p => [
      {
        ...item,
        id: `L${String(lostCounter.current++).padStart(3, '0')}`,
        status: 'Pending'
      },
      ...p
    ]);

  const updateLostItem = (id, u) =>
    setLostItems(p => p.map(i => i.id === id ? { ...i, ...u } : i));

  const deleteLostItem = (id) =>
    setLostItems(p => p.filter(i => i.id !== id));

  // =====================
  // FOUND ITEMS
  // =====================
  const addFoundItem = (item) =>
    setFoundItems(p => [
      {
        ...item,
        id: `F${String(foundCounter.current++).padStart(3, '0')}`,
        status: 'Available'
      },
      ...p
    ]);

  const updateFoundItem = (id, u) =>
    setFoundItems(p => p.map(i => i.id === id ? { ...i, ...u } : i));

  const deleteFoundItem = (id) =>
    setFoundItems(p => p.filter(i => i.id !== id));

  // =====================
  // USERS
  // =====================
  const addUser = (user) =>
    setUsers(p => [
      {
        ...user,
        id: `U${String(userCounter.current++).padStart(3, '0')}`,
        status: 'Active'
      },
      ...p
    ]);

  const updateUser = (id, u) =>
    setUsers(p => p.map(x => x.id === id ? { ...x, ...u } : x));

  const deleteUser = (id) =>
    setUsers(p => p.filter(x => x.id !== id));

  return (
    <AppContext.Provider
      value={{
        lostItems,
        foundItems,
        users,

        addLostItem,
        updateLostItem,
        deleteLostItem,

        addFoundItem,
        updateFoundItem,
        deleteFoundItem,

        addUser,
        updateUser,
        deleteUser,

        submitClaimRequest,

        // Auth properties
        currentUser,
        setCurrentUser,
        authLoading,
        isLoggedIn,
        userRole,
        setLogin,
        logout
      }}
    >
      {children}
    </AppContext.Provider>
  );
};
