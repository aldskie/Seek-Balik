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
import { Ionicons } from '@expo/vector-icons';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useAppearance } from '../hooks/Appearance';
import { useConfirmationModal } from '../components/ConfirmationModal';

// Same three backend endpoints the website's Forgot Password modal uses.
// Each one takes the school email built from the ID number.
//   requestPasswordReset(email)                      -> account/password-reset/request/
//   verifyPasswordResetCode(email, code)             -> the backend's password_reset_verify view
//   confirmPasswordReset(email, code, newPassword)   -> account/password-reset/confirm/
//
// The login endpoint is no longer called from this screen: the backend now
// counts every wrong password toward the login lockout, so "checking" an ID
// number through it would lock the very account being recovered.
import {
  requestPasswordReset,
  verifyPasswordResetCode,
  confirmPasswordReset,
} from '../api/api';

// The backend works with emails, so the ID number is turned into the
// school ID email (e.g. 23100094 -> 23100094@slc-sflu.edu.ph) before sending.
const SCHOOL_EMAIL_DOMAIN = '@slc-sflu.edu.ph';
const ID_NUMBER_MAX_LENGTH = 8;
const ID_NUMBER_REGEX = /^\d{1,8}$/;

const CODE_LENGTH = 6;
const RESEND_SECONDS = 60;
// Shortest time the loading modal stays up after pressing "Reset Password".
const RESET_MIN_LOADING_MS = 1000;
// Same rules as the backend (change_password / password_reset_confirm):
// 8-12 characters, no spaces, one capital letter, one special character.
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 12;

// Class strings reused below, each with its light and dark colors.
const FIELD_LABEL = 'mb-2 text-[#1e2a5e] text-[13px] font-bold dark:text-slate-200';
const FIELD_INPUT =
  'border border-[#d7dbe0] bg-white rounded-lg px-3.5 h-[46px] text-sm text-[#333] dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100';
const PRIMARY_BUTTON =
  'bg-[#1e2a5e] rounded-lg h-[46px] items-center justify-center dark:bg-indigo-600';
const SECONDARY_BUTTON =
  'border border-[#1e2a5e] rounded-lg h-[46px] items-center justify-center dark:border-slate-600';

const STEP_TEXT = {
  id: "Enter your ID number and we'll send a 6-digit code to your school email.",
  code: 'Enter the 6-digit code we sent to your school email.',
  password: 'Choose a new password.',
};

const BUTTON_TEXT = {
  id: 'Send Code',
  code: 'Verify',
  password: 'Reset Password',
};

// Pulls a readable message out of a DRF-style error response, falling back
// to a generic message if the shape is unexpected.
const getErrorMessage = (err, fallback) => {
  const data = err?.response?.data;
  if (!data || typeof data !== 'object') return fallback;

  if (typeof data.detail === 'string') return data.detail;
  if (typeof data.error === 'string') return data.error;
  if (typeof data.message === 'string') return data.message;

  const first = Object.values(data)[0];
  if (Array.isArray(first) && typeof first[0] === 'string') return first[0];
  if (typeof first === 'string') return first;

  return fallback;
};

// Turns any failed request into a message for the user:
//   - no response at all -> timeout / connection message
//   - server crash (5xx) -> the generic fallback
//   - anything else      -> the backend's own message (wrong code, password rule, ...)
// Only the unexpected cases are logged; a wrong code is a normal outcome and
// is shown on screen without a red error in the console.
const getFriendlyError = (err, fallback) => {
  if (!err?.response) {
    console.warn('Forgot password request failed:', err?.message);
    return err?.code === 'ECONNABORTED'
      ? 'The server took too long to respond. Please try again.'
      : 'Cannot reach the server. Check your connection and try again.';
  }

  if (err.response.status >= 500) {
    console.warn('Forgot password server error:', err.response.status);
    return fallback;
  }

  return getErrorMessage(err, fallback);
};

// ID number -> school email. Returns null when the ID number is not valid.
const toAccountEmail = (value) => {
  const trimmed = value.trim();
  if (!ID_NUMBER_REGEX.test(trimmed)) return null;
  return `${trimmed}${SCHOOL_EMAIL_DOMAIN}`;
};

