import React, { useCallback, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { AlertTriangle, CheckCircle2, CircleAlert, Info } from 'lucide-react-native';

import { useAppearance } from '../hooks/Appearance';

// ==========================================================
// Shared confirmation / feedback modal.
//
// Layout and styling come from the Add Item screen's feedback modal
// (centered card, `max-w-sm`, `rounded-3xl`, 64px icon badge, centered
// title + message). Extended with:
//   - a `warning` tone (amber) for validation messages, alongside
//     `success` (emerald) and `error` (rose)
//   - an optional `detail` box for a value the user should remember
//     (a ticket code, a meeting slot) — same look as the ticket-code
//     card on Report Lost Item
//   - an optional Cancel button, for "are you sure?" confirmations
//   - an `info` tone (navy) for neutral, informational dialogs
//   - `icon` to swap the badge icon, and `children` for extra body
//     content (e.g. a list) that scrolls inside the card
//   - `dismissOnBackdrop` so informational dialogs close when the dimmed
//     area is tapped
//   - light and dark colors, following the app's appearance setting
//
// Usage — call the hook once per screen, render `confirmationModal`
// once in the JSX, and call showFeedback / showConfirm from handlers:
//
//   const { confirmationModal, showFeedback, showConfirm } =
//     useConfirmationModal();
//
//   showFeedback({ title: 'Saved', message: '...', tone: 'success',
//                  onClose: () => navigation.goBack() });
//
//   showConfirm({ title: 'Decline this claim?', message: '...',
//                 confirmLabel: 'Decline', destructive: true,
//                 onConfirm: () => declineClaim() });
//
//   return (<View>...{confirmationModal}</View>);
// ==========================================================

// iconColor is for light mode, iconColorDark for dark mode.
const TONES = {
  success: {
    badge: 'bg-emerald-100 dark:bg-emerald-950',
    Icon: CheckCircle2,
    iconColor: '#059669',
    iconColorDark: '#34D399',
    button: 'bg-emerald-600',
  },
  warning: {
    badge: 'bg-amber-100 dark:bg-amber-950',
    Icon: AlertTriangle,
    iconColor: '#D97706',
    iconColorDark: '#FBBF24',
    button: 'bg-[#1b2061] dark:bg-indigo-600',
  },
  error: {
    badge: 'bg-rose-100 dark:bg-rose-950',
    Icon: CircleAlert,
    iconColor: '#E11D48',
    iconColorDark: '#FB7185',
    button: 'bg-[#1b2061] dark:bg-indigo-600',
  },
  info: {
    badge: 'bg-[#EEF1F7] dark:bg-slate-800',
    Icon: Info,
    iconColor: '#1b2061',
    iconColorDark: '#C7D2FE',
    button: 'bg-[#1b2061] dark:bg-indigo-600',
  },
};

export default function ConfirmationModal({
  visible,
  tone = 'error',
  title,
  message,
  // { label, value } — optional highlighted box under the message.
  detail,
  // Replaces the tone's default badge icon (e.g. CalendarClock, Map).
  icon,
  // Extra content between the message and the buttons. Scrolls inside
  // the card when it's tall, so the buttons never get pushed off-screen.
  children,
  confirmLabel = 'Close',
  // Passing cancelLabel turns this into a two-button confirmation.
  cancelLabel,
  // Confirm button turns rose for destructive actions (decline, delete).
  destructive = false,
  // Tapping the dimmed area dismisses the dialog (same as Cancel, or as
  // the confirm button when there's no Cancel). Off by default so
  // errors and confirmations can't be dismissed by accident.
  dismissOnBackdrop = false,
  onConfirm,
  onCancel,
}) {
  const { height: windowHeight } = useWindowDimensions();
  const { isDark } = useAppearance();

  const config = TONES[tone] || TONES.error;
  const Icon = icon || config.Icon;
  const hasCancel = Boolean(cancelLabel);
  const handleDismiss = hasCancel ? onCancel : onConfirm;

  const confirmButtonClass = destructive ? 'bg-rose-600' : config.button;

  // Fixed pixel cap for the scrolling body (rather than a percentage on
  // an auto-height parent) so a long list scrolls in place.
  const bodyMaxHeight = windowHeight * 0.42;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Android back button: same as dismissing the dialog.
      onRequestClose={handleDismiss}
    >
      <Pressable
        className="flex-1 items-center justify-center bg-black/50 px-6"
        onPress={dismissOnBackdrop ? handleDismiss : undefined}
      >
        {/* Empty onPress stops taps on the card from reaching the backdrop */}
        <Pressable
          className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl dark:bg-slate-900"
          onPress={() => {}}
        >
          {/* Centered icon badge */}
          <View className="mb-4 items-center">
            <View
              className={`h-16 w-16 items-center justify-center rounded-full ${config.badge}`}
            >
              <Icon size={32} color={isDark ? config.iconColorDark : config.iconColor} />
            </View>
          </View>

          {/* Title + message */}
          <Text className="text-center text-xl font-bold text-[#16233F] dark:text-slate-100">
            {title}
          </Text>

          {message ? (
            <Text className="mt-2 text-center text-sm leading-6 text-slate-500 dark:text-slate-400">
              {message}
            </Text>
          ) : null}

          {/* Optional highlighted detail (ticket code, meeting slot…) */}
          {detail?.value ? (
            <View className="mt-5 w-full items-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-800">
              {detail.label ? (
                <Text className="text-xs font-semibold tracking-widest text-slate-400">
                  {detail.label}
                </Text>
              ) : null}
              <Text className="mt-1 text-center text-lg font-bold text-[#1b2061] dark:text-indigo-200">
                {detail.value}
              </Text>
            </View>
          ) : null}

          {/* Optional scrolling body */}
          {children ? (
            <ScrollView
              className="mt-5"
              style={{ maxHeight: bodyMaxHeight }}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              {children}
            </ScrollView>
          ) : null}

          {/* Actions */}
          {hasCancel ? (
            <View className="mt-6 flex-row gap-3">
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={onCancel}
                className="h-12 flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800"
              >
                <Text className="text-sm font-semibold text-[#16233F] dark:text-slate-100">
                  {cancelLabel}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={onConfirm}
                className={`h-12 flex-1 items-center justify-center rounded-xl ${confirmButtonClass}`}
              >
                <Text className="text-sm font-semibold text-white">
                  {confirmLabel}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={onConfirm}
              className={`mt-6 h-12 w-full items-center justify-center rounded-xl ${confirmButtonClass}`}
            >
              <Text className="text-sm font-semibold text-white">
                {confirmLabel}
              </Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// State + handlers for one ConfirmationModal per screen.
//
// The last config is kept (only `visible` flips to false on close), so
// the title/message don't blank out while the modal fades away.
const HIDDEN = { visible: false, tone: 'error', title: '', message: '' };

export function useConfirmationModal() {
  const [config, setConfig] = useState(HIDDEN);

  // Single-button message. `onClose` runs after the user taps the button
  // (or presses the Android back button) — e.g. to leave the screen.
  const showFeedback = useCallback(
    ({
      title,
      message,
      tone = 'error',
      confirmLabel = 'Close',
      detail,
      onClose,
    }) => {
      setConfig({
        visible: true,
        title,
        message,
        tone,
        confirmLabel,
        detail,
        cancelLabel: undefined,
        destructive: false,
        onConfirm: onClose,
        onCancel: undefined,
      });
    },
    []
  );

  // Two-button "are you sure?" dialog. Nothing runs on Cancel unless
  // `onCancel` is given.
  const showConfirm = useCallback(
    ({
      title,
      message,
      tone = 'warning',
      confirmLabel = 'Confirm',
      cancelLabel = 'Cancel',
      destructive = false,
      onConfirm,
      onCancel,
    }) => {
      setConfig({
        visible: true,
        title,
        message,
        tone,
        confirmLabel,
        detail: undefined,
        cancelLabel,
        destructive,
        onConfirm,
        onCancel,
      });
    },
    []
  );

  const handleConfirm = () => {
    const callback = config.onConfirm;
    setConfig((previous) => ({ ...previous, visible: false }));
    callback?.();
  };

  const handleCancel = () => {
    const callback = config.onCancel;
    setConfig((previous) => ({ ...previous, visible: false }));
    callback?.();
  };

  const confirmationModal = (
    <ConfirmationModal
      visible={config.visible}
      tone={config.tone}
      title={config.title}
      message={config.message}
      detail={config.detail}
      confirmLabel={config.confirmLabel}
      cancelLabel={config.cancelLabel}
      destructive={config.destructive}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );

  return { confirmationModal, showFeedback, showConfirm };
}