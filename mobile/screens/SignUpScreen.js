import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Modal,
  Keyboard,
  KeyboardAvoidingView,
  ActivityIndicator,
  Platform,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, CheckCircle2 } from 'lucide-react-native';
import Header from '../components/Header';
import Footer from '../components/Footer';
import '../global.css';

import {
  registerUser,
  verifyEmail,
  resendVerificationCode,
} from '../api/api';
import { useAppearance } from '../hooks/Appearance';


const SCHOOL_DOMAIN = '@slc-sflu.edu.ph';
const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 60;

// Class strings reused below, each with its light and dark colors.
const FIELD_LABEL = 'text-[#1e2a5e] text-[13px] font-bold dark:text-slate-200';
const LINK_TEXT = 'text-[#1e2a5e] dark:text-indigo-300';
const ERROR_TEXT = 'text-[#c0392b] dark:text-rose-400';
const HINT_TEXT = 'text-slate-500 dark:text-slate-400';

// Contact number (optional, same as the website). When filled in:
//   - starts with 09  -> 11 digits total      (e.g. 09123456789)
//   - starts with +63 -> 10 digits after +63  (e.g. +639123456789)
const CONTACT_NUMBER_REGEX = /^(09\d{9}|\+63\d{10})$/;
const CONTACT_MAX_LENGTH_LOCAL = 11;
const CONTACT_MAX_LENGTH_INTL = 13;

const sanitizeContactNumber = (raw) => {
  const hasPlus = raw.trim().startsWith('+');
  const digits = raw.replace(/\D/g, '');
  const value = hasPlus ? `+${digits}` : digits;
  return value.slice(
    0,
    hasPlus ? CONTACT_MAX_LENGTH_INTL : CONTACT_MAX_LENGTH_LOCAL
  );
};

const DUPLICATE_ACCOUNT_MESSAGE =
  'An account with this ID number already exists.';

// Same logic as the website's extractServerMessage: prefer
// message/error/detail, otherwise fall back to the first field error in a
// DRF-style body.
const extractServerMessage = (requestError, fallback) => {
  const data = requestError?.response?.data;
  let serverMessage = data?.message || data?.error || data?.detail;

  if (!serverMessage && data && typeof data === 'object') {
    const firstKey = Object.keys(data)[0];
    const firstVal = data[firstKey];
    if (firstKey) {
      serverMessage = Array.isArray(firstVal) ? firstVal[0] : firstVal;
      if (firstKey !== 'email' && serverMessage) {
        serverMessage = `${firstKey}: ${serverMessage}`;
      }
    }
  }

  return typeof serverMessage === 'string' && serverMessage
    ? serverMessage
    : fallback;
};

// True when the backend rejected the request because the account already
// exists (409, or a 400 whose email error says so).
const isDuplicateAccountError = (requestError) => {
  const status = requestError?.response?.status;
  if (status === 409) return true;

  const details = requestError?.response?.data;
  const text = [details?.message, details?.error, details?.detail, details?.email?.[0]]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .toLowerCase();

  return /already|exists|taken|duplicate|unique/.test(text);
};

