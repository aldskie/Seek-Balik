import React, { useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ClipboardCheck,
  Clock,
  Info,
  Key,
  LifeBuoy,
  MapPin,
  Package,
  Search,
  ShieldCheck,
  Trophy,
  X,
} from 'lucide-react-native';

import { useAppearance } from '../hooks/Appearance';

const NAVY = '#1b2061';
const TEAL = '#0E7895';
const MUTED = '#9AA3B5';
// Teal used for icons in dark mode, where the darker teal is hard to see.
const TEAL_ON_DARK = '#67E8F9';

// Class strings reused below, each with its light and dark colors.
const SECTION_BAR = 'mr-2 h-4 w-1 rounded-full bg-[#1b2061] dark:bg-indigo-500';
const SECTION_TITLE = 'text-sm font-bold text-[#16233F] dark:text-slate-100';
const CARD = 'border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900';
const TEAL_TILE = 'h-10 w-10 items-center justify-center rounded-xl bg-[#E6F4FB] dark:bg-cyan-950';
const TEAL_TEXT = 'text-[#0E7895] dark:text-cyan-300';

// Same content as the web Help Center (HelpCenter.jsx). `Icon` is the icon
// component, drawn by the screen in the right color for the appearance.
const FAQ_DATA = [
  {
    category: 'Getting Started',
    Icon: Info,
    description: 'Learn the basics of using Seek & Balik.',
    questions: [
      {
        id: 'what-is-seek-balik',
        q: 'What is Seek & Balik?',
        a: 'Seek & Balik is the Lost and Found Management System of Saint Louis College. It provides a centralized platform for reporting lost items, surrendering found items, submitting claims, and tracking Lost & Found activities.',
      },
      {
        id: 'who-can-use',
        q: 'Who can use Seek & Balik?',
        a: 'Students and employees authorized to use the Saint Louis College system can access the available features. Administrators and moderators are responsible for managing reports, items, and claims.',
      },
      {
        id: 'need-account',
        q: 'Do I need an account?',
        a: 'Yes. An account is required for features such as submitting reports, claiming items, and tracking your Lost & Found activity.',
      },
    ],
  },
  {
    category: 'Registration & Login',
    Icon: Key,
    description: 'Problems with your account or signing in?',
    questions: [
      {
        id: 'register',
        q: 'How do I register?',
        a: 'Select Register from the login page and provide the required school information. Use your official Saint Louis College email when requested.',
      },
      {
        id: 'temporary-password',
        q: 'Why did I receive a temporary password?',
        a: 'Newly created accounts may receive a temporary password through email. Use it to log in, then change your password when prompted.',
      },
      {
        id: 'forgot-password',
        q: 'I forgot my password. What should I do?',
        a: 'Contact the Student Affairs Office or an authorized system administrator for assistance with resetting your account.',
      },
      {
        id: 'cannot-login',
        q: "Why can't I log in?",
        a: 'Make sure you are using the correct school email and password. Also check your internet connection and account status. If you still cannot log in, contact an administrator.',
      },
    ],
  },
  {
    category: 'Lost Items',
    Icon: Package,
    description: "Everything about reporting something you've lost.",
    questions: [
      {
        id: 'report-lost',
        q: 'How do I report a lost item?',
        a: 'Log in to Seek & Balik, select Report a Lost Item, provide the required information about your item, and submit the report for review.',
      },
      {
        id: 'multiple-lost',
        q: 'Can I report multiple lost items?',
        a: 'Yes. Each lost item should have its own report so that every item can be properly identified and processed.',
      },
      {
        id: 'edit-lost',
        q: 'Can I edit my report after submitting it?',
        a: 'If the system does not provide an editing option after submission, contact Student Affairs or an authorized administrator if you need to correct important information.',
      },
      {
        id: 'lost-status',
        q: 'What happens after I submit a lost item report?',
        a: 'Your report is submitted for review. Its status may change as authorized staff process the report and as new information becomes available.',
      },
    ],
  },
  {
    category: 'Found & Surrendered Items',
    Icon: Package,
    description: 'Learn how found belongings are submitted and processed.',
    questions: [
      {
        id: 'surrender',
        q: 'How do I surrender a found item?',
        a: 'Use the appropriate surrender or found-item process in the system and provide accurate information about the item. The item will then be processed by authorized staff.',
      },
      {
        id: 'surrender-information',
        q: 'What information should I provide about a found item?',
        a: "Provide accurate information such as the item's description, where it was found, when it was found, and any other details requested by the system.",
      },
      {
        id: 'after-surrender',
        q: 'What happens after I surrender an item?',
        a: 'The surrendered item is reviewed and processed by authorized staff. Once approved for listing, it may become available for users to view and potentially claim.',
      },
    ],
  },
  {
    category: 'Claims',
    Icon: ClipboardCheck,
    description: 'Learn how to verify ownership and claim an item.',
    questions: [
      {
        id: 'claim',
        q: 'How do I claim a surrendered item?',
        a: 'Open the surrendered item, select Claim, provide the requested ownership verification information, and submit your claim request.',
      },
      {
        id: 'verification',
        q: 'Why do I need to answer verification questions?',
        a: 'Verification questions help staff determine whether the claimant can provide enough information to establish ownership of the item.',
      },
      {
        id: 'multiple-claims',
        q: 'Can I submit multiple claims for the same item?',
        a: 'Only one claim request should be submitted for the same surrendered item. Make sure your information is accurate before submitting.',
      },
      {
        id: 'meeting',
        q: 'Where is the verification meeting held?',
        a: 'Verification meetings are handled through the Student Affairs Office according to the schedule provided by the system or authorized staff.',
      },
      {
        id: 'approved-claim',
        q: 'What happens when my claim is approved?',
        a: 'You will receive instructions regarding the next steps for verification and item release. Follow the instructions provided by Student Affairs or authorized staff.',
      },
      {
        id: 'rejected-claim',
        q: 'What happens when my claim is rejected?',
        a: 'A rejected claim means the submitted information was not sufficient to verify ownership. Contact Student Affairs if you need clarification regarding the decision.',
      },
    ],
  },
  {
    category: 'Tracking',
    Icon: Search,
    description: 'Check the status of your submitted reports and claims.',
    questions: [
      {
        id: 'track',
        q: 'How do I track my report?',
        a: 'Use the Track Item feature and provide the information requested by the system to view the status of your submitted Lost & Found activity.',
      },
      {
        id: 'statuses',
        q: 'What do the different statuses mean?',
        a: 'Statuses indicate the current stage of processing. Depending on the process, a report may be Pending, Approved, Claimed, or Rejected.',
      },
      {
        id: 'pending',
        q: 'Why is my report still pending?',
        a: 'Pending means your report is still waiting for review or processing by authorized staff. Processing time may vary depending on the report.',
      },
    ],
  },
  {
    category: 'Leaderboard & Points',
    Icon: Trophy,
    description: 'Understand the Honest Finders Leaderboard.',
    questions: [
      {
        id: 'leaderboard',
        q: 'How does the Honest Finders Leaderboard work?',
        a: 'The Honest Finders Leaderboard ranks users based on points earned through eligible Lost & Found activities such as successful item surrender and verified claims.',
      },
      {
        id: 'points',
        q: 'How are points earned?',
        a: 'Points are awarded according to the rules configured by system administrators for eligible Lost & Found activities.',
      },
      {
        id: 'ranking',
        q: "Why can't I see the leaderboard?",
        a: 'The leaderboard may be disabled by an administrator. When it is inactive, rankings and related points may not be displayed.',
      },
    ],
  },
  {
    category: 'Privacy & Security',
    Icon: ShieldCheck,
    description: 'Learn how your account and personal information are protected.',
    questions: [
      {
        id: 'personal-info',
        q: 'Who can see my personal information?',
        a: 'Personal information should only be accessible to authorized personnel who need it to manage reports, claims, and other system processes.',
      },
      {
        id: 'contact-info',
        q: 'Can other students see my contact information?',
        a: 'Private claimant and account information should not be publicly displayed to other users.',
      },
      {
        id: 'account-security',
        q: 'How can I keep my account secure?',
        a: 'Keep your password private, never share your account, and change your password if you believe someone else may have access to it.',
      },
    ],
  },
];

