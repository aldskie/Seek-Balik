import React, { useEffect, useMemo } from 'react';
import { Animated, Text, View, useWindowDimensions } from 'react-native';
import { DarkTheme, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator, BottomTabBar } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { Ionicons } from '@expo/vector-icons';
import { Home, Plus, UserRound } from 'lucide-react-native';

import { useTabBarVisibility } from '../hooks/TabBarVisibility';
import { useAppearance } from '../hooks/Appearance';
import { refreshUnreadCount, useUnreadCount } from '../hooks/UnreadNotifications';

import AddItems from '../screens/admin/AddItems';
import Dashboard from '../screens/admin/Dashboard';
import AdminProfileScreen from '../screens/admin/AdminProfileScreen';
import ProfileScreen from '../screens/ProfileScreen';
import HomeScreen from '../screens/HomeScreen';
import Leaderboards from '../screens/admin/Leaderboards';
import LeaderboardsScreen from '../screens/LeaderboardScreen';
import TrackItemScreen from '../screens/TrackItemScreen';
import ReportLostItemScreen from '../screens/ReportLostItemScreen';
import ItemsScreen from '../screens/admin/ItemsScreen';

const Tab = createBottomTabNavigator();

const TAB_BAR_SIDE_INSET = 16;
const TAB_BAR_BOTTOM_INSET = 16;
const TAB_BAR_MAX_WIDTH = 480;

// How often the tab bar badge checks for new notifications.
const UNREAD_POLL_MS = 10000;
const BADGE_RED = '#DC2626';

// Roles whose tab bar shows the unread-notification badge.
const BADGE_ROLES = ['student', 'employee', 'admin', 'moderator'];

// Tab bar colors for each appearance.
const TAB_COLORS = {
  light: {
    active: '#1b2061',
    inactive: '#9a9a9a',
    activePill: '#EEF0FA',
    bar: '#FFFFFF',
    border: '#E7EBF3',
    shadow: '#16233F',
  },
  dark: {
    active: '#C7D2FE',
    inactive: '#64748B',
    activePill: '#312E81',
    bar: '#0F172A',
    border: '#1E293B',
    shadow: '#000000',
  },
};

// Navigation theme for light mode (the name MyTheme is kept for existing imports).
export const MyTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#FFFFFF',
    card: '#FFFFFF',
  },
};

// Navigation theme for dark mode, so the area behind screens isn't white.
export const MyDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: '#020617',
    card: '#0F172A',
  },
};

