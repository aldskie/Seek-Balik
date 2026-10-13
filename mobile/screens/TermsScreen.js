import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ChevronLeft } from 'lucide-react-native';

import { logoutUser } from '../api/api';
import {
  acceptTerms,
  agreeBeforeRegistering,
  clearRegistrationAgreement,
} from '../hooks/TermsConsent';
import { useConfirmationModal } from '../components/ConfirmationModal';

const NAVY = '#1b2061';

// How close to the end (px) counts as having scrolled through the terms.
const END_THRESHOLD = 24;

// The terms, in display order. `list` items are shown as bullet points;
// `after` is a paragraph shown below the list or the body.
const INTRO =
  'By accessing and using the Seek & Balik Lost and Found Management System, you acknowledge that you have read, understood, and agreed to the following terms and conditions.';

const SECTIONS = [
  {
    title: 'Collection of Personal Information',
    body: 'The system may collect and process personal information necessary for the operation of the Lost and Found Management System. This may include, but is not limited to:',
    list: [
      'Full name',
      'School ID number',
      'Email address',
      'Contact information',
      'Account credentials',
      'Lost or found item information',
      'Claim and surrender records',
      'Information provided during item verification and claiming',
      'Points and leaderboard-related information, when applicable',
    ],
  },
  {
    title: 'Purpose of Data Collection',
    body: 'The information collected will be used only for legitimate purposes related to the operation of the system, including:',
    list: [
      'Creating and managing user accounts',
      'Recording lost and found items',
      'Processing and verifying item claims',
      'Recording surrendered items',
      'Preventing fraudulent or duplicate claims',
      'Tracking claim and surrender transactions',
      "Managing the system's points and leaderboard features",
      'Communicating important information regarding lost and found items',
      'Generating system reports and statistics for authorized school personnel',
    ],
  },
  {
    title: 'Data Privacy and Protection',
    body: 'The system will take reasonable measures to protect collected personal information against unauthorized access, disclosure, alteration, loss, or misuse. Access to personal information will be limited to authorized personnel who require the information to perform their assigned responsibilities.',
  },
  {
    title: 'Data Sharing and Disclosure',
    body: 'Personal information will not be publicly disclosed or shared with unauthorized individuals. Information may only be accessed or disclosed when necessary for legitimate school-related purposes, system administration, verification of claims, or when required or permitted by applicable laws and regulations.',
  },
  {
    title: 'Accuracy of Information',
    body: 'Users are responsible for providing accurate and truthful information. Providing false, misleading, or unauthorized information may result in the restriction or termination of account access and may affect the processing of lost and found claims.',
  },
  {
    title: 'User Responsibility',
    body: 'Users are responsible for keeping their account credentials confidential and for all activities performed through their account. Users must not attempt to access, modify, or obtain information belonging to other users without authorization.',
  },
  {
    title: 'Data Retention',
    body: 'Personal information and transaction records may be retained for as long as necessary to fulfill the purposes for which they were collected, comply with school policies, maintain appropriate records, and satisfy applicable legal or administrative requirements.',
  },
  {
    title: 'User Consent',
    body: 'By selecting "I Agree" and continuing to use the system, you voluntarily consent to the collection, processing, storage, and use of your personal information for the purposes stated above.',
    after:
      'You may contact the appropriate school office or system administrator regarding concerns about the collection or processing of your personal information.',
  },
  {
    title: 'Changes to These Terms',
    body: 'The system administrators may update these Terms and Conditions and Data Privacy Consent when necessary. Users will be informed of significant changes through appropriate system or school announcements.',
  },
];

const CLOSING =
  'By clicking "I Agree," you confirm that you have read and understood these Terms and Conditions and consent to the collection and processing of your personal information for the legitimate purposes of the Seek & Balik Lost and Found Management System.';

const BODY_TEXT = 'text-[13px] leading-5 text-slate-600 dark:text-slate-300';

