import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
} from 'react';
import { Animated } from 'react-native';

export const TAB_BAR_HIDE_DISTANCE = 120;

const DIRECTION_THRESHOLD = 2;

const TabBarVisibilityContext = createContext(null);

export function TabBarVisibilityProvider({ children }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const lastOffsetRef = useRef(0);
  const isHiddenRef = useRef(false);

  const animateTo = useCallback(
    (toValue) => {
      const shouldHide = toValue > 0;

      if (isHiddenRef.current === shouldHide) return;

      isHiddenRef.current = shouldHide;

      Animated.timing(translateY, {
        toValue,
        duration: 180,
        useNativeDriver: true,
      }).start();
    },
    [translateY]
  );

  const handleScroll = useCallback(
  (event) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;

    const maxOffset = Math.max(0, contentSize.height - layoutMeasurement.height);
    const currentOffset = Math.min(Math.max(contentOffset.y, 0), maxOffset);

    const previousOffset = lastOffsetRef.current;
    const distance = currentOffset - previousOffset;

    if (currentOffset <= 0) {
      animateTo(0);
    } else if (distance > DIRECTION_THRESHOLD) {
      animateTo(TAB_BAR_HIDE_DISTANCE);
    } else if (distance < -DIRECTION_THRESHOLD) {
      animateTo(0);
    }

    lastOffsetRef.current = currentOffset;
  },
  [animateTo]
);

  const hideTabBar = useCallback(() => {
    animateTo(TAB_BAR_HIDE_DISTANCE);
  }, [animateTo]);

  const showTabBar = useCallback(() => {
    animateTo(0);
  }, [animateTo]);

  // Snaps back to visible instantly, with no animation. Use this (instead of
  // showTabBar) right before the tab bar's screen is about to unmount, e.g. on
  // logout — an in-flight Animated.timing can get cut off by the unmount and
  // never settle, leaving the next mount of the tab bar reading a stale value.
  const resetTabBar = useCallback(() => {
    isHiddenRef.current = false;
    lastOffsetRef.current = 0;
    translateY.setValue(0);
  }, [translateY]);

  return (
    <TabBarVisibilityContext.Provider
      value={{ translateY, handleScroll, hideTabBar, showTabBar, resetTabBar }}
    >
      {children}
    </TabBarVisibilityContext.Provider>
  );
}

// Fallback ref used when hook is called outside TabBarVisibilityProvider
const fallbackTranslateY = new Animated.Value(0);
const noop = () => {};

export function useTabBarVisibility() {
  const context = useContext(TabBarVisibilityContext);

  // Return dummy implementations instead of throwing an error when unprovided
  if (!context) {
    return {
      translateY: fallbackTranslateY,
      handleScroll: noop,
      hideTabBar: noop,
      showTabBar: noop,
      resetTabBar: noop,
    };
  }

  return context;
}