export default function ForgotPasswordScreen({ navigation }) {
  // Icon, spinner, and placeholder colors follow the app's appearance.
  const { isDark } = useAppearance();
  const eyeColor = isDark ? '#C7D2FE' : '#1e2a5e';
  const placeholderColor = isDark ? '#64748B' : '#8a8a8a';

  // "id"       -> enter the ID number and send a code
  // "code"     -> enter the 6-digit code; it is checked with the server
  // "password" -> only after the code is verified: new password + confirm
  const [step, setStep] = useState('id');

  const [idNumber, setIdNumber] = useState('');
  // The email the code was sent to, reused by the later steps.
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  // True while the code field has focus, so the current box can be highlighted.
  const [codeFocused, setCodeFocused] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [cooldown, setCooldown] = useState(0);

  // Height of the open keyboard (0 when closed). Added as extra scroll space
  // at the bottom so every button, including "Back to Login", can be
  // scrolled above the keyboard.
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const { confirmationModal, showFeedback } = useConfirmationModal();

  const scrollRef = useRef(null);
  // The area under the header that the form scrolls in. Its top edge is the
  // highest point a field can reach before the header covers it.
  const scrollAreaRef = useRef(null);
  const cardRef = useRef(null);
  // The first field of the current step (ID number, the code boxes, or New
  // Password). It must never be scrolled up behind the header.
  const firstFieldRef = useRef(null);
  // Current scroll position and the top edge of the open keyboard.
  const scrollYRef = useRef(0);
  const keyboardTopRef = useRef(0);

  // Space kept between the header and the first field.
  const FIELD_TOP_GAP = 12;
  // Space kept between the bottom of the card and the keyboard.
  const CARD_BOTTOM_GAP = 24;

  // Scrolls so the bottom of the card (the "Back to Login" button) sits above
  // the keyboard, but never so far that the first field goes behind the
  // header. When the card is too tall for both (the New Password step on a
  // small phone), the first field wins: it stays visible and the buttons
  // below are still reachable by scrolling, thanks to the extra bottom space.
  const keepCardAboveKeyboard = useCallback(() => {
    const keyboardTop = keyboardTopRef.current;
    if (
      !keyboardTop ||
      !cardRef.current ||
      !scrollRef.current ||
      !scrollAreaRef.current
    ) {
      return;
    }

    scrollAreaRef.current.measureInWindow((areaX, areaTop) => {
      cardRef.current?.measureInWindow((cardX, cardTop, cardWidth, cardHeight) => {
        // How far to scroll up so the card's bottom clears the keyboard.
        const toClearKeyboard = cardTop + cardHeight + CARD_BOTTOM_GAP - keyboardTop;

        const scrollBy = (limit) => {
          const amount = Math.min(toClearKeyboard, limit);
          if (Math.abs(amount) < 1) return;
          scrollRef.current?.scrollTo({
            y: Math.max(0, scrollYRef.current + amount),
            animated: true,
          });
        };

        const field = firstFieldRef.current;
        if (!field) {
          scrollBy(toClearKeyboard);
          return;
        }

        field.measureInWindow((fieldX, fieldTop) => {
          // The most the form may scroll up before the first field reaches
          // the header. A negative value means the field is already hidden,
          // so the form scrolls back down to show it.
          const untilHeader = fieldTop - (areaTop + FIELD_TOP_GAP);
          scrollBy(untilHeader);
        });
      });
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

  // Re-checks whenever the keyboard opens or the card changes size (new
  // step, error or notice shown). The short delay lets the layout settle.
  useEffect(() => {
    if (keyboardHeight <= 0) return undefined;
    const timer = setTimeout(keepCardAboveKeyboard, 150);
    return () => clearTimeout(timer);
  }, [keyboardHeight, step, error, info, keepCardAboveKeyboard]);

  // Counts the resend timer down once per second.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const goToLogin = () => {
    Keyboard.dismiss();
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
  };

  // Sends the code. Shared by the first send and by "Resend code".
  // Returns true on success.
  const sendCode = async () => {
    const accountEmail = toAccountEmail(idNumber);

    if (!accountEmail) {
      setError(
        idNumber.trim() ? 'Enter a valid ID number.' : 'Enter your ID number.',
      );
      return false;
    }

    setLoading(true);
    setLoadingText('Sending code...');
    setError('');
    setInfo('');

    try {
      await requestPasswordReset(accountEmail);
      setEmail(accountEmail);
      // Same wording whether or not the account exists (the backend answers
      // the same way for both), matching the website.
      setInfo(
        `If an account exists for ${accountEmail}, a 6-digit code has been sent. It may take a minute to arrive and expires in 10 minutes.`,
      );
      setCooldown(RESEND_SECONDS);
      return true;
    } catch (err) {
      setError(
        getFriendlyError(
          err,
          "We couldn't send the code. Please try again in a moment.",
        ),
      );
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleRequest = async () => {
    const ok = await sendCode();
    if (ok) setStep('code');
  };

  const handleResend = async () => {
    if (cooldown > 0 || loading) return;
    setCode('');
    await sendCode();
  };

  // Step 2: the code is checked with the server before the password fields
  // are shown. The code is not used up here; the same code is sent again
  // with the new password on "Reset Password".
  const handleVerify = async () => {
    if (loading) return;

    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your email.');
      return;
    }

    Keyboard.dismiss();
    setError('');
    setLoadingText('Verifying code...');
    setLoading(true);

    try {
      await verifyPasswordResetCode(email, code);
      setInfo('');
      setStep('password');
    } catch (err) {
      setError(
        getFriendlyError(
          err,
          'That code is invalid or has expired. Please request a new one.',
        ),
      );
      // A wrong code is cleared so the six boxes are ready for another try.
      if (err?.response) setCode('');
    } finally {
      setLoading(false);
    }
  };

  // Checks done on the phone before anything is sent. Returns the message
  // to show, or '' when the passwords are fine.
  const getPasswordError = () => {
    if (!newPassword || !confirmPassword) {
      return 'Enter and confirm your new password.';
    }

    if (
      newPassword.length < MIN_PASSWORD_LENGTH ||
      newPassword.length > MAX_PASSWORD_LENGTH
    ) {
      return `New password must contain ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters.`;
    }

    if (/\s/.test(newPassword)) {
      return 'New password must not contain spaces.';
    }

    if (!/[A-Z]/.test(newPassword)) {
      return 'New password must contain at least one capital letter.';
    }

    if (!/[^A-Za-z0-9\s]/.test(newPassword)) {
      return 'New password must contain at least one special character (e.g. ! @ # $ %).';
    }

    if (newPassword !== confirmPassword) {
      return 'New passwords do not match.';
    }

    return '';
  };

  // Every press shows the loading modal for at least RESET_MIN_LOADING_MS,
  // whether the result is a phone-side error, a backend error, or success.
  const handleReset = async () => {
    if (loading) return;

    Keyboard.dismiss();
    setError('');
    setLoadingText('Resetting password...');
    setLoading(true);

    const minimumWait = new Promise((resolve) =>
      setTimeout(resolve, RESET_MIN_LOADING_MS),
    );

    const passwordError = getPasswordError();
    if (passwordError) {
      await minimumWait;
      setLoading(false);
      setError(passwordError);
      return;
    }

    try {
      const [result] = await Promise.allSettled([
        confirmPasswordReset(email, code, newPassword),
        minimumWait,
      ]);
      if (result.status === 'rejected') throw result.reason;

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
    } catch (err) {
      const message = getFriendlyError(
        err,
        'Unable to reset your password. Please try again.',
      );
      setError(message);

      // The code stopped working (expired / too many tries): back to the
      // code step so a new one can be requested.
      if (err?.response && /code/i.test(message)) {
        setCode('');
        setStep('code');
      }
    } finally {
      setLoading(false);
    }
  };

  // Back to the first step with everything cleared.
  const startOver = () => {
    setStep('id');
    setEmail('');
    setCode('');
    setNewPassword('');
    setConfirmPassword('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setError('');
    setInfo('');
    setCooldown(0);
  };

  // Leaving the screen (Back to Login, the phone's back button, or after a
  // successful reset) clears every input, so coming back always starts
  // again from an empty ID number step.
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      setStep('id');
      setIdNumber('');
      setEmail('');
      setCode('');
      setNewPassword('');
      setConfirmPassword('');
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setError('');
      setInfo('');
      setCooldown(0);
    });

    return unsubscribe;
  }, [navigation]);

  const handlePrimaryPress =
    step === 'id' ? handleRequest : step === 'code' ? handleVerify : handleReset;

  return (
    <View className="flex-1">
      <View className="flex-1">
        <Header />

        <View ref={scrollAreaRef} collapsable={false} className="flex-1">
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
          >
            {/* Smaller title spacing while the keyboard is open leaves more room for the form. */}
            <Text
              className={`text-[#1e2a5e] text-[26px] font-extrabold font-serif text-center leading-8 dark:text-slate-100 ${
                keyboardHeight > 0 ? 'mt-4 mb-4' : 'mt-10 mb-10'
              }`}
            >
              {step === 'id' ? 'FORGOT\nPASSWORD' : 'RESET\nPASSWORD'}
            </Text>

            <View
              ref={cardRef}
              collapsable={false}
              className="w-[88%] rounded-2xl py-2 overflow-hidden bg-white shadow-md dark:bg-slate-900 dark:shadow-none"
            >
              <View className="bg-white/75 py-6 px-5 dark:bg-slate-900">
                <View className="w-full gap-4">
                  <Text className="text-[#555] text-xs leading-5 dark:text-slate-400">
                    {STEP_TEXT[step]}
                  </Text>

                  {!!info && step === 'code' && (
                    <Text className="rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      {info}
                    </Text>
                  )}

                  {/* STEP 1: ID number (numbers-only keyboard) */}
                  {step === 'id' && (
                    <View ref={firstFieldRef} collapsable={false}>
                      <Text className={FIELD_LABEL}>ID Number</Text>
                      <TextInput
                        className={FIELD_INPUT}
                        placeholder="Enter your ID number"
                        placeholderTextColor={placeholderColor}
                        value={idNumber}
                        onChangeText={(text) => setIdNumber(text.replace(/\D/g, ''))}
                        keyboardType="number-pad"
                        inputMode="numeric"
                        maxLength={ID_NUMBER_MAX_LENGTH}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={handleRequest}
                        editable={!loading}
                      />
                    </View>
                  )}

                  {/* STEP 2: 6-digit code only */}
                  {step === 'code' && (
                    <View ref={firstFieldRef} collapsable={false}>
                      <Text className={FIELD_LABEL}>6-digit Code</Text>

                      {/* Same design as the sign-up screen: six boxes, one digit
                          each. A single invisible input sits on top of the row
                          and holds the real value, so typing moves to the next
                          box, backspace moves back, and pasting or autofill of
                          the whole code still works. */}
                      <View>
                        <View className="flex-row justify-between" pointerEvents="none">
                          {Array.from({ length: CODE_LENGTH }, (_, index) => {
                            const digit = code[index] || '';
                            const isActive =
                              codeFocused &&
                              !loading &&
                              index === Math.min(code.length, CODE_LENGTH - 1);

                            let boxBorder = 'border-[#d7dbe0] dark:border-slate-700';
                            if (error) boxBorder = 'border-[#c0392b] dark:border-rose-500';
                            else if (isActive) boxBorder = 'border-[#1b2061] dark:border-indigo-400';
                            else if (digit) boxBorder = 'border-slate-400 dark:border-slate-500';

                            return (
                              <View
                                key={index}
                                className={`h-[52px] w-[14.5%] items-center justify-center rounded-xl border-2 bg-white dark:bg-slate-800 ${boxBorder}`}
                              >
                                <Text className="text-xl font-bold text-[#16233F] dark:text-slate-100">
                                  {digit}
                                </Text>
                              </View>
                            );
                          })}
                        </View>

                        <TextInput
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            opacity: 0.01,
                            color: 'transparent',
                          }}
                          caretHidden
                          value={code}
                          onChangeText={(text) => {
                            setCode(text.replace(/\D/g, '').slice(0, CODE_LENGTH));
                            if (error) setError('');
                          }}
                          onFocus={() => setCodeFocused(true)}
                          onBlur={() => setCodeFocused(false)}
                          keyboardType="number-pad"
                          inputMode="numeric"
                          textContentType="oneTimeCode"
                          autoComplete="one-time-code"
                          maxLength={CODE_LENGTH}
                          autoFocus
                          returnKeyType="done"
                          onSubmitEditing={handleVerify}
                          editable={!loading}
                          accessibilityLabel={`${CODE_LENGTH}-digit code`}
                        />
                      </View>
                    </View>
                  )}

                  {/* STEP 3: new password + confirm, shown after the code matches */}
                  {step === 'password' && (
                    <>
                      <View ref={firstFieldRef} collapsable={false}>
                        <Text className={FIELD_LABEL}>New Password</Text>

                        <View className="relative">
                          <TextInput
                            className={`${FIELD_INPUT} pr-12`}
                            placeholder={`${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters, no spaces`}
                            placeholderTextColor={placeholderColor}
                            value={newPassword}
                            onChangeText={setNewPassword}
                            secureTextEntry={!showNewPassword}
                            autoCapitalize="none"
                            autoCorrect={false}
                            autoFocus
                            maxLength={MAX_PASSWORD_LENGTH}
                            editable={!loading}
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
                        <Text className={FIELD_LABEL}>Confirm New Password</Text>

                        <View className="relative">
                          <TextInput
                            className={`${FIELD_INPUT} pr-12`}
                            placeholder="Re-enter new password"
                            placeholderTextColor={placeholderColor}
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            secureTextEntry={!showConfirmPassword}
                            autoCapitalize="none"
                            autoCorrect={false}
                            maxLength={MAX_PASSWORD_LENGTH}
                            returnKeyType="done"
                            onSubmitEditing={handleReset}
                            editable={!loading}
                          />

                          <TouchableOpacity
                            className="absolute right-0 top-0 h-[46px] w-12 items-center justify-center"
                            onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                          >
                            <Ionicons
                              name={
                                showConfirmPassword ? 'eye-off-outline' : 'eye-outline'
                              }
                              size={22}
                              color={eyeColor}
                            />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </>
                  )}

                  {!!error && (
                    <Text className="text-[#c0392b] text-xs dark:text-rose-400">{error}</Text>
                  )}

                  <TouchableOpacity
                    className={PRIMARY_BUTTON}
                    activeOpacity={0.85}
                    onPress={handlePrimaryPress}
                    disabled={loading}
                  >
                    <Text className="text-white font-bold text-[15px]">
                      {BUTTON_TEXT[step]}
                    </Text>
                  </TouchableOpacity>

                  {step === 'code' && (
                    <View className="flex-row items-center justify-between">
                      <TouchableOpacity
                        onPress={handleResend}
                        disabled={loading || cooldown > 0}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text
                          className={`text-xs font-semibold ${
                            cooldown > 0
                              ? 'text-slate-400 dark:text-slate-500'
                              : 'text-[#1e2a5e] dark:text-indigo-200'
                          }`}
                        >
                          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={startOver}
                        disabled={loading}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                          Use a different ID number
                        </Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {step === 'password' && (
                    <TouchableOpacity
                      onPress={startOver}
                      disabled={loading}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text className="text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Code expired? Start over
                      </Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    className={SECONDARY_BUTTON}
                    activeOpacity={0.85}
                    onPress={goToLogin}
                    disabled={loading}
                  >
                    <Text className="text-[#1e2a5e] font-bold text-[15px] dark:text-slate-200">
                      Back to Login
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>

      <Footer />

      {loading && (
        <View className="absolute inset-0 items-center justify-center bg-[#1b2061]/45 dark:bg-black/60">
          <View className="w-[78%] items-center rounded-2xl bg-white px-6 py-7 dark:bg-slate-900">
            <ActivityIndicator size="large" color={isDark ? '#C7D2FE' : '#1b2061'} />
            <Text className="mt-4 text-base font-bold text-[#1b2061] dark:text-slate-100">
              {loadingText}
            </Text>
          </View>
        </View>
      )}

      {confirmationModal}
    </View>
  );
}