// One screen, three uses, chosen by the `mode` route param:
//   - 'register': opened from the "Register" link on the login screen, before
//       the registration form. "I Agree" opens the form; "Decline" returns to
//       the login screen. No account exists yet, so the agreement is sent with
//       the sign-up itself.
//   - 'consent': shown after login to an account that has not agreed yet
//       (created by staff, or the terms changed). "Decline" signs out.
//       params: { mode: 'consent', routes }
//       (`routes` = the navigation routes to continue to after agreeing,
//       e.g. [{ name: 'Main', params: { user } }])
//   - 'view' (default): opened from Profile to reread the terms. Has a back
//       button and no "I Agree".
export default function TermsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute();

  const mode = route.params?.mode;
  const isRegister = mode === 'register';
  const isConsent = mode === 'consent';
  // Both of these ask for agreement and show the two buttons.
  const asksForAgreement = isRegister || isConsent;
  // Where to continue after "I Agree". The last route is the one shown.
  const nextRoutes =
    Array.isArray(route.params?.routes) && route.params.routes.length > 0
      ? route.params.routes
      : [{ name: 'Main' }];

  const { confirmationModal, showConfirm, showFeedback } = useConfirmationModal();

  // "I Agree" unlocks once the user has scrolled to the end of the terms.
  const [reachedEnd, setReachedEnd] = useState(false);
  const [saving, setSaving] = useState(false);

  const viewportHeightRef = useRef(0);
  const contentHeightRef = useRef(0);

  // Covers a screen tall enough to show everything without scrolling.
  const checkFitsWithoutScrolling = () => {
    const viewport = viewportHeightRef.current;
    const content = contentHeightRef.current;
    if (viewport > 0 && content > 0 && content <= viewport + END_THRESHOLD) {
      setReachedEnd(true);
    }
  };

  const handleScroll = ({ nativeEvent }) => {
    const { contentOffset, layoutMeasurement, contentSize } = nativeEvent;
    if (contentOffset.y + layoutMeasurement.height >= contentSize.height - END_THRESHOLD) {
      setReachedEnd(true);
    }
  };

  const handleAgree = async () => {
    if (saving) return;

    // Registering: remember the agreement and open the registration form.
    if (isRegister) {
      agreeBeforeRegistering();
      navigation.replace('Register');
      return;
    }

    setSaving(true);

    try {
      // Saved on the account by the backend, so it is remembered on any phone.
      await acceptTerms();
      navigation.reset({ index: nextRoutes.length - 1, routes: nextRoutes });
    } catch (err) {
      setSaving(false);

      // The session ended: the app is already going to the login screen.
      if (err?.sessionExpired) return;

      showFeedback({
        title: 'Could not save',
        message:
          err?.response?.data?.error ||
          'Your agreement was not saved. Please check your connection and try again.',
        tone: 'error',
      });
    }
  };

  // After login, declining means the app can't be used, so the user is signed
  // back out.
  const handleDecline = () => {
    // Registering: nobody is signed in, so just return to the login screen.
    if (isRegister) {
      clearRegistrationAgreement();
      navigation.replace('Login');
      return;
    }

    showConfirm({
      title: 'Decline and sign out?',
      message:
        'You need to agree to the Terms and Data Privacy Consent to use Seek & Balik. Declining will sign you out.',
      confirmLabel: 'Decline',
      destructive: true,
      onConfirm: async () => {
        try {
          await logoutUser();
        } catch (err) {
          // Even if the request fails, leave the app's signed-in area.
        }
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      },
    });
  };

  const agreeDisabled = !reachedEnd || saving;

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <StatusBar style="light" backgroundColor={NAVY} translucent={false} />

      <SafeAreaView edges={['top']} className="rounded-b-3xl bg-[#1b2061]">
        <View className="flex-row items-center px-4 pb-6 pt-2">
          {!isConsent && (
            <TouchableOpacity
              onPress={isRegister ? handleDecline : () => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="Back"
              className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-white/15"
            >
              <ChevronLeft size={20} color="#FFFFFF" />
            </TouchableOpacity>
          )}

          <View className="flex-1">
            <Text className="text-[12px] font-bold tracking-widest text-white/60">
              SEEK AND BALIK
            </Text>
            <Text className="text-2xl font-bold text-white">
              Terms & Privacy
            </Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onLayout={(event) => {
          viewportHeightRef.current = event.nativeEvent.layout.height;
          checkFitsWithoutScrolling();
        }}
        onContentSizeChange={(width, height) => {
          contentHeightRef.current = height;
          checkFitsWithoutScrolling();
        }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 20,
          paddingBottom: asksForAgreement ? 16 : insets.bottom + 24,
        }}
      >
        <View
          // Same outlined card as the Profile screen.
          className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <Text className="text-base font-bold leading-6 text-[#16233F] dark:text-slate-100">
            Terms and Conditions and Data Privacy Consent
          </Text>

          <Text className={`mt-3 ${BODY_TEXT}`}>{INTRO}</Text>

          {SECTIONS.map((section, index) => (
            <View key={section.title} className="mt-5">
              <Text className="text-sm font-bold text-[#16233F] dark:text-slate-100">
                {index + 1}. {section.title}
              </Text>

              <Text className={`mt-2 ${BODY_TEXT}`}>{section.body}</Text>

              {section.list && (
                <View className="mt-2">
                  {section.list.map((item) => (
                    <View key={item} className="mt-1.5 flex-row">
                      <View className="mr-3 mt-2 h-1.5 w-1.5 rounded-full bg-[#1b2061] dark:bg-indigo-400" />
                      <Text className={`flex-1 ${BODY_TEXT}`}>{item}</Text>
                    </View>
                  ))}
                </View>
              )}

              {section.after && (
                <Text className={`mt-3 ${BODY_TEXT}`}>{section.after}</Text>
              )}
            </View>
          ))}

          <View className="mt-5 rounded-xl bg-slate-100 p-3.5 dark:bg-slate-800">
            <Text className="text-[13px] font-medium leading-5 text-[#1b2061] dark:text-indigo-100">
              {CLOSING}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Agreement actions, pinned to the bottom so they are always in view. */}
      {asksForAgreement && (
        <View
          className="border-t border-slate-200 bg-white px-4 pt-3 dark:border-slate-800 dark:bg-slate-900"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          {!reachedEnd && (
            <Text className="mb-2.5 text-center text-xs text-slate-500 dark:text-slate-400">
              Scroll to the end to continue.
            </Text>
          )}

          <View className="flex-row items-center gap-3">
            <TouchableOpacity
              onPress={handleDecline}
              disabled={saving}
              accessibilityRole="button"
              className={`h-12 flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800 ${
                saving ? 'opacity-50' : ''
              }`}
            >
              <Text className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Decline
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleAgree}
              disabled={agreeDisabled}
              accessibilityRole="button"
              accessibilityState={{ disabled: agreeDisabled }}
              className={`h-12 flex-[2] items-center justify-center rounded-xl bg-[#1b2061] dark:bg-indigo-600 ${
                agreeDisabled ? 'opacity-50' : ''
              }`}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="text-sm font-bold text-white">I Agree</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}

      {confirmationModal}
    </View>
  );
}