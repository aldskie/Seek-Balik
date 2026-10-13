import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorScheme, useColorScheme } from 'nativewind';

// Where the choice is saved on the phone.
const STORAGE_KEY = 'appAppearance';
const OPTIONS = ['light', 'dark', 'system'];

const AppearanceContext = createContext({
  appearance: 'system',
  isDark: false,
  setAppearance: () => {},
});

// Wrap the app in this once (see App.js). It loads the saved choice on
// startup, applies it to every `dark:` class in the app, and saves any change.
export function AppearanceProvider({ children }) {
  const [appearance, setAppearanceState] = useState('system');
  const [ready, setReady] = useState(false);
  // The scheme actually on screen: 'light' or 'dark' (never 'system').
  const { colorScheme: activeScheme } = useColorScheme();

  useEffect(() => {
    let cancelled = false;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (cancelled || !OPTIONS.includes(saved)) return;
        setAppearanceState(saved);
        colorScheme.set(saved);
      })
      .catch(() => {
        // Nothing saved or storage unavailable: stay on 'system'.
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const setAppearance = useCallback((next) => {
    if (!OPTIONS.includes(next)) return;
    setAppearanceState(next);
    colorScheme.set(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ appearance, isDark: activeScheme === 'dark', setAppearance }),
    [appearance, activeScheme, setAppearance],
  );

  // Wait for the saved choice so the app doesn't flash the wrong theme.
  if (!ready) return null;

  return (
    <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>
  );
}

// const { appearance, isDark, setAppearance } = useAppearance();
//   appearance    -> 'light' | 'dark' | 'system' (what the user picked)
//   isDark        -> true when the app is currently showing dark colors
//   setAppearance -> change and save the choice
export function useAppearance() {
  return useContext(AppearanceContext);
}