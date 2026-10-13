import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
  Bell,
  BellOff,
  CalendarX,
  CheckCheck,
  ChevronLeft,
  FileSearch,
  HandHelping,
  MessageSquareWarning,
} from 'lucide-react-native';

import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../api/api';
import { useAppearance } from '../../hooks/Appearance';
import { refreshUnreadCount } from '../../hooks/UnreadNotifications';

const NAVY = '#1b2061';

// Icon and colors per notification kind: [light, dark] for the icon color.
const KIND_STYLES = {
  new_lost_report: {
    Icon: FileSearch,
    color: ['#B45309', '#FCD34D'],
    tile: 'bg-amber-100 dark:bg-amber-950',
  },
  new_claim: {
    Icon: HandHelping,
    color: [NAVY, '#C7D2FE'],
    tile: 'bg-[#EEF1F7] dark:bg-slate-800',
  },
  missed_meeting: {
    Icon: CalendarX,
    color: ['#E11D48', '#FDA4AF'],
    tile: 'bg-rose-100 dark:bg-rose-950',
  },
  new_issue: {
    Icon: MessageSquareWarning,
    color: ['#E11D48', '#FDA4AF'],
    tile: 'bg-rose-100 dark:bg-rose-950',
  },
};

const DEFAULT_STYLE = {
  Icon: Bell,
  color: [NAVY, '#C7D2FE'],
  tile: 'bg-[#EEF1F7] dark:bg-slate-800',
};

// "Just now", "5m ago", "3h ago", "2d ago", then the exact date.
const formatWhen = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

// Notifications for admins and moderators: new lost reports, new claims,
// missed meetings and (admins only) new issue reports.
export default function AdminNotificationScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { isDark } = useAppearance();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [markingAll, setMarkingAll] = useState(false);

  const unreadCount = notifications.filter((item) => !item.is_read).length;

  // mode: 'initial' shows the big spinner, 'refresh' the pull-down one,
  // 'silent' updates the list without any spinner.
  const loadNotifications = useCallback(async (mode = 'initial') => {
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);

    try {
      const response = await getNotifications();
      setNotifications(Array.isArray(response?.results) ? response.results : []);
      setLoadError('');
    } catch (error) {
      if (mode !== 'silent') {
        setLoadError('Could not load notifications. Pull down to try again.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadNotifications('initial');

      // Picks up new notifications while the screen stays open.
      const interval = setInterval(() => loadNotifications('silent'), 10000);

      return () => clearInterval(interval);
    }, [loadNotifications])
  );

  const handleOpen = async (notification) => {
    if (!notification.is_read) {
      // Mark it read on screen first; the request follows.
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, is_read: true } : item
        )
      );

      try {
        await markNotificationRead(notification.id);
        // Update the bell and tab bar badge right away.
        refreshUnreadCount();
      } catch (error) {
        // It stays unread on the server and shows as unread on the next load.
      }
    }

    // An issue notification opens that issue's details.
    if (notification.kind === 'new_issue' && notification.data?.report_id) {
      navigation.navigate('IssueDetails', {
        issueId: notification.data.report_id,
      });
    }
  };

  const handleMarkAllRead = async () => {
    if (markingAll || unreadCount === 0) return;

    const previous = notifications;
    setMarkingAll(true);
    setNotifications((current) =>
      current.map((item) => ({ ...item, is_read: true }))
    );

    try {
      await markAllNotificationsRead();
      refreshUnreadCount();
    } catch (error) {
      // Saving failed: put the unread dots back.
      setNotifications(previous);
    } finally {
      setMarkingAll(false);
    }
  };

  const renderNotification = ({ item }) => {
    const style = KIND_STYLES[item.kind] || DEFAULT_STYLE;
    const { Icon } = style;
    const unread = !item.is_read;

    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => handleOpen(item)}
        accessibilityRole="button"
        accessibilityLabel={`${unread ? 'Unread. ' : ''}${item.title}. ${item.body}`}
        className={`mb-2.5 flex-row rounded-2xl border p-4 ${
          unread
            ? 'border-[#C9D0EA] bg-[#F4F6FD] dark:border-indigo-900 dark:bg-slate-800'
            : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
        }`}
      >
        <View
          className={`mr-3 h-10 w-10 items-center justify-center rounded-full ${style.tile}`}
        >
          <Icon size={18} color={isDark ? style.color[1] : style.color[0]} />
        </View>

        <View className="flex-1">
          <View className="flex-row items-start justify-between">
            <Text
              className={`flex-1 pr-2 text-sm text-[#16233F] dark:text-slate-100 ${
                unread ? 'font-bold' : 'font-semibold'
              }`}
            >
              {item.title}
            </Text>

            {unread ? (
              <View className="mt-1.5 h-2 w-2 rounded-full bg-[#1b2061] dark:bg-indigo-400" />
            ) : null}
          </View>

          {item.body ? (
            <Text className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {item.body}
            </Text>
          ) : null}

          <Text className="mt-2 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
            {formatWhen(item.created_at)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View className="flex-1 bg-[#F7F8FC] dark:bg-slate-950">
      <StatusBar style="light" backgroundColor={NAVY} translucent={false} />

      <SafeAreaView edges={['top']} className="rounded-b-3xl bg-[#1b2061]">
        <View className="flex-row items-center px-4 pb-6 pt-2">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-white/10"
          >
            <ChevronLeft size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View className="flex-1">
            <Text className="text-[12px] font-bold tracking-widest text-white/60">
              ADMIN
            </Text>
            <Text className="text-2xl font-bold text-white">Notifications</Text>
          </View>

          {unreadCount > 0 ? (
            <TouchableOpacity
              onPress={handleMarkAllRead}
              disabled={markingAll}
              accessibilityRole="button"
              accessibilityLabel="Mark all as read"
              className="flex-row items-center rounded-full bg-white/10 px-3 py-2"
            >
              <CheckCheck size={15} color="#FFFFFF" />
              <Text className="ml-1.5 text-xs font-semibold text-white">
                Read all
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </SafeAreaView>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="small" color={isDark ? '#C7D2FE' : NAVY} />
          <Text className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Loading notifications...
          </Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderNotification}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: insets.bottom + 24,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadNotifications('refresh')}
              colors={[isDark ? '#4F46E5' : NAVY]}
              progressBackgroundColor={isDark ? '#1E293B' : '#FFFFFF'}
            />
          }
          ListHeaderComponent={
            loadError ? (
              <View className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950">
                <Text className="text-xs font-semibold text-rose-700 dark:text-rose-300">
                  {loadError}
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            loadError ? null : (
              <View className="flex-1 items-center justify-center px-6 pb-16">
                <BellOff size={34} color="#94A3B8" />
                <Text className="mt-4 text-base font-bold text-[#16233F] dark:text-slate-100">
                  No notifications yet
                </Text>
                <Text className="mt-2 text-center text-sm leading-5 text-slate-500 dark:text-slate-400">
                  New lost reports, claim requests, missed meetings and reported
                  issues will appear here.
                </Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}