// Quick actions: each one opens the matching FAQ answer directly.
const POPULAR_HELP = [
  { id: 'claim', label: 'Claim an item', Icon: ClipboardCheck },
  { id: 'report-lost', label: 'Report a lost item', Icon: Package },
  { id: 'forgot-password', label: 'Forgot my password', Icon: Key },
  { id: 'track', label: 'Track my report', Icon: Search },
];

const CATEGORY_FILTERS = ['All', ...FAQ_DATA.map((section) => section.category)];

export default function HelpCenterScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const scrollRef = useRef(null);

  // Icon and placeholder colors follow the app's Light / Dark appearance.
  const { isDark } = useAppearance();
  const tealIcon = isDark ? TEAL_ON_DARK : TEAL;
  const mutedIcon = isDark ? '#64748B' : MUTED;

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [openId, setOpenId] = useState(null);
  const [showTop, setShowTop] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const normalizedSearch = search.trim().toLowerCase();
  const isFiltering = Boolean(normalizedSearch) || category !== 'All';

  const totalQuestions = FAQ_DATA.reduce((sum, section) => sum + section.questions.length, 0);

  // Category chip + search box work together: the chip narrows the topic,
  // the search box narrows the questions inside it.
  const results = useMemo(
    () =>
      FAQ_DATA.filter((section) => category === 'All' || section.category === category)
        .map((section) => ({
          ...section,
          questions: section.questions.filter(
            (item) =>
              !normalizedSearch ||
              `${section.category} ${section.description} ${item.q} ${item.a}`
                .toLowerCase()
                .includes(normalizedSearch)
          ),
        }))
        .filter((section) => section.questions.length > 0),
    [category, normalizedSearch]
  );

  const resultCount = results.reduce((sum, section) => sum + section.questions.length, 0);

  const toggleQuestion = (id) => setOpenId((current) => (current === id ? null : id));

  const clearAll = () => {
    setSearch('');
    setCategory('All');
    setOpenId(null);
  };

  const selectCategory = (value) => {
    setCategory(value);
    setOpenId(null);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  // Fills the search box with the exact question and opens its answer.
  const openPopular = (id) => {
    const target = FAQ_DATA.flatMap((section) => section.questions).find((item) => item.id === id);

    Keyboard.dismiss();
    setCategory('All');
    setSearch(target ? target.q : '');
    setOpenId(id);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  const scrollToTop = () => scrollRef.current?.scrollTo({ y: 0, animated: true });

  const handleScroll = (event) => setShowTop(event.nativeEvent.contentOffset.y > 320);

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <StatusBar style="light" backgroundColor={NAVY} translucent={false} />

      {/* HEADER — stays fixed; only the content below scrolls */}
      <SafeAreaView edges={['top']} className="rounded-b-3xl bg-[#1b2061]">
        <View className="px-4 pb-6 pt-2">
          <View className="flex-row items-center">
            <TouchableOpacity
              activeOpacity={0.6}
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-white/10"
            >
              <ChevronLeft size={22} color="#FFFFFF" />
            </TouchableOpacity>

            <View className="flex-1">
              <Text className="text-[12px] font-bold tracking-widest text-white/60">SUPPORT</Text>
              <Text className="text-2xl font-bold text-white">Help Center</Text>
            </View>

            <View className="h-10 w-10 items-center justify-center rounded-full bg-white/10">
              <LifeBuoy size={20} color="#FFFFFF" />
            </View>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        ref={scrollRef}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 32,
        }}
      >
        {/* SEARCH — first child, pinned under the header while scrolling.
            Same bordered input used on the Items screen. */}
        <View className="bg-slate-50 pb-3 pt-4 dark:bg-slate-950">
          <View
            className={`flex-row items-center rounded-lg border bg-white px-3 dark:bg-slate-900 ${
              searchFocused
                ? 'border-[#1b2061] dark:border-indigo-400'
                : 'border-slate-300 dark:border-slate-700'
            }`}
          >
            <Search
              size={16}
              color={
                searchFocused
                  ? isDark
                    ? '#C7D2FE'
                    : NAVY
                  : isDark
                    ? '#94A3B8'
                    : '#5B647A'
              }
            />

            <TextInput
              value={search}
              onChangeText={(value) => {
                setSearch(value);
                setOpenId(null);
              }}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Search claims, passwords, tracking..."
              placeholderTextColor={isDark ? '#64748B' : '#9AA3B5'}
              returnKeyType="search"
              className="ml-2 h-11 flex-1 text-sm text-[#16233F] dark:text-slate-100"
            />

            {search ? (
              <TouchableOpacity
                activeOpacity={0.6}
                onPress={clearAll}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                className="h-6 w-6 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"
              >
                <X size={13} color={isDark ? '#94A3B8' : '#64748B'} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* POPULAR HELP — landing view only */}
        {!isFiltering ? (
          <View className="mb-5">
            <View className="mb-3 flex-row items-center">
              <View className={SECTION_BAR} />
              <Text className={SECTION_TITLE}>Popular help</Text>
            </View>

            <View className="flex-row flex-wrap justify-between">
              {POPULAR_HELP.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.7}
                  onPress={() => openPopular(item.id)}
                  className={`mb-3 w-[48.5%] rounded-2xl p-3.5 ${CARD}`}
                >
                  <View className={TEAL_TILE}>
                    <item.Icon size={20} color={tealIcon} />
                  </View>
                  <Text className="mt-3 text-[13px] font-bold leading-5 text-[#16233F] dark:text-slate-100">
                    {item.label}
                  </Text>
                  <Text className={`mt-1 text-[11px] font-semibold ${TEAL_TEXT}`}>See answer</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        {/* TOPIC CHIPS */}
        <View className="mb-3 flex-row items-center">
          <View className={SECTION_BAR} />
          <Text className={SECTION_TITLE}>Browse by topic</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          className="-mx-4 mb-4 flex-grow-0"
          contentContainerStyle={{ paddingHorizontal: 16 }}
        >
          {CATEGORY_FILTERS.map((name) => (
            <TouchableOpacity
              key={name}
              activeOpacity={0.7}
              onPress={() => selectCategory(name)}
              accessibilityRole="button"
              accessibilityState={{ selected: category === name }}
              className={`mr-2 rounded-full border px-4 py-2 ${
                category === name
                  ? 'border-[#1b2061] bg-[#1b2061] dark:border-indigo-600 dark:bg-indigo-600'
                  : 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900'
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  category === name ? 'text-white' : 'text-slate-500 dark:text-slate-300'
                }`}
              >
                {name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* RESULT SUMMARY */}
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-xs font-semibold text-slate-400">
            {isFiltering
              ? `${resultCount} ${resultCount === 1 ? 'answer' : 'answers'} found`
              : `${FAQ_DATA.length} topics · ${totalQuestions} answers`}
          </Text>

          {isFiltering ? (
            <TouchableOpacity activeOpacity={0.6} onPress={clearAll}>
              <Text className={`text-xs font-bold ${TEAL_TEXT}`}>Clear filters</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* EMPTY STATE */}
        {results.length === 0 ? (
          <View className="mb-4 items-center rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 dark:border-slate-700 dark:bg-slate-900">
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
              <Search size={24} color={mutedIcon} />
            </View>

            <Text className="mt-4 text-base font-bold text-[#16233F] dark:text-slate-100">No answers found</Text>

            <Text className="mt-1.5 text-center text-xs leading-5 text-slate-500 dark:text-slate-400">
              We couldn't find anything matching your search. Try a keyword such as "claim",
              "password", "lost", or "track".
            </Text>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={clearAll}
              className="mt-5 rounded-xl bg-[#1b2061] px-5 py-3 dark:bg-indigo-600"
            >
              <Text className="text-xs font-bold text-white">Show all FAQs</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* FAQ SECTIONS */}
        {results.map((section) => (
          <View
            key={section.category}
            className={`mb-4 overflow-hidden rounded-2xl ${CARD}`}
          >
            <View className="flex-row items-center border-b border-slate-100 px-4 py-3.5 dark:border-slate-800">
              <View className={TEAL_TILE}>
                <section.Icon size={18} color={tealIcon} />
              </View>

              <View className="ml-3 flex-1">
                <Text className="text-sm font-bold text-[#16233F] dark:text-slate-100">{section.category}</Text>
                <Text className="mt-0.5 text-[11px] leading-4 text-slate-400">
                  {section.description}
                </Text>
              </View>

              <View className="ml-2 rounded-full bg-slate-100 px-2.5 py-1 dark:bg-slate-800">
                <Text className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  {section.questions.length}
                </Text>
              </View>
            </View>

            {section.questions.map((item, index) => (
              <View
                key={item.id}
                className={index > 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''}
              >
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => toggleQuestion(item.id)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: openId === item.id }}
                  className="flex-row items-center justify-between px-4 py-3.5"
                >
                  <Text
                    className={`mr-3 flex-1 text-[13px] font-semibold leading-5 ${
                      openId === item.id ? TEAL_TEXT : 'text-[#16233F] dark:text-slate-100'
                    }`}
                  >
                    {item.q}
                  </Text>

                  <View
                    className={`h-7 w-7 items-center justify-center rounded-lg ${
                      openId === item.id
                        ? 'bg-[#1b2061] dark:bg-indigo-600'
                        : 'bg-slate-100 dark:bg-slate-800'
                    }`}
                  >
                    {openId === item.id ? (
                      <ChevronUp size={14} color="#FFFFFF" />
                    ) : (
                      <ChevronDown size={14} color={mutedIcon} />
                    )}
                  </View>
                </TouchableOpacity>

                {openId === item.id ? (
                  <View className="px-4 pb-4">
                    <View className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
                      <Text className="text-[13px] leading-6 text-slate-600 dark:text-slate-300">{item.a}</Text>
                    </View>
                  </View>
                ) : null}
              </View>
            ))}
          </View>
        ))}

        {/* CONTACT CARD */}
        <View className="mt-2 overflow-hidden rounded-2xl bg-[#1b2061] p-5 dark:bg-indigo-900">
          <Text className="text-[11px] font-bold tracking-widest text-white/60">
            STILL NEED HELP?
          </Text>
          <Text className="mt-1 text-lg font-bold text-white">Can't find your answer?</Text>
          <Text className="mt-1.5 text-xs leading-5 text-white/80">
            Contact the Student Affairs Office or an authorized system administrator.
          </Text>

          <View className="mt-4 rounded-xl bg-white/10 p-3.5">
            <View className="flex-row items-center">
              <MapPin size={15} color="#FFFFFF" />
              <Text className="ml-2 text-xs font-bold text-white">Student Affairs Office</Text>
            </View>

            <View className="mt-3 flex-row items-start">
              <Clock size={15} color="#FFFFFF" />
              <View className="ml-2 flex-1">
                <Text className="text-xs text-white/85">Monday–Friday, 8:00 AM–5:00 PM</Text>
                <Text className="mt-0.5 text-xs text-white/85">Saturday, 8:00 AM–12:00 PM</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* BACK TO TOP */}
      {showTop ? (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={scrollToTop}
          accessibilityRole="button"
          accessibilityLabel="Back to top"
          style={{ bottom: insets.bottom + 16 }}
          className="absolute right-4 h-12 w-12 items-center justify-center rounded-full bg-[#1b2061] shadow-lg dark:bg-indigo-600"
        >
          <ArrowUp size={20} color="#FFFFFF" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}