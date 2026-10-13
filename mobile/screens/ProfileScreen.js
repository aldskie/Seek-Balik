import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import {
  CalendarCheck2,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  HelpCircle,
  Lock,
  LogOut,
  MapPin,
  MessageSquareWarning,
  MonitorSmartphone,
  Moon,
  ShieldCheck,
  Smartphone,
  Sun,
} from 'lucide-react-native';

import { getCurrentUser, logoutUser } from '../api/api';
import { useTabBarVisibility } from '../hooks/TabBarVisibility';
import { useAppearance } from '../hooks/Appearance';
import { unregisterPushNotifications } from '../hooks/PushNotifications';
import { setUnreadCount } from '../hooks/UnreadNotifications';

// Same relative path as LoginScreen/ChangePasswordScreen, which live
// alongside this screen under 'screens/'.
import { useConfirmationModal } from '../components/ConfirmationModal';

const NAVY = '#1b2061';
const MUTED = '#9AA3B5';
// Icon color used in place of navy on dark backgrounds, where navy is unreadable.
const ICON_ON_DARK = '#C7D2FE';
const LOGOUT_TRANSITION_MS = 900;

// Shared class strings so every card, row, and label uses the same light/dark colors.
const CARD = 'rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';
const ROW_DIVIDER = 'border-b border-slate-100 dark:border-slate-800';
const ICON_TILE = 'mr-3 h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800';
const SECTION_LABEL = 'mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400';
const ROW_TITLE = 'text-sm font-semibold text-[#16233F] dark:text-slate-100';
const ROW_SUBTITLE = 'mt-0.5 text-xs text-slate-400 dark:text-slate-500';