export default function SignUpScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  // Icon, spinner, and placeholder colors follow the app's appearance.
  const { isDark } = useAppearance();
  const placeholderColor = isDark ? '#64748B' : '#8a8a8a';

  // Keyboard handling for the form.
  const formScrollRef = useRef(null);
  const firstNameInputRef = useRef(null);
  const lastNameInputRef = useRef(null);
  const studentIdInputRef = useRef(null);
  const contactNumberInputRef = useRef(null);
  const codeInputRef = useRef(null);
  const focusedInputRef = useRef(null);
  const keyboardHeightRef = useRef(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // 'form'     = filling in details (no modal)
  // 'verify'   = floating modal asking for the 6-digit code
  // 'verified' = same floating modal showing the success message
  const [step, setStep] = useState('form');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [contactNumber, setContactNumber] = useState('');

  const [verificationCode, setVerificationCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  // True while the code field has focus, so the current box can be highlighted.
  const [codeFocused, setCodeFocused] = useState(false);

  const [error, setError] = useState('');
  const [idError, setIdError] = useState('');
  const [contactError, setContactError] = useState('');
  const [codeError, setCodeError] = useState('');
  // Green/amber note at the top of the verify modal.
  const [notice, setNotice] = useState({ text: '', tone: 'success' });
  // True when the email was verified but the temp-password email failed.
  const [passwordEmailFailed, setPasswordEmailFailed] = useState(false);

  // '' when idle, otherwise what is in progress.
  const [busyLabel, setBusyLabel] = useState('');
  const isBusy = Boolean(busyLabel);

  const email = `${studentId.trim()}${SCHOOL_DOMAIN}`.toLowerCase();

  const scrollFocusedInputAboveKeyboard = () => {
    const target = focusedInputRef.current;
    const scrollNode = formScrollRef.current;
    if (!target || !scrollNode) return;

    target.measureLayout(
      scrollNode,
      (x, y) => {
        scrollNode.scrollTo({ y: Math.max(y - 24, 0), animated: true });
      },
      () => {}
    );
  };

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', (event) => {
      const height = event?.endCoordinates?.height ?? 0;
      keyboardHeightRef.current = height;
      setKeyboardHeight(height);
      requestAnimationFrame(scrollFocusedInputAboveKeyboard);
    });
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      keyboardHeightRef.current = 0;
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const scrollFocusedInputIntoView = (inputRef) => {
    focusedInputRef.current = inputRef.current;
    if (keyboardHeightRef.current > 0) {
      requestAnimationFrame(scrollFocusedInputAboveKeyboard);
    }
  };

  // Countdown for the "Resend code" button.
  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setInterval(() => {
      setCooldown((previous) => (previous <= 1 ? 0 : previous - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // STEP 1: validate, then ask the backend to email a 6-digit code. The
  // account stays unverified until the code is confirmed in the modal.
  const handleRegister = async () => {
    if (isBusy) return;

    setError('');
    setIdError('');
    setContactError('');

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();
    const trimmedContact = contactNumber.trim();

    if (!trimmedFirst || !trimmedLast) {
      setError('Please enter your first and last name.');
      return;
    }
    if (!/^\d{1,8}$/.test(studentId.trim())) {
      setIdError('Enter an ID number containing 1 to 8 digits.');
      return;
    }
    if (trimmedContact && !CONTACT_NUMBER_REGEX.test(trimmedContact)) {
      setContactError(
        'Enter a valid contact number: 09XXXXXXXXX (11 digits) or +63XXXXXXXXXX (10 digits after +63).'
      );
      return;
    }

    Keyboard.dismiss();
    setBusyLabel('Sending verification code...');

    try {
      const res = await registerUser({
        first_name: trimmedFirst,
        last_name: trimmedLast,
        email,
        contact_number: trimmedContact || undefined,
      });

      setVerificationCode('');
      setCodeError('');
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setNotice(
        res?.email_sent === false
          ? {
              text: "We couldn't send the verification email. Try Resend code in a moment.",
              tone: 'warning',
            }
          : { text: `We've sent a ${CODE_LENGTH}-digit code to ${email}.`, tone: 'success' }
      );
      setStep('verify');
    } catch (requestError) {
      if (isDuplicateAccountError(requestError)) {
        setIdError(DUPLICATE_ACCOUNT_MESSAGE);
      } else if (requestError.code === 'ECONNABORTED') {
        setError('The server took too long to respond.');
      } else if (requestError.message === 'Network Error') {
        setError('Cannot reach the server. Check your connection and try again.');
      } else {
        setError(
          extractServerMessage(
            requestError,
            'Unable to start your registration. Please check your details and try again.'
          )
        );
      }
    } finally {
      setBusyLabel('');
    }
  };

  // STEP 2: confirm the code. On success the backend activates the account
  // and emails the temporary password; the modal then switches to its
  // success view with a "Go to Login" button.
  const handleVerify = async () => {
    if (isBusy) return;

    setCodeError('');

    const trimmedCode = verificationCode.trim();
    if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(trimmedCode)) {
      setCodeError(`Enter the ${CODE_LENGTH}-digit code we sent to your email.`);
      return;
    }

    Keyboard.dismiss();
    setBusyLabel('Verifying...');

    try {
      const res = await verifyEmail(email, trimmedCode);
      setPasswordEmailFailed(res?.email_sent === false);
      setStep('verified');
    } catch (requestError) {
      setCodeError(
        requestError.message === 'Network Error'
          ? 'Cannot reach the server. Check your connection and try again.'
          : extractServerMessage(
              requestError,
              "That code didn't work. Please check it and try again, or resend a new one."
            )
      );
    } finally {
      setBusyLabel('');
    }
  };

  const handleResendCode = async () => {
    if (isBusy || cooldown > 0) return;

    setCodeError('');
    setBusyLabel('Resending code...');

    try {
      // The backend returns the same generic message whether or not the
      // account exists, so just confirm and restart the cooldown.
      await resendVerificationCode(email);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setNotice({
        text: 'If that account needs verification, a new code has been sent.',
        tone: 'success',
      });
    } catch (requestError) {
      setCodeError(
        extractServerMessage(requestError, "Couldn't resend the code. Please try again.")
      );
    } finally {
      setBusyLabel('');
    }
  };

  // Closes the modal and returns to the form with the details still filled in.
  const handleBackToForm = () => {
    if (isBusy) return;
    setStep('form');
    setVerificationCode('');
    setCodeError('');
    setError('');
    setNotice({ text: '', tone: 'success' });
  };

  const handleGoToLogin = () => {
    setStep('form');
    navigation.navigate('Login');
  };

  const inputClass =
    'border bg-white rounded-lg px-3.5 h-[46px] text-sm text-[#333] dark:bg-slate-800 dark:text-slate-100';
  const borderFor = (hasError) =>
    hasError
      ? 'border-[#c0392b] dark:border-rose-500'
      : 'border-[#d7dbe0] dark:border-slate-700';

  const canVerify = verificationCode.length === CODE_LENGTH && !isBusy;

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}
    >
      <StatusBar barStyle="dark-content" />

      <View className="flex-1">
        <Header />

        <ScrollView
          ref={formScrollRef}
          showsVerticalScrollIndicator={false}
          className="flex-1 bg-[#f4f5f7] dark:bg-slate-950"
          contentContainerStyle={{
            alignItems: 'center',
            paddingBottom: keyboardHeight > 0 ? keyboardHeight + 24 : 24,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Text className="text-[#1e2a5e] text-[26px] font-extrabold font-serif text-center leading-8 mt-3 dark:text-slate-100">
            {'CREATE YOUR\nACCOUNT'}
          </Text>
          <Text className={`text-[13px] text-center mt-1 mb-4 px-8 ${HINT_TEXT}`}>
            Register using your SLC school ID.
          </Text>

          <View className="w-[88%] rounded-2xl py-2 overflow-hidden bg-white shadow-md dark:bg-slate-900 dark:shadow-none">
            <View className="bg-white/75 py-6 px-5 dark:bg-slate-900">
              <View className="w-full gap-3">
                <View className="flex-row gap-3">
                  <View className="flex-1 gap-1.5">
                    <Text className={FIELD_LABEL}>First Name</Text>
                    <TextInput
                      className={`${inputClass} ${borderFor(false)}`}
                      ref={firstNameInputRef}
                      onFocus={() => scrollFocusedInputIntoView(firstNameInputRef)}
                      placeholder="Juan"
                      placeholderTextColor={placeholderColor}
                      value={firstName}
                      onChangeText={(text) => {
                        setFirstName(text);
                        if (error) setError('');
                      }}
                      autoCapitalize="words"
                      returnKeyType="next"
                      onSubmitEditing={() => lastNameInputRef.current?.focus()}
                      editable={!isBusy}
                    />
                  </View>
                  <View className="flex-1 gap-1.5">
                    <Text className={FIELD_LABEL}>Last Name</Text>
                    <TextInput
                      className={`${inputClass} ${borderFor(false)}`}
                      ref={lastNameInputRef}
                      onFocus={() => scrollFocusedInputIntoView(lastNameInputRef)}
                      placeholder="Dela Cruz"
                      placeholderTextColor={placeholderColor}
                      value={lastName}
                      onChangeText={(text) => {
                        setLastName(text);
                        if (error) setError('');
                      }}
                      autoCapitalize="words"
                      returnKeyType="next"
                      onSubmitEditing={() => studentIdInputRef.current?.focus()}
                      editable={!isBusy}
                    />
                  </View>
                </View>

                <View className="gap-1.5">
                  <Text className={FIELD_LABEL}>ID Number</Text>
                  <TextInput
                    className={`${inputClass} ${borderFor(idError)}`}
                    ref={studentIdInputRef}
                    onFocus={() => scrollFocusedInputIntoView(studentIdInputRef)}
                    placeholder="e.g. 23100094"
                    placeholderTextColor={placeholderColor}
                    value={studentId}
                    onChangeText={(text) => {
                      setStudentId(text.replace(/\D/g, ''));
                      if (error) setError('');
                      if (idError) setIdError('');
                    }}
                    keyboardType="number-pad"
                    maxLength={8}
                    editable={!isBusy}
                  />
                  {idError ? (
                    <Text className={`${ERROR_TEXT} text-xs`}>{idError}</Text>
                  ) : (
                    <Text className={`text-[11px] ${HINT_TEXT}`}>
                      Your school email will be{' '}
                      {studentId.trim() ? email : `<ID number>${SCHOOL_DOMAIN}`}
                    </Text>
                  )}
                </View>

                <View className="gap-1.5">
                  <Text className={FIELD_LABEL}>
                    Contact Number{' '}
                    <Text className="font-normal text-slate-400">(optional)</Text>
                  </Text>
                  <TextInput
                    className={`${inputClass} ${borderFor(contactError)}`}
                    ref={contactNumberInputRef}
                    onFocus={() => scrollFocusedInputIntoView(contactNumberInputRef)}
                    placeholder="e.g. 09123456789"
                    placeholderTextColor={placeholderColor}
                    value={contactNumber}
                    onChangeText={(text) => {
                      setContactNumber(sanitizeContactNumber(text));
                      if (contactError) setContactError('');
                    }}
                    keyboardType="phone-pad"
                    maxLength={CONTACT_MAX_LENGTH_INTL}
                    editable={!isBusy}
                  />
                  {!!contactError && (
                    <Text className={`${ERROR_TEXT} text-xs`}>{contactError}</Text>
                  )}
                </View>

                <Text className={`text-[11px] leading-4 ${HINT_TEXT}`}>
                  We'll first send a {CODE_LENGTH}-digit code to confirm your email.
                  Your account is registered and your temporary password is emailed
                  only after that code is verified.
                </Text>

                {!!error && <Text className={`${ERROR_TEXT} text-xs`}>{error}</Text>}

                <TouchableOpacity
                  className="bg-[#1e2a5e] rounded-lg h-[46px] items-center justify-center mt-1 dark:bg-indigo-600"
                  activeOpacity={0.85}
                  onPress={handleRegister}
                  disabled={isBusy}
                >
                  <Text className="text-white font-bold text-[15px]">Register</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View className="flex-row mt-6">
            <Text className="text-[#444] text-[13px] mr-1 dark:text-slate-400">Already have an account?</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('Login')}
              activeOpacity={0.7}
              disabled={isBusy}
            >
              <Text className={`${LINK_TEXT} text-[13px] font-bold underline`}>Log in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>

      <Footer />

      {/* Full-screen loader while the first code is being sent (the
          verify modal isn't open yet at that point). */}
      {isBusy && step === 'form' && (
        <View
          className="absolute inset-0 items-center justify-center bg-[#1b2061]/45 dark:bg-black/60"
          pointerEvents="auto"
        >
          <View className="w-[78%] items-center rounded-2xl bg-white px-6 py-7 shadow-lg dark:bg-slate-900">
            <ActivityIndicator size="large" color={isDark ? '#C7D2FE' : '#1b2061'} />
            <Text className="mt-4 text-center text-base font-bold text-[#1b2061] dark:text-slate-100">
              {busyLabel}
            </Text>
            <Text className="mt-1 text-center text-sm text-[#666] dark:text-slate-400">Please wait a moment.</Text>
          </View>
        </View>
      )}

      {/* Floating verification modal: centered card over a dimmed
          backdrop. Tapping the backdrop does nothing, so the code step
          can't be dismissed by accident; "Edit details" (or the Android
          back button) returns to the form. */}
      <Modal
        visible={step !== 'form'}
        transparent
        animationType="fade"
        statusBarTranslucent
        onShow={() => {
          // Short delay so the keyboard opens reliably once the modal is on screen.
          if (step === 'verify') setTimeout(() => codeInputRef.current?.focus(), 150);
        }}
        onRequestClose={step === 'verified' ? handleGoToLogin : handleBackToForm}
      >
        <View className="flex-1">
          {/* Bottom padding equal to the keyboard height keeps the card centered in the space above the keyboard. */}
          <View
            className="flex-1 items-center justify-center bg-black/50 px-6 dark:bg-black/60"
            style={{ paddingBottom: keyboardHeight }}
          >
            <View className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl dark:bg-slate-900">
              {step === 'verified' ? (
                <>
                  <View className="mb-4 items-center">
                    <View
                      className={`h-16 w-16 items-center justify-center rounded-full ${
                        passwordEmailFailed
                          ? 'bg-amber-100 dark:bg-amber-950'
                          : 'bg-emerald-100 dark:bg-emerald-950'
                      }`}
                    >
                      {passwordEmailFailed ? (
                        <AlertTriangle size={32} color={isDark ? '#FBBF24' : '#D97706'} />
                      ) : (
                        <CheckCircle2 size={32} color={isDark ? '#34D399' : '#059669'} />
                      )}
                    </View>
                  </View>

                  <Text className="text-center text-xl font-bold text-[#16233F] dark:text-slate-100">
                    Email verified
                  </Text>
                  <Text className="mt-2 text-center text-sm leading-6 text-slate-500 dark:text-slate-400">
                    {passwordEmailFailed
                      ? "Your email is verified, but we couldn't send your temporary password. Please contact the Student Affairs Office."
                      : "We've emailed a temporary password to your school ID address. Use it to log in."}
                  </Text>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handleGoToLogin}
                    className={`mt-6 h-12 w-full items-center justify-center rounded-xl ${
                      passwordEmailFailed ? 'bg-[#1b2061] dark:bg-indigo-600' : 'bg-emerald-600'
                    }`}
                  >
                    <Text className="text-sm font-semibold text-white">Go to Login</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text className="text-center text-xl font-bold text-[#16233F] dark:text-slate-100">
                    Verify your email
                  </Text>
                  <Text className="mt-2 text-center text-sm leading-5 text-slate-500 dark:text-slate-400">
                    Enter the {CODE_LENGTH}-digit code sent to {email}.
                  </Text>

                  {!!notice.text && (
                    <View
                      className={`mt-4 rounded-lg border px-3 py-2 ${
                        notice.tone === 'warning'
                          ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950'
                          : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950'
                      }`}
                    >
                      <Text
                        className={`text-xs font-medium text-center ${
                          notice.tone === 'warning'
                            ? 'text-amber-700 dark:text-amber-300'
                            : 'text-emerald-700 dark:text-emerald-300'
                        }`}
                      >
                        {notice.text}
                      </Text>
                    </View>
                  )}

                  {/* Six boxes, one digit each. A single invisible input sits on
                      top of the row and holds the real value, so typing moves
                      to the next box, backspace moves back, and pasting or
                      SMS/email autofill of the whole code still works. */}
                  <View className="mt-4">
                    <View className="flex-row justify-between" pointerEvents="none">
                      {Array.from({ length: CODE_LENGTH }, (_, index) => {
                        const digit = verificationCode[index] || '';
                        const isActive =
                          codeFocused &&
                          !isBusy &&
                          index === Math.min(verificationCode.length, CODE_LENGTH - 1);

                        let boxBorder = 'border-[#d7dbe0] dark:border-slate-700';
                        if (codeError) boxBorder = 'border-[#c0392b] dark:border-rose-500';
                        else if (isActive) boxBorder = 'border-[#1b2061] dark:border-indigo-400';
                        else if (digit) boxBorder = 'border-slate-400 dark:border-slate-500';

                        return (
                          <View
                            key={index}
                            className={`h-[52px] w-[14.5%] items-center justify-center rounded-xl border-2 bg-white dark:bg-slate-800 ${boxBorder}`}
                          >
                            <Text className="text-xl font-bold text-[#16233F] dark:text-slate-100">{digit}</Text>
                          </View>
                        );
                      })}
                    </View>

                    <TextInput
                      ref={codeInputRef}
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
                      value={verificationCode}
                      onChangeText={(text) => {
                        setVerificationCode(text.replace(/\D/g, '').slice(0, CODE_LENGTH));
                        if (codeError) setCodeError('');
                      }}
                      onFocus={() => setCodeFocused(true)}
                      onBlur={() => setCodeFocused(false)}
                      keyboardType="number-pad"
                      textContentType="oneTimeCode"
                      autoComplete="one-time-code"
                      maxLength={CODE_LENGTH}
                      returnKeyType="done"
                      onSubmitEditing={handleVerify}
                      editable={!isBusy}
                      accessibilityLabel={`${CODE_LENGTH}-digit verification code`}
                    />
                  </View>
                  {!!codeError && (
                    <Text className={`mt-1.5 ${ERROR_TEXT} text-xs text-center`}>
                      {codeError}
                    </Text>
                  )}

                  <TouchableOpacity
                    className={`mt-4 h-12 w-full items-center justify-center rounded-xl ${
                      canVerify
                        ? 'bg-[#1b2061] dark:bg-indigo-600'
                        : 'bg-slate-400 dark:bg-slate-700'
                    }`}
                    activeOpacity={0.85}
                    onPress={handleVerify}
                    disabled={!canVerify}
                  >
                    {isBusy ? (
                      <View className="flex-row items-center gap-2">
                        <ActivityIndicator size="small" color="#ffffff" />
                        <Text className="text-sm font-semibold text-white">{busyLabel}</Text>
                      </View>
                    ) : (
                      <Text
                        className={`text-sm font-semibold ${
                          canVerify ? 'text-white' : 'text-white dark:text-slate-400'
                        }`}
                      >
                        Verify & Create Account
                      </Text>
                    )}
                  </TouchableOpacity>

                  <View className="mt-4 flex-row items-center justify-between">
                    <TouchableOpacity
                      onPress={handleBackToForm}
                      activeOpacity={0.7}
                      disabled={isBusy}
                    >
                      <Text className={`${LINK_TEXT} text-xs font-bold`}>← Edit details</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={handleResendCode}
                      activeOpacity={0.7}
                      disabled={isBusy || cooldown > 0}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          cooldown > 0 ? 'text-slate-400 dark:text-slate-500' : LINK_TEXT
                        }`}
                      >
                        {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}