import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { loginUser } from '../api/api';
import { useAppearance } from '../hooks/Appearance';
import { hasAcceptedTerms } from '../hooks/TermsConsent';

// Same relative path as ChangePasswordScreen, which lives alongside this
// screen under 'screens/'.
import { useConfirmationModal } from '../components/ConfirmationModal';

  const SCHOOL_DOMAIN = '@slc-sflu.edu.ph';

// Class strings reused below, each with its light and dark colors.
const FIELD_LABEL = 'text-[#1e2a5e] text-[13px] font-bold dark:text-slate-200';
const LINK_TEXT = 'text-[#1e2a5e] dark:text-indigo-300';

// Used only if the server reports a lock without saying how long it lasts.
// Matches LOGIN_LOCK_MINUTES in the backend (accounts/views.py).
const DEFAULT_LOCK_SECONDS = 10 * 60;

// Turns a number of seconds into "m:ss" for the lock countdown (e.g. 9:05).
function formatCountdown(totalSeconds) {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export default function LoginScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [studentId, setStudentId] = useState('');

  // Login lock reported by the server (3 wrong passwords = 10 minutes).
  // The server enforces the lock; this state only shows it: a countdown,
  // a disabled "Log in" button, and a Forgot Password shortcut.
  //   lockedId       - the ID number that is locked (the lock is per account)
  //   lockedUntil    - time on this phone when the lock ends (ms), or null
  //   lockSecondsLeft - seconds remaining, updated every second
  //   suggestReset   - true when the server suggests resetting the password
  const [lockedId, setLockedId] = useState('');
  const [lockedUntil, setLockedUntil] = useState(null);
  const [lockSecondsLeft, setLockSecondsLeft] = useState(0);
  const [suggestReset, setSuggestReset] = useState(false);

  // The lock only applies while the locked ID number is the one typed in,
  // so another account can still log in on this phone.
  const isLocked = lockSecondsLeft > 0 && studentId.trim() === lockedId;

  // True when the app sent the user here because their session ended
  // (Stacks.js resets to Login with { sessionExpired: true }).
  const [sessionExpired, setSessionExpired] = useState(
    Boolean(route.params?.sessionExpired),
  );

  useEffect(() => {
    if (route.params?.sessionExpired) setSessionExpired(true);
  }, [route.params?.sessionExpired]);

  // Counts the lock down once per second and clears it when it reaches zero.
  useEffect(() => {
    if (!lockedUntil) return undefined;

    const tick = () => {
      const left = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (left <= 0) {
        setLockSecondsLeft(0);
        setLockedUntil(null);
        setLockedId('');
        setSuggestReset(false);
      } else {
        setLockSecondsLeft(left);
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  const clearLock = () => {
    setLockedUntil(null);
    setLockSecondsLeft(0);
    setLockedId('');
    setSuggestReset(false);
  };

  // Icon, spinner, and placeholder colors follow the app's appearance.
  const { isDark } = useAppearance();
  const placeholderColor = isDark ? '#64748B' : '#8a8a8a';

  // Shared confirmation/feedback modal — replaces all three Alert.alert
  // calls below (invalid ID, missing details, login failed).
  const { confirmationModal, showFeedback } = useConfirmationModal();

  // Keyboard handling (same approach as the forgot-password screen).
  // Height of the open keyboard (0 when closed), added as extra scroll space
  // at the bottom so the card can be scrolled above the keyboard.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const scrollRef = useRef(null);
  const cardRef = useRef(null);
  // Current scroll position and the top edge of the open keyboard.
  const scrollYRef = useRef(0);
  const keyboardTopRef = useRef(0);

  // Scrolls just enough that the bottom of the card (the "Log in" button and
  // the "Forgot Password?" link) sits above the keyboard. Does nothing if it
  // is already visible.
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

  // Re-checks whenever the keyboard opens or changes height (number pad vs
  // full keyboard). The short delay lets the layout settle first.
  useEffect(() => {
    if (keyboardHeight <= 0) return undefined;
    const timer = setTimeout(keepCardAboveKeyboard, 150);
    return () => clearTimeout(timer);
  }, [keyboardHeight, keepCardAboveKeyboard]);

  const handleLogin = async () => {
    // The button is disabled while locked, but the keyboard's "done" key
    // also calls this, so the lock is checked here too.
    if (isSubmitting || isLocked) {
      return;
    }

  const id = studentId.trim();

    if (!/^\d{1,8}$/.test(id)) {
      showFeedback({
        title: 'Invalid Student ID',
        message: 'Enter a Student ID containing 1 to 8 digits.',
        tone: 'error',
      });
      return;
    }

    const email = `${id}@slc-sflu.edu.ph`;

  if (!email || !password) {
    showFeedback({
      title: 'Missing details',
      message: 'Enter your email and password.',
      tone: 'error',
    });
    return;
  }

  Keyboard.dismiss();
  setIsSubmitting(true);

  try {
      await SecureStore.deleteItemAsync('accessToken');
      await SecureStore.deleteItemAsync('refreshToken');
      
    const loginResponse = await loginUser(email, password);

    const userProfile = loginResponse.user;

    if (!userProfile) {
      throw new Error('Login succeeded, but no user profile was returned.');
    }

    // Signed in again, so the "session expired" notice no longer applies.
    setSessionExpired(false);

    // A successful login means any earlier lock is over.
    clearLock();

    const changePasswordParams = {
      mustChangePassword: true,
      temporaryPassword: password,
    };

    // An account that has not agreed to the current Terms and Data Privacy
    // Consent sees that screen first, before anything else. The answer comes
    // from the account itself (terms_accepted in the login response), so it
    // follows the user to any phone. `routes` is where "I Agree" continues
    // to: the same place this login would have gone.
    if (!hasAcceptedTerms(userProfile)) {
      navigation.reset({
        index: 0,
        routes: [
          {
            name: 'Terms',
            params: {
              mode: 'consent',
              routes: userProfile.must_change_password
                ? [
                    // Login stays underneath, as it does without the terms step.
                    { name: 'Login' },
                    { name: 'ChangePassword', params: changePasswordParams },
                  ]
                : [{ name: 'Main', params: { user: userProfile } }],
            },
          },
        ],
      });
      return;
    }

    if (userProfile.must_change_password) {
      navigation.navigate('ChangePassword', changePasswordParams);
      return;
    }

    navigation.reset({
      index: 0,
      routes: [
        {
          name: 'Main',
          params: { user: userProfile },
        },
      ],
    });
  } catch (error) {
    let title = 'Login failed';
    let message = 'Unable to connect to the server. Please try again.';

    const status = error.response?.status;
    const data = error.response?.data || {};

    // The server's own explanation, when it sent one.
    const serverMessage =
      typeof data.error === 'string'
        ? data.error
        : typeof data.detail === 'string'
          ? data.detail
          : '';

    if (status === 423 || data.locked) {
      // Too many wrong passwords: the server locked this account's login.
      // seconds_left is used instead of locked_until so a wrong clock on
      // the phone cannot shorten or lengthen the countdown.
      const secondsLeft = Number(data.seconds_left) > 0
        ? Number(data.seconds_left)
        : DEFAULT_LOCK_SECONDS;

      setLockedId(id);
      setLockSecondsLeft(secondsLeft);
      setLockedUntil(Date.now() + secondsLeft * 1000);
      setSuggestReset(Boolean(data.suggest_reset));

      title = 'Login locked';
      message =
        serverMessage ||
        'Too many failed login attempts. Please wait before trying again.';
    } else if (status === 404 || data.not_registered) {
      // Backend indicates no account matches this ID
      message = 'Invalid ID number';
    } else if (status === 401) {
      // Wrong password. The server's message also says how many attempts
      // are left before the login is locked, so it is shown as sent.
      message = serverMessage || 'Invalid password';
    } else if (error.code === 'ECONNABORTED') {
      message = 'The server took too long to respond.';
    } else if (error.message === 'Network Error') {
      message = 'Cannot reach the server. Check the API address and Wi-Fi connection.';
    } else if (serverMessage) {
      // Archived, inactive, unverified, or expired temporary password:
      // the server's message explains which one.
      message = serverMessage;
    }

    // Remove the full-screen loader before showing the modal. The old
    // Alert.alert needed a setTimeout(0) here to avoid an iOS rendering
    // glitch when the native alert appeared on top of the loader unmounting;
    // the shared modal renders in this same component tree, so no delay
    // is needed — updating both bits of state on the same tick is fine.
    setIsSubmitting(false);

    showFeedback({
      title,
      message,
      tone: 'error',
      confirmLabel: 'OK',
      onClose: () => setIsSubmitting(false),
    });
  } finally {
    // Guarantees the loader stops for success, errors, and navigation failures.
    setIsSubmitting(false);
  }
}

  return (
    <View className="flex-1">
      <View className="flex-1">
        <Header />

        <ScrollView
          ref={scrollRef}
          onScroll={(event) => {
            scrollYRef.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          className="flex-1 bg-[#f4f5f7] dark:bg-slate-950"
          contentContainerStyle={{
            alignItems: 'center',
            paddingBottom: 24 + keyboardHeight,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* Smaller title spacing while the keyboard is open leaves more room for the form. */}
          <Text
            className={`text-[#1e2a5e] text-[26px] font-extrabold font-serif text-center leading-8 dark:text-slate-100 ${
              keyboardHeight > 0 ? 'mt-4 mb-4' : sessionExpired || isLocked ? 'mt-12 mb-6' : 'mt-12 mb-10'
            }`}
          >
            {'WELCOME,\nLOUISIAN!'}
          </Text>

          {/* Shown when the user was signed out because their session ended. */}
          {sessionExpired && (
            <View className="mb-4 w-[88%] flex-row items-start rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 dark:border-amber-900 dark:bg-amber-950">
              <Ionicons
                name="time-outline"
                size={18}
                color={isDark ? '#FBBF24' : '#B45309'}
              />
              <View className="ml-2.5 flex-1">
                <Text className="text-[13px] font-bold text-amber-800 dark:text-amber-300">
                  Session expired
                </Text>
                <Text className="mt-0.5 text-[12px] leading-4 text-amber-700 dark:text-amber-400">
                  Your session has expired. Please sign in again.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSessionExpired(false)}
                accessibilityRole="button"
                accessibilityLabel="Dismiss session expired message"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name="close"
                  size={16}
                  color={isDark ? '#FBBF24' : '#B45309'}
                />
              </TouchableOpacity>
            </View>
          )}

          {/* Shown while this ID number's login is locked after too many wrong passwords. */}
          {isLocked && (
            <View className="mb-4 w-[88%] flex-row items-start rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 dark:border-rose-900 dark:bg-rose-950">
              <Ionicons
                name="lock-closed-outline"
                size={18}
                color={isDark ? '#FB7185' : '#BE123C'}
              />
              <View className="ml-2.5 flex-1">
                <Text className="text-[13px] font-bold text-rose-800 dark:text-rose-300">
                  Login locked
                </Text>
                <Text className="mt-0.5 text-[12px] leading-4 text-rose-700 dark:text-rose-400">
                  Too many incorrect passwords. You can try again in{' '}
                  <Text className="font-bold">{formatCountdown(lockSecondsLeft)}</Text>.
                </Text>

                {suggestReset && (
                  <TouchableOpacity
                    onPress={() => navigation.navigate('ForgotPassword')}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    className="mt-1.5 self-start"
                  >
                    <Text className="text-[12px] font-bold text-rose-800 underline dark:text-rose-300">
                      Forgot your password? Reset it now
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          <View
            ref={cardRef}
            collapsable={false}
            className="w-[88%] rounded-2xl py-2 overflow-hidden bg-white shadow-md dark:bg-slate-900 dark:shadow-none"
          >
            <View className="bg-white/75 py-6 px-5 dark:bg-slate-900">
              <View className="w-full gap-3">
                <View>
                  <Text className={`${FIELD_LABEL} mb-2`}>
                    ID Number
                  </Text>

                  <View className="flex-row items-center border border-[#d7dbe0] bg-white rounded-lg h-[46px] overflow-hidden dark:border-slate-700 dark:bg-slate-800">
                    <TextInput
                      className="flex-1 px-3.5 text-sm text-[#333] dark:text-slate-100"
                      placeholder="Enter your ID number"
                      placeholderTextColor={placeholderColor}
                      value={studentId}
                      onChangeText={(value) => setStudentId(value.replace(/\D/g, ''))}
                      keyboardType="number-pad"
                      maxLength={8}
                      returnKeyType="next"
                      editable={!isSubmitting}
                    />
                  </View>
                </View>

                <Text className={FIELD_LABEL}>
                  Password
                </Text>

                <View className="relative">
                  <TextInput
                    className="border border-[#d7dbe0] bg-white rounded-lg px-3.5 pr-12 h-[46px] text-sm text-[#333] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    placeholder="Enter your password"
                    placeholderTextColor={placeholderColor}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!isPasswordVisible}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="password"
                    textContentType="password"
                    returnKeyType="done"
                    editable={!isSubmitting}
                    onSubmitEditing={handleLogin}
                  />

                  <TouchableOpacity
                    onPress={() => setIsPasswordVisible((visible) => !visible)}
                    className="absolute right-0 top-0 h-[46px] w-12 items-center justify-center"
                    accessibilityRole="button"
                    accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'}
                  >
                    <Ionicons
                      name={isPasswordVisible ? 'eye-off-outline' : 'eye-outline'}
                      size={22}
                      color={isDark ? '#94A3B8' : '#5B647A'}
                    />
                  </TouchableOpacity>
                </View>

                {/* Disabled and greyed out while the login is locked; the label shows the countdown. */}
                <TouchableOpacity
                  className={`rounded-lg h-[46px] items-center justify-center mt-1 ${
                    isLocked
                      ? 'bg-slate-400 dark:bg-slate-700'
                      : 'bg-[#1e2a5e] dark:bg-indigo-600'
                  }`}
                  activeOpacity={0.85}
                  onPress={handleLogin}
                  disabled={isSubmitting || isLocked}
                  accessibilityState={{ disabled: isSubmitting || isLocked }}
                >
                    <Text className="text-white font-bold text-[15px]">
                      {isLocked ? `Try again in ${formatCountdown(lockSecondsLeft)}` : 'Log in'}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => navigation.navigate('ForgotPassword')}
                  activeOpacity={0.7}
                  className="items-center mt-3.5"
                  disabled={isSubmitting}
                >
                  <Text className={`${LINK_TEXT} text-[13px] underline`}>
                    Forgot Password?
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View className="flex-row mt-6">
            <Text className="text-[#444] text-[13px] mr-1 dark:text-slate-400">
              Don't have an account?
            </Text>
            {/* Registration starts with the Terms and Data Privacy Consent;
                agreeing there opens the registration form. */}
            <TouchableOpacity
              onPress={() => navigation.replace('Terms', { mode: 'register' })}
              activeOpacity={0.7}
            >
              <Text className={`${LINK_TEXT} text-[13px] font-bold underline`}>
                Register
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>

      <Footer />

      {isSubmitting && (
        <View
          className="absolute inset-0 items-center justify-center bg-[#1b2061]/45 dark:bg-black/60"
          pointerEvents="auto"
        >
          <View className="w-[78%] items-center rounded-2xl bg-white px-6 py-7 shadow-lg dark:bg-slate-900">
            <ActivityIndicator size="large" color={isDark ? '#C7D2FE' : '#1b2061'} />
            <Text className="mt-4 text-center text-base font-bold text-[#1b2061] dark:text-slate-100">
              Logging you in...
            </Text>
            <Text className="mt-1 text-center text-sm text-[#666] dark:text-slate-400">
              Please wait while we secure your session.
            </Text>
          </View>
        </View>
      )}

      {confirmationModal}
    </View>
  );
}