const APPEARANCE_OPTIONS = [
  { key: 'light', label: 'Light', Icon: Sun },
  { key: 'dark', label: 'Dark', Icon: Moon },
  { key: 'system', label: 'System', Icon: MonitorSmartphone },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { handleScroll, resetTabBar } = useTabBarVisibility();

  // The saved Light / Dark / System choice, shared by the whole app.
  const { appearance, isDark, setAppearance } = useAppearance();
  const iconColor = isDark ? ICON_ON_DARK : NAVY;

  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // True once the account has loaded at least once, so a failed refresh
  // later keeps showing the last known details instead of an error.
  const hasLoadedRef = useRef(false);

  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Shared confirmation/feedback modal — replaces the "log out?" confirm
  // and the "logout failed" error Alert.alert below.
  const { confirmationModal, showFeedback, showConfirm } = useConfirmationModal();

  const firstName = account?.first_name || account?.firstName || '';
  const lastName = account?.last_name || account?.lastName || '';
  const name = `${firstName} ${lastName}`.trim() || 'Student Account';

  const idNumber = String(
    account?.student_id || account?.school_id || account?.schoolId || account?.id_number || account?.username || account?.email || '',
  )
    .replace(/\D/g, '')
    .slice(0, 8);

  const initials =
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || 'SA';

  const role = account?.role || 'student';

  // Reload the account every time this screen comes into view, not only
  // the first time. The Profile tab stays mounted while Account Details is
  // open, so without this an edited name would not show after going back.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      getCurrentUser()
        .then((value) => {
          if (cancelled) return;
          if (value) {
            hasLoadedRef.current = true;
            setAccount(value);
            setError('');
          } else if (!hasLoadedRef.current) {
            setAccount(null);
          }
        })
        .catch(() => {
          if (!cancelled && !hasLoadedRef.current) {
            setError('We could not load your account information. Please check your connection and sign in again.');
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, []),
  );

  const handleLogout = () => {
    showConfirm({
      title: 'Log out?',
      message: 'You will need to sign in again to access your account.',
      confirmLabel: 'Log out',
      destructive: true,
      onConfirm: async () => {
        setIsLoggingOut(true);
        try {
          // Stop pushes to this phone before the session is cleared.
          await unregisterPushNotifications();
          await logoutUser();
          // Clear the badge so the next account doesn't start with this one's count.
          setUnreadCount(0);
          await new Promise((resolve) => setTimeout(resolve, LOGOUT_TRANSITION_MS));
          hasLoadedRef.current = false;
          setAccount(null);
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
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
          <Text className="text-[12px] font-bold tracking-widest text-white/60">SEEK AND BALIK</Text>
          <Text className="text-2xl font-bold text-white">Profile</Text>
        </View>
      </SafeAreaView>

      <ScrollView
        className="flex-1"
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: insets.bottom + 6 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Account Information — tappable, opens Account Details */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation.navigate('AccountDetails')}
          className={`mb-5 flex-row items-center justify-between p-4 ${CARD}`}
        >
          <View className="flex-row items-center">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-[#1b2061] dark:bg-indigo-600">
              <Text className="text-sm font-bold text-white">{initials}</Text>
            </View>

            <View className="ml-3">
              <View className="mb-1 flex-row items-center">
                {loading ? (
                  <ActivityIndicator size="small" color={iconColor} />
                ) : (
                  <Text className="mr-2 text-sm font-bold text-[#16233F] dark:text-slate-100">{name}</Text>
                )}

                <View className="rounded-full bg-indigo-100 px-2 py-0.5 dark:bg-indigo-950">
                  <Text className="text-[10px] font-bold capitalize text-indigo-600 dark:text-indigo-300">{role}</Text>
                </View>
              </View>

              <View className="flex-row items-center">
                <CreditCard size={12} color={MUTED} />
                <Text className="ml-1 text-xs text-slate-500 dark:text-slate-400">ID: {loading ? 'Loading…' : idNumber || 'Not available'}</Text>
              </View>
            </View>
          </View>

          <ChevronRight size={18} color={MUTED} />
        </TouchableOpacity>

        {!!error && (
          <View className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950">
            <Text className="text-xs font-semibold text-rose-700 dark:text-rose-300">{error}</Text>
          </View>
        )}

        {/* Quick Actions */}
        <Text className={SECTION_LABEL}>Quick Actions</Text>

        <View className={`mb-5 ${CARD}`}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('MySubmissions')}
            className={`flex-row items-center justify-between px-4 py-3.5 ${ROW_DIVIDER}`}
          >
            <View className="flex-row items-center">
              <View className={ICON_TILE}>
                <FileText size={18} color={iconColor} />
              </View>
              <Text className={ROW_TITLE}>My Submissions</Text>
            </View>
            <ChevronRight size={16} color={MUTED} />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('MyClaimRequests')}
            className="flex-row items-center justify-between px-4 py-3.5"
          >
            <View className="flex-row items-center">
              <View className={ICON_TILE}>
                <CalendarCheck2 size={18} color={iconColor} />
              </View>
              <Text className={ROW_TITLE}>My Claim Requests</Text>
            </View>
            <ChevronRight size={16} color={MUTED} />
          </TouchableOpacity>
        </View>

        {/* Security */}
        <Text className={SECTION_LABEL}>Security</Text>

        <View className={`mb-5 ${CARD}`}>
          <TouchableOpacity
            onPress={() => navigation.navigate('UpdatePassword')}
            className={`flex-row items-center justify-between px-4 py-3.5 ${ROW_DIVIDER}`}
          >
            <View className="flex-row items-center">
              <View className={ICON_TILE}>
                <Lock size={18} color={iconColor} />
              </View>
              <Text className={ROW_TITLE}>Change Password</Text>
            </View>
            <ChevronRight size={16} color={MUTED} />
          </TouchableOpacity>

          <View className="flex-row items-center px-4 py-3.5">
            <View className={ICON_TILE}>
              <Smartphone size={18} color={iconColor} />
            </View>
            <View className="flex-1">
              <Text className={ROW_TITLE}>Account Security</Text>
              <Text className={ROW_SUBTITLE}>Keep your password private and sign out on shared devices.</Text>
            </View>
          </View>
        </View>

        {/* App Appearance — the choice applies to the whole app and is saved on this phone. */}
        <Text className={SECTION_LABEL}>App Appearance</Text>

        <View className={`mb-5 p-4 ${CARD}`}>
          <View className="flex-row overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700">
            {APPEARANCE_OPTIONS.map(({ key, label, Icon }) => {
              const active = appearance === key;

              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => setAppearance(key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  className={`flex-1 flex-row items-center justify-center py-2.5 ${
                    active ? 'bg-[#1b2061] dark:bg-indigo-600' : 'bg-white dark:bg-slate-900'
                  }`}
                >
                  <Icon size={14} color={active ? '#FFFFFF' : MUTED} />
                  <Text
                    className={`ml-1.5 text-sm font-semibold ${
                      active ? 'text-white' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Support & Info */}
        <Text className={SECTION_LABEL}>Support &amp; Info</Text>

        <View className={`mb-5 ${CARD}`}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('HelpCenter')}
            className={`flex-row items-center justify-between px-4 py-3.5 ${ROW_DIVIDER}`}
          >
            <View className="flex-row items-center">
              <View className={ICON_TILE}>
                <HelpCircle size={18} color={iconColor} />
              </View>
              <View>
                <Text className={ROW_TITLE}>Help Center &amp; FAQ</Text>
                <Text className={ROW_SUBTITLE}>Claims, lost items, tracking, and more</Text>
              </View>
            </View>
            <ChevronRight size={16} color={MUTED} />
          </TouchableOpacity>

          {/* Opens the terms as a read-only page (no "I Agree" button). */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('Terms')}
            className={`flex-row items-center justify-between px-4 py-3.5 ${ROW_DIVIDER}`}
          >
            <View className="flex-row items-center">
              <View className={ICON_TILE}>
                <ShieldCheck size={18} color={iconColor} />
              </View>
              <View>
                <Text className={ROW_TITLE}>Terms &amp; Privacy</Text>
                <Text className={ROW_SUBTITLE}>Terms and data privacy consent</Text>
              </View>
            </View>
            <ChevronRight size={16} color={MUTED} />
          </TouchableOpacity>

          {/* Opens the campus map with walking directions to the desk. */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('LostFoundDesk')}
            className={`flex-row items-center justify-between px-4 py-3.5 ${ROW_DIVIDER}`}
          >
            <View className="flex-row items-center">
              <View className={ICON_TILE}>
                <MapPin size={18} color={iconColor} />
              </View>
              <View>
                <Text className={ROW_TITLE}>Campus Lost &amp; Found Desk</Text>
                <Text className={ROW_SUBTITLE}>Student Affairs Office · Get directions</Text>
              </View>
            </View>
            <ChevronRight size={16} color={MUTED} />
          </TouchableOpacity>

          <View className={`flex-row items-center px-4 py-3.5 ${ROW_DIVIDER}`}>
            <View className={ICON_TILE}>
              <Clock size={18} color={iconColor} />
            </View>
            <View className="flex-1">
              <Text className={ROW_TITLE}>Office Hours</Text>
              <Text className={ROW_SUBTITLE}>Monday–Friday, 8:00 AM–5:00 PM</Text>
              <Text className="text-xs text-slate-400 dark:text-slate-500">Saturday, 8:00 AM–12:00 PM</Text>
            </View>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation.navigate('ReportIssue')}
            className="flex-row items-center justify-between px-4 py-3.5"
          >
            <View className="flex-row items-center">
              <View className="mr-3 h-8 w-8 items-center justify-center rounded-lg bg-rose-50 dark:bg-rose-950">
                <MessageSquareWarning size={18} color={isDark ? '#FB7185' : '#E11D48'} />
              </View>
              <Text className="text-sm font-semibold text-rose-600 dark:text-rose-400">Report an Issue</Text>
            </View>
            <ChevronRight size={16} color={MUTED} />
          </TouchableOpacity>
        </View>

        {/* Logout */}
        <TouchableOpacity
          onPress={handleLogout}
          disabled={isLoggingOut}
          className="mb-6 mt-4 h-12 flex-row items-center justify-center rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950"
        >
          {isLoggingOut ? (
            <ActivityIndicator size="small" color={isDark ? '#FB7185' : '#E11D48'} />
          ) : (
            <>
              <LogOut size={16} color={isDark ? '#FB7185' : '#E11D48'} />
              <Text className="ml-2 text-sm font-bold text-rose-600 dark:text-rose-400">LOG OUT</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {isLoggingOut && (
        <View className="absolute inset-0 items-center justify-center bg-[#1b2061]/35" pointerEvents="none">
          <View className="items-center rounded-2xl bg-white px-6 py-5 shadow-xl dark:bg-slate-900">
            <ActivityIndicator size="large" color={iconColor} />
            <Text className="mt-3 text-sm font-bold text-[#1b2061] dark:text-slate-100">Logging out...</Text>
          </View>
        </View>
      )}

      {confirmationModal}
    </View>
  );
}