// One tab icon inside its rounded "pill". Reads the current appearance itself,
// so it recolors as soon as the user switches Light / Dark.
// With showBadge, a red unread-notification badge sits on the icon's corner.
function TabIcon({ Icon, iconProps, color, size, focused, showBadge = false }) {
  const { isDark } = useAppearance();
  const colors = isDark ? TAB_COLORS.dark : TAB_COLORS.light;
  const unreadCount = useUnreadCount();
  const badgeVisible = showBadge && unreadCount > 0;

  return (
    <View
      style={{
        minWidth: 55,
        height: 30,
        paddingHorizontal: 11,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 16,
        backgroundColor: focused ? colors.activePill : 'transparent',
      }}
    >
      <Icon {...iconProps} size={size ?? 22} color={focused ? colors.active : color} />

      {badgeVisible ? (
        <View
          style={{
            position: 'absolute',
            top: -4,
            right: 6,
            minWidth: 16,
            height: 16,
            paddingHorizontal: 4,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 8,
            backgroundColor: BADGE_RED,
            // Ring in the bar's color so the badge stands off the icon.
            borderWidth: 1.5,
            borderColor: colors.bar,
          }}
        >
          <Text style={{ color: '#FFFFFF', fontSize: 9, fontWeight: '700', lineHeight: 11 }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const icon = (Icon, props = {}, { showBadge = false } = {}) => ({ color, size, focused }) => (
  <TabIcon
    Icon={Icon}
    iconProps={props}
    color={color}
    size={size}
    focused={focused}
    showBadge={showBadge}
  />
);

const staffTabs = [
  {
    name: 'Dashboard',
    component: Dashboard,
    label: 'Dashboard',
    // Shows the unread-notification badge.
    icon: icon(Ionicons, { name: 'speedometer' }, { showBadge: true }),
  },
  {
    name: 'Items',
    component: ItemsScreen,
    label: 'Items',
    icon: icon(Ionicons, { name: 'warning' }),
  },
  {
    name: 'Camera',
    component: AddItems,
    label: 'Report',
    icon: icon(Plus),
  },
  {
    name: 'Leaderboard',
    component: Leaderboards,
    label: 'Leaderboard',
    icon: icon(Ionicons, { name: 'trophy' }),
  },
  {
    name: 'Profile',
    component: AdminProfileScreen,
    label: 'Profile',
    icon: icon(UserRound),
  },
];

const userTabs = [
  {
    name: 'Home',
    component: HomeScreen,
    label: 'Home',
    // Shows the unread-notification badge.
    icon: icon(Home, {}, { showBadge: true }),
  },
  {
    name: 'Track Item',
    component: TrackItemScreen,
    label: 'Track',
    icon: icon(Ionicons, { name: 'navigate-outline' }),
  },
  {
    name: 'Camera',
    component: ReportLostItemScreen,
    label: 'Report',
    icon: icon(Plus),
  },
  {
    name: 'Leaderboard',
    component: LeaderboardsScreen,
    label: 'Leaderboard',
    icon: icon(Ionicons, { name: 'trophy-outline' }),
  },
  {
    name: 'Profile',
    component: ProfileScreen,
    label: 'Profile',
    icon: icon(UserRound),
  },
];

// UI navigation is selected from the authenticated user's role. Unknown roles
// fail closed and receive no tab routes.
const tabsByRole = {
  admin: staffTabs,
  moderator: staffTabs,
  student: userTabs,
  employee: userTabs,
};

function FloatingTabBar(props) {
  const { translateY } = useTabBarVisibility();
  const { width } = useWindowDimensions();
  const barWidth = Math.min(width - TAB_BAR_SIDE_INSET * 2, TAB_BAR_MAX_WIDTH);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: TAB_BAR_BOTTOM_INSET,
        alignItems: 'center',
        zIndex: 10,
        transform: [{ translateY }],
      }}
    >
      <View style={{ width: barWidth }}>
        <BottomTabBar {...props} />
      </View>
    </Animated.View>
  );
}

function TabButton(props) {
  return <PlatformPressable {...props} pressColor="transparent" pressOpacity={1} />;
}

// Tab bar options for the given appearance.
const buildScreenOptions = (colors) => ({
  headerShown: false,
  tabBarActiveTintColor: colors.active,
  tabBarInactiveTintColor: colors.inactive,
  tabBarShowLabel: true,
  tabBarButton: (props) => <TabButton {...props} />,
  tabBarLabel: ({ children, color }) => (
    <Text
      numberOfLines={1}
      style={{ color, fontSize: 9, fontWeight: '600', marginTop: 1 }}
    >
      {children}
    </Text>
  ),
  tabBarLabelStyle: { fontSize: 9, fontWeight: '600' },
  tabBarItemStyle: { paddingTop: 4 },
  tabBarStyle: {
    height: 68,
    borderRadius: 24,
    backgroundColor: colors.bar,
    borderTopWidth: 0,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: 5,
    paddingBottom: 7,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
});

export default function TabsLayout({ route }) {
  const { isDark } = useAppearance();
  const screenOptions = useMemo(
    () => buildScreenOptions(isDark ? TAB_COLORS.dark : TAB_COLORS.light),
    [isDark],
  );

  const role = String(route?.params?.user?.role ?? '').trim().toLowerCase();
  const roleTabs = tabsByRole[role];
  const showsBadge = BADGE_ROLES.includes(role);

  // Keeps the badge current on every tab, not only while Home is open.
  useEffect(() => {
    if (!showsBadge) return undefined;

    refreshUnreadCount();
    const interval = setInterval(refreshUnreadCount, UNREAD_POLL_MS);

    return () => clearInterval(interval);
  }, [showsBadge]);

  if (!roleTabs) return null;

  return (
    <Tab.Navigator
      key={role}
      initialRouteName={roleTabs[0].name}
      screenOptions={screenOptions}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      {roleTabs.map(({ name, component, label, icon: renderIcon }) => (
        <Tab.Screen
          key={name}
          name={name}
          component={component}
          options={{
            tabBarLabel: label,
            tabBarIcon: renderIcon,
          }}
        />
      ))}
    </Tab.Navigator>
  );
}