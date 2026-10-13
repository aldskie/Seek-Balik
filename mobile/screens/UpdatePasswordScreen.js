import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { changePassword, logoutUser } from '../api/api';
import { useAppearance } from '../hooks/Appearance';

// Same relative path as the other 'screens/'-level files converted so far
// (LoginScreen, ChangePasswordScreen, ProfileScreen).
import { useConfirmationModal } from '../components/ConfirmationModal';

const NAVY = '#1B2061';

// Password rules, kept identical to the backend's change_password view:
// 8-12 characters, no spaces, at least one capital letter and one special character.
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 12;

// Space kept between the field being typed in and the top of the keyboard.
const KEYBOARD_FIELD_MARGIN = 24;

// Class strings reused below, each with its light and dark colors.
const FIELD_LABEL = 'mb-2 text-[13px] font-bold text-[#1e2a5e] dark:text-slate-200';
const FIELD_INPUT =
  'h-[50px] rounded-xl border border-[#E2E6ED] bg-white pl-11 pr-12 text-sm text-[#1e2a5e] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

export default function UpdatePasswordScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const mustChangePassword = route.params?.mustChangePassword ?? false;

  // The temporary password the user just typed on the Login screen, when the
  // Login screen passes it along, so it doesn't have to be typed again here.
  // Kept in memory for this screen only, never saved to storage.
  const passwordFromLogin = route.params?.temporaryPassword ?? '';

  // Icon, spinner, and placeholder colors follow the app's appearance.
  const { isDark } = useAppearance();
  const navyIcon = isDark ? '#C7D2FE' : NAVY;
  const placeholderColor = isDark ? '#64748B' : '#9AA3B5';

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Set to true if the backend rejects the password carried over from Login,
  // so the field comes back and the user can type it themselves.
  const [askForCurrent, setAskForCurrent] = useState(false);

  // Shared confirmation/feedback modal — replaces the "password updated"
  // Alert.alert below.
  const { confirmationModal, showFeedback } = useConfirmationModal();

  // The backend always requires the current password, including the emailed
  // temporary one. The field is hidden only for a temporary-password user
  // whose password came from the Login screen; otherwise it is shown.
  const hideCurrentField = mustChangePassword && !!passwordFromLogin && !askForCurrent;
  const currentPasswordLabel = mustChangePassword ? 'Temporary Password' : 'Current Password';
  // What is actually sent to the backend as current_password.
  const effectiveCurrentPassword = hideCurrentField ? passwordFromLogin : currentPassword;

  // ---------------------------------------------------------------------
  // Keyboard handling
  //
  // The form is taller than the space left above an open keyboard, so the
  // screen keeps the field being typed in visible instead of the whole
  // card: it scrolls just enough that the focused field sits above the
  // keyboard. Extra scroll space is added at the bottom while the keyboard
  // is open, so the buttons can always be scrolled into view.
  // ---------------------------------------------------------------------
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef(null);
  // Current scroll position and the top edge of the open keyboard.
  const scrollYRef = useRef(0);
  const keyboardTopRef = useRef(0);
  // One wrapper per field (measured to find where the field is on screen)
  // and the wrapper of whichever field currently has focus.
  const currentFieldRef = useRef(null);
  const newFieldRef = useRef(null);
  const confirmFieldRef = useRef(null);
  const focusedFieldRef = useRef(null);

  // Scrolls just enough that the focused field sits above the keyboard.
  // Does nothing if it is already visible.
  const keepFocusedFieldVisible = useCallback(() => {
    const keyboardTop = keyboardTopRef.current;
    const field = focusedFieldRef.current;
    if (!keyboardTop || !field || !scrollRef.current) return;

    field.measureInWindow((x, y, width, height) => {
      const overlap = y + height + KEYBOARD_FIELD_MARGIN - keyboardTop;
      if (overlap > 0) {
        scrollRef.current?.scrollTo({
          y: scrollYRef.current + overlap,
          animated: true,
        });
      }
    });
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (event) => {
      keyboardTopRef.current = event?.endCoordinates?.screenY ?? 0;
      setKeyboardHeight(event?.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      keyboardTopRef.current = 0;
      setKeyboardHeight(0);
    });

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Re-checks whenever the keyboard opens or changes height. The short
  // delay lets the layout settle first.
  useEffect(() => {
    if (keyboardHeight <= 0) return undefined;
    const timer = setTimeout(keepFocusedFieldVisible, 150);
    return () => clearTimeout(timer);
  }, [keyboardHeight, keepFocusedFieldVisible]);

  // Remembers which field has focus. When the keyboard is already open
  // (moving from one field to the next), the new field is brought into
  // view right away.
  const handleFieldFocus = (fieldRef) => {
    focusedFieldRef.current = fieldRef.current;
    if (keyboardTopRef.current) {
      setTimeout(keepFocusedFieldVisible, 100);
    }
  };

  const validate = () => {
    if (!effectiveCurrentPassword) {
      return mustChangePassword
        ? 'Enter the temporary password from your email.'
        : 'Enter your current password.';
    }
    if (!newPassword || !confirmPassword) return 'Enter and confirm your new password.';
    if (newPassword.length < MIN_PASSWORD_LENGTH || newPassword.length > MAX_PASSWORD_LENGTH) {
      return `New password must contain ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`;
    }
    if (/\s/.test(newPassword)) return 'New password must not contain spaces.';
    if (!/[A-Z]/.test(newPassword)) {
      return 'New password must contain at least one capital letter.';
    }
    if (!/[^A-Za-z0-9]/.test(newPassword)) {
      return 'New password must contain at least one special character (e.g. ! @ # $ %).';
    }
    if (newPassword !== confirmPassword) return 'New passwords do not match.';
    if (newPassword === effectiveCurrentPassword) {
      return 'New password cannot match your current password.';
    }
    return '';
  };

  const handleSubmit = async () => {
    // Close the keyboard so the loading overlay and any error are fully visible.
    Keyboard.dismiss();

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      await changePassword(effectiveCurrentPassword, newPassword);
      await logoutUser();
      showFeedback({
        title: 'Password updated',
        message: 'Your password was changed. Please sign in with your new password.',
        tone: 'success',
        confirmLabel: 'OK',
        onClose: () => navigation.reset({ index: 0, routes: [{ name: 'Login' }] }),
      });
    } catch (requestError) {
      const details = requestError.response?.data;
      const message =
        typeof details?.error === 'string'
          ? details.error
          : typeof details?.detail === 'string'
          ? details.detail
          : 'Unable to update your password. Please try again.';

      // The carried-over password was rejected ("Current password required."
      // or "Current password incorrect."): show the field so the user is not stuck.
      if (hideCurrentField && /current password (required|incorrect)/i.test(message)) {
        setAskForCurrent(true);
        setError('Enter the temporary password from your email.');
      } else {
        setError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView className="flex-1 bg-slate-50 dark:bg-slate-950" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView edges={['top']} className="rounded-b-3xl bg-[#1b2061]">
        <View className="flex-row items-center px-4 pb-6 pt-2">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-white/10"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View>
            <Text className="text-[12px] font-bold tracking-widest text-white/60">SEEK AND BALIK</Text>
            <Text className="text-2xl font-bold text-white">Update Password</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        showsVerticalScrollIndicator={false}
        // iOS already lifts the screen through KeyboardAvoidingView, so the
        // extra keyboard-sized scroll space is only needed on Android.
        contentContainerStyle={{
          padding: 16,
          paddingBottom:
            insets.bottom + 28 + (Platform.OS === 'ios' ? 0 : keyboardHeight),
        }}
        keyboardShouldPersistTaps="handled"
        onScroll={(event) => {
          scrollYRef.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
        <View className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <View className="h-11 w-11 items-center justify-center rounded-2xl bg-[#EEF1F7] dark:bg-slate-800">
            <Ionicons name="shield-checkmark-outline" size={22} color={navyIcon} />
          </View>

          <Text className="mt-3 text-lg font-bold text-[#16233F] dark:text-slate-100">Secure your account</Text>
          <Text className="mb-6 mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
            {mustChangePassword
              ? hideCurrentField
                ? 'Create a new password to replace your temporary password.'
                : 'Enter the temporary password from your email, then create a new password to replace it.'
              : 'Use a strong password that you do not use for another account.'}
          </Text>

          {!hideCurrentField && (
            // collapsable={false} keeps this wrapper as a real native view on
            // Android so it can be measured for the keyboard handling.
            <View ref={currentFieldRef} collapsable={false} className="mb-4">
              <Text className={FIELD_LABEL}>{currentPasswordLabel}</Text>
              <View className="relative">
                <View className="absolute left-3.5 top-0 z-10 h-[50px] items-center justify-center" pointerEvents="none">
                  <Ionicons name="lock-closed-outline" size={17} color={placeholderColor} />
                </View>
                <TextInput
                  className={FIELD_INPUT}
                  placeholder={mustChangePassword ? 'Enter temporary password' : 'Enter current password'}
                  placeholderTextColor={placeholderColor}
                  value={currentPassword}
                  onChangeText={(text) => {
                    setCurrentPassword(text);
                    if (error) setError('');
                  }}
                  onFocus={() => handleFieldFocus(currentFieldRef)}
                  secureTextEntry={!showCurrentPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!isSubmitting}
                  returnKeyType="next"
                />
                <TouchableOpacity
                  className="absolute right-0 top-0 h-[50px] w-12 items-center justify-center"
                  onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                  disabled={isSubmitting}
                  accessibilityLabel={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                >
                  <Ionicons name={showCurrentPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={navyIcon} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View ref={newFieldRef} collapsable={false} className="mb-4">
            <Text className={FIELD_LABEL}>New Password</Text>
            <View className="relative">
              <View className="absolute left-3.5 top-0 z-10 h-[50px] items-center justify-center" pointerEvents="none">
                <Ionicons name="lock-closed-outline" size={17} color={placeholderColor} />
              </View>
              <TextInput
                className={FIELD_INPUT}
                placeholder={`${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters, no spaces`}
                placeholderTextColor={placeholderColor}
                value={newPassword}
                onChangeText={(text) => {
                  setNewPassword(text);
                  if (error) setError('');
                }}
                onFocus={() => handleFieldFocus(newFieldRef)}
                secureTextEntry={!showNewPassword}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={MAX_PASSWORD_LENGTH}
                editable={!isSubmitting}
                returnKeyType="next"
              />
              <TouchableOpacity
                className="absolute right-0 top-0 h-[50px] w-12 items-center justify-center"
                onPress={() => setShowNewPassword(!showNewPassword)}
                disabled={isSubmitting}
                accessibilityLabel={showNewPassword ? 'Hide new password' : 'Show new password'}
              >
                <Ionicons name={showNewPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={navyIcon} />
              </TouchableOpacity>
            </View>
          </View>

          <View ref={confirmFieldRef} collapsable={false} className="mb-4">
            <Text className={FIELD_LABEL}>Confirm New Password</Text>
            <View className="relative">
              <View className="absolute left-3.5 top-0 z-10 h-[50px] items-center justify-center" pointerEvents="none">
                <Ionicons name="lock-closed-outline" size={17} color={placeholderColor} />
              </View>
              <TextInput
                className={FIELD_INPUT}
                placeholder="Re-enter new password"
                placeholderTextColor={placeholderColor}
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  if (error) setError('');
                }}
                onFocus={() => handleFieldFocus(confirmFieldRef)}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={MAX_PASSWORD_LENGTH}
                editable={!isSubmitting}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
              <TouchableOpacity
                className="absolute right-0 top-0 h-[50px] w-12 items-center justify-center"
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                disabled={isSubmitting}
                accessibilityLabel={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
              >
                <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={navyIcon} />
              </TouchableOpacity>
            </View>
          </View>

          <View className="mb-5 rounded-xl bg-slate-50 px-3.5 py-3 dark:bg-slate-800">
            <Text className="text-[11px] font-bold uppercase tracking-wide text-red-500 dark:text-red-400">Password requirements</Text>
            <Text className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
              {MIN_PASSWORD_LENGTH}–{MAX_PASSWORD_LENGTH} characters, no spaces, at least one capital letter and one special character (e.g. ! @ # $ %), and different from your current password.
            </Text>
          </View>

          {!!error && (
            <View className="mb-4 flex-row items-start rounded-xl bg-rose-50 px-3.5 py-3 dark:bg-rose-950">
              <Ionicons name="alert-circle-outline" size={16} color={isDark ? '#FB7185' : '#E11D48'} style={{ marginTop: 1 }} />
              <Text className="ml-2 flex-1 text-xs leading-4 text-rose-700 dark:text-rose-300">{error}</Text>
            </View>
          )}

          <TouchableOpacity
            className="h-[50px] items-center justify-center rounded-xl bg-[#1e2a5e] shadow-sm dark:bg-indigo-600 dark:shadow-none"
            activeOpacity={0.85}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-[15px] font-bold text-white">Save Changes</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            className="mt-3 h-[50px] items-center justify-center rounded-xl border border-[#1e2a5e] dark:border-slate-600"
            activeOpacity={0.85}
            onPress={() => navigation.goBack()}
            disabled={isSubmitting}
          >
            <Text className="text-[15px] font-bold text-[#1e2a5e] dark:text-slate-200">Cancel</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {isSubmitting && (
        <View className="absolute inset-0 items-center justify-center bg-[#1b2061]/35 dark:bg-black/60" pointerEvents="none">
          <View className="items-center rounded-2xl bg-white px-6 py-5 shadow-xl dark:bg-slate-900">
            <ActivityIndicator size="large" color={navyIcon} />
            <Text className="mt-3 text-sm font-bold text-[#1b2061] dark:text-slate-100">Updating password...</Text>
          </View>
        </View>
      )}

      {confirmationModal}
    </KeyboardAvoidingView>
  );
}