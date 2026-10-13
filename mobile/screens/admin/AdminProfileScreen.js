import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  InteractionManager,
  ScrollView,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import {
  ChevronRight,
  HelpCircle,
  Lock,
  LogOut,
  MessageSquareWarning,
  Moon,
  Smartphone,
  User,
} from 'lucide-react-native';

import { getCurrentUser, logoutUser } from '../../api/api';
import { useTabBarVisibility } from '../../hooks/TabBarVisibility';
import { useConfirmationModal } from '../../components/ConfirmationModal';
import { useAppearance } from '../../hooks/Appearance';
import { setUnreadCount } from '../../hooks/UnreadNotifications';

const NAVY = '#1b2061';
const LOGOUT_TRANSITION_MS = 900;

const getInitials = (fullName) =>
  fullName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'AD';

export default function AdminProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { handleScroll, resetTabBar } = useTabBarVisibility();
  const { confirmationModal, showFeedback, showConfirm } = useConfirmationModal();
  const { isDark, setAppearance } = useAppearance();

  // Navy icons and spinners turn light indigo on dark backgrounds.
  const accent = isDark ? '#C7D2FE' : NAVY;
  const switchTrack = {
    false: isDark ? '#334155' : '#E2E8F0',
    true: isDark ? '#4F46E5' : NAVY,
  };
  const dangerColor = isDark ? '#FB7185' : '#E11D48';

  const [account, setAccount] = useState(null);
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [accountError, setAccountError] = useState('');

  // The switch keeps its own value so it moves the moment it is pressed,
  // instead of waiting for the app-wide theme change and snapping back.
  const [darkSwitch, setDarkSwitch] = useState(isDark);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Follow the real theme when it changes from anywhere else.
  useEffect(() => {
    setDarkSwitch(isDark);
  }, [isDark]);

  const handleDarkModeToggle = (value) => {
    setDarkSwitch(value);
    // Let the switch finish sliding before the whole screen re-colors.
    setTimeout(() => setAppearance(value ? 'dark' : 'light'), 150);
  };

  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then((value) => {
        if (!cancelled) setAccount(value || null);
      })
      .catch(() => {
        if (!cancelled) setAccountError('We could not load your account information. Please check your connection and sign in again.');
      })
      .finally(() => {
        if (!cancelled) setLoadingAccount(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const firstName = account?.first_name || account?.firstName || '';
  const lastName = account?.last_name || account?.lastName || '';
  const name = `${firstName} ${lastName}`.trim() || 'Admin Account';
  const email = account?.email || 'Not available';
  const role = (account?.role || 'admin').toUpperCase();
  const initials = getInitials(name);

  // Reported Issues is for admins only; the backend refuses moderators.
  // Hidden while the account is still loading, so it never flashes for a
  // moderator.
  const isAdmin =
    String(account?.role || '').trim().toLowerCase() === 'admin' ||
    account?.is_superuser === true;

  const handleLogout = () => {
    showConfirm({
      title: 'Confirm Logout',
      message: 'Are you sure you want to sign out?',
      tone: 'warning',
      confirmLabel: 'Log Out',
      cancelLabel: 'Cancel',
      destructive: true,
      onConfirm: async () => {
        setIsLoggingOut(true);
        try {
          await logoutUser();
          // Clear the badge so the next account doesn't start with this one's count.
          setUnreadCount(0);

          await new Promise((resolve) => setTimeout(resolve, LOGOUT_TRANSITION_MS));

          // Reset the tab bar right away so the next session never starts
          // with a bar left hidden by a scroll or by a form (e.g. Add Item).
          resetTabBar();

          setAccount(null);
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });

          // ...and once more after the navigation transition has settled,
          // in case the reset above ran before the new tree was ready.
          requestIdleCallback(() => {
              resetTabBar();
            });
        } catch {
          setIsLoggingOut(false);
          showFeedback({
            title: 'Logout failed',
            message: 'Please try again.',
            tone: 'error',
          });
        }
      },
    });
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <StatusBar style="light" backgroundColor={NAVY} translucent={false} />

      <SafeAreaView edges={['top']} className="rounded-b-3xl bg-[#1b2061]">
        <View className="px-4 pb-6 pt-2">
          <Text className="text-[12px] font-bold tracking-widest text-white/60">ADMIN</Text>
          <Text className="text-2xl font-bold text-white">Profile</Text>
        </View>
      </SafeAreaView>

      <ScrollView
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: insets.bottom + 24 }}
      >
        <TouchableOpacity
          onPress={() => navigation.navigate('AccountDetails')}
          activeOpacity={0.85}
          className="mb-6 flex-row items-center justify-between rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-4"
        >
          <View className="flex-1 flex-row items-center pr-3">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-[#1b2061] dark:bg-indigo-600">
              <Text className="text-sm font-bold text-white">{initials}</Text>
            </View>

            <View className="ml-3 flex-1">
              <View className="flex-row items-center">
                {loadingAccount ? (
                  <ActivityIndicator size="small" color={accent} />
                ) : (
                  <Text className="mr-2 text-sm font-bold text-[#16233F] dark:text-slate-100" numberOfLines={1}>
                    {name}
                  </Text>
                )}

                <View className="ml-2 rounded-full bg-indigo-100 dark:bg-indigo-950 px-2 py-0.5">
                  <Text className="text-[10px] font-bold text-indigo-600 dark:text-indigo-300">{role}</Text>
                </View>
              </View>

              <Text className="mt-1 text-xs text-slate-500 dark:text-slate-400" numberOfLines={1}>
                {loadingAccount ? 'Loading…' : email}
              </Text>
            </View>
          </View>

          <View className="h-9 w-9 items-center justify-center">
            <ChevronRight size={18} color="#9AA3B5" />
          </View>
        </TouchableOpacity>

        {!!accountError && (
          <View className="mb-6 rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950 p-3">
            <Text className="text-xs font-semibold text-rose-700 dark:text-rose-300">{accountError}</Text>
          </View>
        )}

        <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">App Preferences</Text>

        <View className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <View className="flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-2">
            <View className="flex-row items-center">
              <View className="mr-3 h-9 w-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                <Moon size={18} color={accent} />
              </View>
              <Text className="text-sm font-semibold text-[#16233F] dark:text-slate-100">Dark Mode</Text>
            </View>

            <Switch
              value={darkSwitch}
              onValueChange={handleDarkModeToggle}
              trackColor={switchTrack}
              thumbColor="#FFFFFF"
              style={{ transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }] }}
            />
          </View>
        </View>

        <Text className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Account & Support</Text>

        <View className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <TouchableOpacity
            onPress={() => navigation.navigate('UpdatePassword')}
            className="flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-3"
          >
            <View className="flex-row items-center">
              <View className="mr-3 h-9 w-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                <Lock size={18} color={accent} />
              </View>
              <Text className="text-sm font-semibold text-[#16233F] dark:text-slate-100">Change Password</Text>
            </View>

            <ChevronRight size={16} color="#9AA3B5" />
          </TouchableOpacity>

          {isAdmin && (
          <TouchableOpacity
            onPress={() => navigation.navigate('ReportedIssues')}
            className="flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-3"
          >
            <View className="flex-row items-center">
              <View className="mr-3 h-9 w-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                <MessageSquareWarning size={18} color={accent} />
              </View>
              <Text className="text-sm font-semibold text-[#16233F] dark:text-slate-100">Reported Issues</Text>
            </View>

            <ChevronRight size={16} color="#9AA3B5" />
          </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={() => navigation.navigate('HelpCenter')}
            className="flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-3"
          >
            <View className="flex-row items-center">
              <View className="mr-3 h-9 w-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                <HelpCircle size={18} color={accent} />
              </View>
              <Text className="text-sm font-semibold text-[#16233F] dark:text-slate-100">Help Center & FAQ</Text>
            </View>

            <ChevronRight size={16} color="#9AA3B5" />
          </TouchableOpacity>

          <View className="flex-row items-center justify-between px-4 py-3">
            <View className="flex-row items-center">
              <View className="mr-3 h-9 w-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                <User size={18} color={accent} />
              </View>
              <Text className="text-sm font-semibold text-[#16233F] dark:text-slate-100">App Version</Text>
            </View>

            <Text className="text-xs font-medium text-slate-400 dark:text-slate-500">v1.0.4 · Build 2026</Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleLogout}
          disabled={isLoggingOut}
          className="mb-6 mt-6 h-12 flex-row items-center justify-center rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950"
        >
          {isLoggingOut ? (
            <ActivityIndicator size="small" color={dangerColor} />
          ) : (
            <>
              <LogOut size={16} color={dangerColor} />
              <Text className="ml-2 text-sm font-bold text-rose-600 dark:text-rose-300">LOG OUT</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {isLoggingOut && (
        <View className="absolute inset-0 items-center justify-center bg-[#1b2061]/35 dark:bg-black/60" pointerEvents="none">
          <View className="items-center rounded-2xl bg-white dark:bg-slate-800 px-6 py-5 shadow-xl">
            <ActivityIndicator size="large" color={accent} />
            <Text className="mt-3 text-sm font-bold text-[#1b2061] dark:text-indigo-200">Logging out...</Text>
          </View>
        </View>
      )}

      {confirmationModal}
    </View>
  );
}