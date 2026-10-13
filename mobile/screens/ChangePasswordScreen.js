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
import { Ionicons } from '@expo/vector-icons';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { changePassword, logoutUser } from '../api/api';
import { useAppearance } from '../hooks/Appearance';

// ASSUMPTION: same relative path used on the other converted screens —
// adjust if ConfirmationModal actually lives somewhere else in this
// project (this file sits one directory up from those, under
// '../screens', so the path is '../components/...' here instead of
// '../../components/...').
import { useConfirmationModal } from '../components/ConfirmationModal';

// Class strings reused below, each with its light and dark colors.
const FIELD_LABEL = 'mb-2 text-[#1e2a5e] text-[13px] font-bold dark:text-slate-200';
const FIELD_INPUT =
  'border border-[#d7dbe0] bg-white rounded-lg px-3.5 pr-12 h-[46px] text-sm text-[#333] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';

// Password rules, kept identical to the backend's change_password view:
// 8-12 characters, no spaces, at least one capital letter and one special character.
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 12;

export default function ChangePasswordScreen({ navigation, route }) {
  const mustChangePassword = route.params?.mustChangePassword ?? false;

  // The temporary password the user just typed on the Login screen, passed
  // along as a navigation param so they don't have to type it again here.
  // It is only kept in memory for this screen and is never saved to storage.
  const passwordFromLogin = route.params?.temporaryPassword ?? '';

  // Icon, spinner, and placeholder colors follow the app's appearance.
  const { isDark } = useAppearance();
  const eyeColor = isDark ? '#C7D2FE' : '#1e2a5e';
  const placeholderColor = isDark ? '#64748B' : '#8a8a8a';

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Shared confirmation/feedback modal — replaces the Alert.alert used for
  // the "password changed" confirmation below.
  const { confirmationModal, showFeedback } = useConfirmationModal();

  // The backend always requires the current password, including the emailed
  // temporary one, so the field is shown in both cases; only its wording changes.
  const currentPasswordLabel = mustChangePassword ? 'Temporary Password' : 'Current Password';

  // Set to true if the backend rejects the password carried over from Login,
  // so the field comes back and the user can type it themselves.
  const [askForCurrent, setAskForCurrent] = useState(false);

  // The field is hidden only for a temporary-password user whose password
  // came from the Login screen. In every other case it is shown.
  const hideCurrentField = mustChangePassword && !!passwordFromLogin && !askForCurrent;

  // What is actually sent to the backend as current_password.
  const effectiveCurrentPassword = hideCurrentField ? passwordFromLogin : currentPassword;

  // Keyboard handling (same approach as the login and forgot-password screens).
  // Height of the open keyboard (0 when closed), added as extra scroll space
  // at the bottom so the card can be scrolled above the keyboard.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef(null);
  const cardRef = useRef(null);
  // Current scroll position and the top edge of the open keyboard.
  const scrollYRef = useRef(0);
  const keyboardTopRef = useRef(0);

  // Scrolls just enough that the bottom of the card (the "Save Changes" and
  // "Cancel" buttons) sits above the keyboard. Does nothing if it is already visible.
  const keepCardAboveKeyboard = useCallback(() => {
    const keyboardTop = keyboardTopRef.current;
    if (!keyboardTop || !cardRef.current || !scrollRef.current) return;

    cardRef.current.measureInWindow((x, y, width, height) => {
      const overlap = y + height + 24 - keyboardTop;
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

  // Re-checks whenever the keyboard opens or the card changes size (an error
  // appears, or the temporary password field comes back). The short delay
  // lets the layout settle first.
  useEffect(() => {
    if (keyboardHeight <= 0) return undefined;
    const timer = setTimeout(keepCardAboveKeyboard, 150);
    return () => clearTimeout(timer);
  }, [keyboardHeight, error, hideCurrentField, keepCardAboveKeyboard]);

  const handleSubmit = async () => {
    // Close the keyboard so the loading overlay and any error are fully visible.
    Keyboard.dismiss();

    if (!effectiveCurrentPassword) {
      setError(
        mustChangePassword
          ? 'Enter the temporary password from your email.'
          : 'Enter your current password.',
      );
      return;
    }

    if (!newPassword || !confirmPassword) {
      setError('Enter and confirm your new password.');
      return;
    }

    if (newPassword.length < PASSWORD_MIN_LENGTH || newPassword.length > PASSWORD_MAX_LENGTH) {
      setError(
        `New password must contain ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters.`,
      );
      return;
    }

    if (/\s/.test(newPassword)) {
      setError('New password must not contain spaces.');
      return;
    }

    if (!/[A-Z]/.test(newPassword)) {
      setError('New password must contain at least one capital letter.');
      return;
    }

    if (!/[^A-Za-z0-9]/.test(newPassword)) {
      setError('New password must contain at least one special character (e.g. ! @ # $ %).');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    if (newPassword === effectiveCurrentPassword) {
      setError('New password cannot match current password.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      await changePassword(effectiveCurrentPassword, newPassword);
      await logoutUser();

      showFeedback({
        title: 'Password changed',
        message: 'Your password was updated. Please log in with your new password.',
        tone: 'success',
        confirmLabel: 'OK',
        onClose: () =>
          navigation.reset({
            index: 0,
            routes: [{ name: 'Login' }],
          }),
      });
    } catch (requestError) {
      const backendError = requestError.response?.data?.error;

      // The carried-over password was rejected ("Current password required."
      // or "Current password incorrect."): show the field so the user is not stuck.
      if (hideCurrentField && /current password (required|incorrect)/i.test(backendError || '')) {
        setAskForCurrent(true);
        setError('Enter the temporary password from your email.');
      } else {
        setError(backendError || 'Unable to change your password. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View className="flex-1">
        <Header />

        <ScrollView
          ref={scrollRef}
          className="flex-1 bg-[#f4f5f7] dark:bg-slate-950"
          // iOS already lifts the screen through KeyboardAvoidingView, so the
          // extra keyboard-sized scroll space is only needed on Android.
          contentContainerStyle={{
            alignItems: 'center',
            paddingBottom: 24 + (Platform.OS === 'ios' ? 0 : keyboardHeight),
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onScroll={(event) => {
            scrollYRef.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
        >
          <Text className="text-[#1e2a5e] text-[26px] font-extrabold font-serif text-center leading-8 mt-10 mb-10 dark:text-slate-100">
            {'CHANGE\nPASSWORD'}
          </Text>

          <View
            ref={cardRef}
            collapsable={false}
            className="w-[88%] rounded-2xl py-2 overflow-hidden bg-white shadow-md dark:bg-slate-900 dark:shadow-none"
          >
            <View className="bg-white/75 py-6 px-5 dark:bg-slate-900">
              <View className="w-full gap-4">
                {mustChangePassword && (
                  <Text className="text-[#555] text-xs leading-5 dark:text-slate-400">
                    {hideCurrentField
                      ? 'Create a new password to replace your temporary password.'
                      : 'Enter the temporary password from your email, then create a new password to replace it.'}
                  </Text>
                )}

                {!hideCurrentField && (
                <View>
                  <Text className={FIELD_LABEL}>
                    {currentPasswordLabel}
                  </Text>

                  <View className="relative">
                    <TextInput
                      className={FIELD_INPUT}
                      placeholder={
                        mustChangePassword
                          ? 'Enter temporary password'
                          : 'Enter current password'
                      }
                      placeholderTextColor={placeholderColor}
                      value={currentPassword}
                      onChangeText={setCurrentPassword}
                      secureTextEntry={!showCurrentPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!isSubmitting}
                    />

                    <TouchableOpacity
                      className="absolute right-0 top-0 h-[46px] w-12 items-center justify-center"
                      onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      <Ionicons
                        name={
                          showCurrentPassword
                            ? 'eye-off-outline'
                            : 'eye-outline'
                        }
                        size={22}
                        color={eyeColor}
                      />
                    </TouchableOpacity>
                  </View>
                </View>
                )}

                <View>
                  <Text className={FIELD_LABEL}>
                    New Password
                  </Text>

                  <View className="relative">
                    <TextInput
                      className={FIELD_INPUT}
                      placeholder="8–12 characters, no spaces"
                      placeholderTextColor={placeholderColor}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry={!showNewPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={PASSWORD_MAX_LENGTH}
                      editable={!isSubmitting}
                    />

                    <TouchableOpacity
                      className="absolute right-0 top-0 h-[46px] w-12 items-center justify-center"
                      onPress={() => setShowNewPassword(!showNewPassword)}
                    >
                      <Ionicons
                        name={showNewPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={22}
                        color={eyeColor}
                      />
                    </TouchableOpacity>
                  </View>

                  <Text className="mt-1.5 text-[11px] leading-4 text-[#555] dark:text-slate-400">
                    Must include at least one capital letter and one special character (e.g. ! @ # $ %).
                  </Text>
                </View>

                <View>
                  <Text className={FIELD_LABEL}>
                    Confirm New Password
                  </Text>

                  <View className="relative">
                    <TextInput
                      className={FIELD_INPUT}
                      placeholder="Re-enter new password"
                      placeholderTextColor={placeholderColor}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showConfirmPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      maxLength={PASSWORD_MAX_LENGTH}
                      returnKeyType="done"
                      onSubmitEditing={handleSubmit}
                      editable={!isSubmitting}
                    />

                    <TouchableOpacity
                      className="absolute right-0 top-0 h-[46px] w-12 items-center justify-center"
                      onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                    >
                      <Ionicons
                        name={
                          showConfirmPassword
                            ? 'eye-off-outline'
                            : 'eye-outline'
                        }
                        size={22}
                        color={eyeColor}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {!!error && (
                  <Text className="text-[#c0392b] text-xs dark:text-rose-400">{error}</Text>
                )}

                <TouchableOpacity
                  className="bg-[#1e2a5e] rounded-lg h-[46px] items-center justify-center dark:bg-indigo-600"
                  activeOpacity={0.85}
                  onPress={handleSubmit}
                  disabled={isSubmitting}
                >
                  <Text className="text-white font-bold text-[15px]">
                    Save Changes
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  className="border border-[#1e2a5e] rounded-lg h-[46px] items-center justify-center dark:border-slate-600"
                  activeOpacity={0.85}
                  onPress={() => navigation.goBack()}
                  disabled={isSubmitting}
                >
                  <Text className="text-[#1e2a5e] font-bold text-[15px] dark:text-slate-200">
                    Cancel
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </View>

      <Footer />

      {isSubmitting && (
        <View className="absolute inset-0 items-center justify-center bg-[#1b2061]/45 dark:bg-black/60">
          <View className="w-[78%] items-center rounded-2xl bg-white px-6 py-7 dark:bg-slate-900">
            <ActivityIndicator size="large" color={isDark ? '#C7D2FE' : '#1b2061'} />
            <Text className="mt-4 text-base font-bold text-[#1b2061] dark:text-slate-100">
              Updating password...
            </Text>
          </View>
        </View>
      )}

      {confirmationModal}
    </KeyboardAvoidingView>
  );
}