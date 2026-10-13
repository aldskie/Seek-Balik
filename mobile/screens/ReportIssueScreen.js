import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, MessageSquareWarning } from 'lucide-react-native';

import { submitIssueReport } from '../api/api';
import { useTabBarVisibility } from '../hooks/TabBarVisibility';
import { useAppearance } from '../hooks/Appearance';
import { useConfirmationModal } from '../components/ConfirmationModal';

const NAVY = '#1b2061';
const MUTED = '#9AA3B5';

// Class strings reused below, each with its light and dark colors.
const FIELD_LABEL = 'mb-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400';
const FIELD_INPUT =
  'rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm text-[#16233F] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

// Must match IssueReport.CATEGORY_CHOICES in the backend (report_issue
// app). "listing" was not one of them, so a report sent with "Lost Item
// Listing" was rejected. Labels are the backend's own display names.
const CATEGORY_OPTIONS = [
  { label: 'Bug / Error', value: 'bug' },
  { label: 'Account', value: 'account' },
  { label: 'Item Post', value: 'item_post' },
  { label: 'Claim', value: 'claim' },
  { label: 'Suggestion', value: 'suggestion' },
  { label: 'Other', value: 'other' },
];

// IssueReport.subject is max_length=150 in the backend.
const SUBJECT_MAX_LENGTH = 150;

export default function ReportIssueScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { handleScroll } = useTabBarVisibility();
  const { confirmationModal, showFeedback } = useConfirmationModal();

  // Icon, spinner, and placeholder colors follow the app's appearance.
  const { isDark } = useAppearance();
  const placeholderColor = isDark ? '#64748B' : MUTED;

  const [category, setCategory] = useState(CATEGORY_OPTIONS[0].value);
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = subject.trim().length > 0 && description.trim().length > 0 && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setIsSubmitting(true);

    try {
      await submitIssueReport({
        category,
        subject: subject.trim(),
        description: description.trim(),
      });

      setSubject('');
      setDescription('');
      setCategory(CATEGORY_OPTIONS[0].value);

      setIsSubmitting(false);

      showFeedback({
        title: 'Report sent',
        message: "Thanks — we'll take a look and follow up if we need more info.",
        tone: 'success',
        confirmLabel: 'OK',
        onClose: () => navigation.goBack(),
      });
    } catch (error) {
      let message = 'We could not send your report. Please check your connection and try again.';

      if (error.response?.data?.error) {
        message = error.response.data.error;
      } else if (error.response?.data?.category?.[0]) {
        message = error.response.data.category[0];
      } else if (error.response?.data?.subject?.[0]) {
        message = error.response.data.subject[0];
      } else if (error.response?.data?.description?.[0]) {
        message = error.response.data.description[0];
      } else if (error.response?.data?.detail) {
        message = error.response.data.detail;
      } else if (error.code === 'ECONNABORTED') {
        message = 'The server took too long to respond.';
      } else if (error.message === 'Network Error') {
        message = 'Cannot reach the server. Check the API address and Wi-Fi connection.';
      }

      setIsSubmitting(false);

      showFeedback({
        title: 'Report failed',
        message,
        tone: 'error',
        confirmLabel: 'OK',
        onClose: () => setIsSubmitting(false),
      });
    } finally {
      // Guarantees the loader stops for success, errors, and navigation failures.
      setIsSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <StatusBar style="light" backgroundColor={NAVY} translucent={false} />

      <SafeAreaView edges={['top']} className="rounded-b-3xl bg-[#1b2061]">
        <View className="flex-row items-center px-4 pb-6 pt-2">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            className="mr-3 h-8 w-8 items-center justify-center rounded-full bg-white/10"
            disabled={isSubmitting}
          >
            <ChevronLeft size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <View>
            <Text className="text-[12px] font-bold tracking-widest text-white/60">SEEK AND BALIK</Text>
            <Text className="text-2xl font-bold text-white">Report an Issue</Text>
          </View>
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          className="flex-1"
          onScroll={handleScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: insets.bottom + 24 }}
          showsVerticalScrollIndicator={false}
        >
          <View className="mb-5 flex-row items-center rounded-2xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-950">
            <View className="mr-3 h-8 w-8 items-center justify-center rounded-lg bg-rose-100 dark:bg-rose-900">
              <MessageSquareWarning size={18} color={isDark ? '#FDA4AF' : '#E11D48'} />
            </View>
            <Text className="flex-1 text-xs text-rose-700 dark:text-rose-300">
              Found a bug, a problem with your account, or something that doesn't look right? Let us know below.
            </Text>
          </View>

          <Text className={FIELD_LABEL}>Category</Text>
          <View className="mb-5 flex-row flex-wrap gap-2">
            {CATEGORY_OPTIONS.map((option) => {
              const selected = option.value === category;
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => setCategory(option.value)}
                  disabled={isSubmitting}
                  className={`rounded-full border px-3.5 py-2 ${
                    selected
                      ? 'border-[#1b2061] bg-[#1b2061] dark:border-indigo-600 dark:bg-indigo-600'
                      : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      selected ? 'text-white' : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text className={FIELD_LABEL}>Subject</Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="Short summary of the issue"
            placeholderTextColor={placeholderColor}
            maxLength={SUBJECT_MAX_LENGTH}
            editable={!isSubmitting}
            className={`mb-5 ${FIELD_INPUT}`}
          />

          <Text className={FIELD_LABEL}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Tell us what happened, and what you expected instead"
            placeholderTextColor={placeholderColor}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            editable={!isSubmitting}
            className={`mb-2 h-36 ${FIELD_INPUT}`}
          />
          <Text className="mb-5 text-right text-[10px] text-slate-400">{description.length} characters</Text>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit}
            className={`h-12 items-center justify-center rounded-xl ${
              canSubmit ? 'bg-[#1b2061] dark:bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <Text
              className={`text-sm font-bold ${
                canSubmit ? 'text-white' : 'text-white dark:text-slate-400'
              }`}
            >
              Submit Report
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {isSubmitting && (
        <View
          className="absolute inset-0 items-center justify-center bg-[#1b2061]/45 dark:bg-black/60"
          pointerEvents="auto"
        >
          <View className="w-[78%] items-center rounded-2xl bg-white px-6 py-7 shadow-lg dark:bg-slate-900">
            <ActivityIndicator size="large" color={isDark ? '#C7D2FE' : '#1b2061'} />
            <Text className="mt-4 text-center text-base font-bold text-[#1b2061] dark:text-slate-100">
              Sending your report...
            </Text>
            <Text className="mt-1 text-center text-sm text-[#666] dark:text-slate-400">
              Please wait while we submit the details.
            </Text>
          </View>
        </View>
      )}

      {confirmationModal}
    </View>
  );
}