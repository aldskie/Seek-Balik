import React, { useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  PackageSearch,
  Search,
  Ticket,
  X,
} from 'lucide-react-native';

import { useAppearance } from '../hooks/Appearance';

const NAVY = '#1b2061';
const MUTED = '#9AA3B5';
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Matches MySubmissionsScreen.STATUS_STYLES — kept as its own copy here
// since this modal is meant to be a self-contained, reusable component
// rather than depending on the screen that opens it.
const STATUS_STYLES = {
  Pending: {
    bg: 'bg-orange-50 dark:bg-orange-950',
    text: 'text-orange-700 dark:text-orange-300',
  },
  Approved: {
    bg: 'bg-green-50 dark:bg-green-950',
    text: 'text-green-700 dark:text-green-300',
  },
  Claimed: {
    bg: 'bg-purple-50 dark:bg-purple-950',
    text: 'text-purple-700 dark:text-purple-300',
  },
  Archived: {
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-600 dark:text-slate-300',
  },
  Declined: {
    bg: 'bg-red-50 dark:bg-red-950',
    text: 'text-red-700 dark:text-red-300',
  },
};

// Plain-language line under the status pill, written from the finder's/
// loser's point of view rather than the system's internal state names.
const STATUS_HELPER_TEXT = {
  Pending: 'The Lost & Found desk is reviewing this submission.',
  Approved: 'This has been verified and is ready at the desk.',
  Claimed: 'This item has been claimed by its owner.',
  Archived: 'This submission is no longer active.',
  Declined: 'This submission was declined. See the reason below.',
};

const formatDate = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return String(value);

  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

// When the item was lost or found. The backend stores a range: start_date
// ("From") and the optional end_date ("To"). The older created_* names are
// still read as a fallback. Returns "October 3, 2026 – October 5, 2026" for
// a range, a single date otherwise, or '' when there is no date at all.
const getDateRangeLabel = (item) => {
  const dateFrom = item.start_date || item.created_date;
  const dateTo = item.end_date || item.created_date_to;

  if (!dateFrom) return '';

  return dateTo && dateTo !== dateFrom
    ? `${formatDate(dateFrom)} – ${formatDate(dateTo)}`
    : formatDate(dateFrom);
};

// Collects every photo URL for an item, using the same sources as the card
// in MySubmissionsScreen: the `images` list first, then the single `image`
// field as a fallback. List entries may be objects ({ image: url }) or plain
// URL strings.
const getItemImages = (item) => {
  if (!item) return [];

  const fromList = Array.isArray(item.images)
    ? item.images
        .map((entry) => (typeof entry === 'string' ? entry : entry?.image))
        .filter(Boolean)
    : [];

  if (fromList.length > 0) return fromList;

  return item.image ? [item.image] : [];
};

// Single component, single function, single return statement — the detail
// sheet and the full-screen image viewer are both rendered inline as
// sibling Modals inside the one JSX tree below, rather than split into
// separate sub-components.
export default function ItemDetailModal({ visible, item, onClose }) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerStartIndex, setViewerStartIndex] = useState(0);
  const [viewerActiveIndex, setViewerActiveIndex] = useState(0);
  const viewerScrollRef = useRef(null);

  // Icon colors follow the app's Light / Dark appearance.
  const { isDark } = useAppearance();
  const navyIcon = isDark ? '#C7D2FE' : NAVY;
  const mutedIcon = isDark ? '#94A3B8' : MUTED;

  const statusStyle = item ? STATUS_STYLES[item.status] || STATUS_STYLES.Pending : null;
  const images = getItemImages(item);
  const hasImages = images.length > 0;
  const isLost = item?.type === 'Lost';

  const openViewerAt = (index) => {
    setViewerStartIndex(index);
    setViewerActiveIndex(index);
    setViewerOpen(true);
  };

  const handleViewerScrollEnd = (event) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setViewerActiveIndex(next);
  };

  const closeViewer = () => setViewerOpen(false);

  const detailRows = item
    ? [
        { icon: <MapPin size={16} color={mutedIcon} />, label: 'Location', value: item.location },
        {
          icon: <CalendarDays size={16} color={mutedIcon} />,
          label: 'Date submitted',
          value: getDateRangeLabel(item),
        },
        { icon: <Ticket size={16} color={mutedIcon} />, label: 'Ticket code', value: item.ticket_code },
      ]
    : [];

  return item ? (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop fills the screen so content behind is dimmed, but the
          sheet itself only takes up as much height as its content needs
          (capped at 85% of the screen) — this is a compact bottom sheet,
          not a full-page modal. Tapping the dimmed area dismisses it. */}
      <View className="flex-1 justify-end bg-black/40 dark:bg-black/60">
        <TouchableWithoutFeedback onPress={onClose}>
          <View className="absolute inset-0" />
        </TouchableWithoutFeedback>

        <SafeAreaView
          edges={['bottom']}
          className="rounded-t-3xl bg-white dark:bg-slate-900"
          style={{ maxHeight: SCREEN_HEIGHT * 0.85 }}
        >
          {/* Drag-handle bar signals "this can be dismissed" even without
              gesture support wired up, and a small header keeps an
              always-visible close target. */}
          <View className="items-center pb-1 pt-3">
            <View className="h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />
          </View>

          <View className="flex-row items-center justify-between px-5 pb-3">
            <Text className="text-base font-bold text-[#16233F] dark:text-slate-100">Item Details</Text>

            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              className="h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800"
            >
              <X size={16} color={navyIcon} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 24 }}
          >
            {/* Photos: a compact horizontal row of tappable thumbnails
                rather than a full-width hero, so the sheet stays short.
                Tapping one opens the full-screen viewer below. */}
            <View className="px-5">
              {hasImages ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 10 }}
                >
                  {images.map((uri, index) => (
                    <TouchableOpacity
                      key={index}
                      activeOpacity={0.85}
                      onPress={() => openViewerAt(index)}
                    >
                      <Image
                        source={{ uri }}
                        className="h-20 w-20 rounded-xl bg-slate-100 dark:bg-slate-800"
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              ) : (
                <View
                  className={`h-16 flex-row items-center rounded-xl px-4 ${
                    isLost ? 'bg-rose-50 dark:bg-rose-950' : 'bg-[#EEF0FA] dark:bg-slate-800'
                  }`}
                >
                  {isLost ? (
                    <Search size={20} color={isDark ? '#FB7185' : '#E11D48'} />
                  ) : (
                    <PackageSearch size={20} color={navyIcon} />
                  )}
                  <Text
                    className={`ml-3 text-xs font-semibold ${
                      isLost
                        ? 'text-rose-400 dark:text-rose-300'
                        : 'text-[#5B647A] dark:text-slate-400'
                    }`}
                  >
                    No photo attached
                  </Text>
                </View>
              )}
            </View>

            <View className="px-5 pt-4">
              <Text className="text-xl font-extrabold leading-6 text-[#16233F] dark:text-slate-100">
                {item.title}
              </Text>

              <Text className="mt-1.5 text-[13px] font-semibold text-slate-400">
                {item.type} • {item.category}
              </Text>

              {/* Status: a colored pill plus one plain-language sentence,
                  rather than a bare label — tells the person what the
                  status actually means for them right now. */}
              <View className={`mt-4 rounded-2xl px-4 py-3 ${statusStyle.bg}`}>
                <Text className={`text-[13px] font-bold ${statusStyle.text}`}>
                  {item.status}
                </Text>
                <Text className={`mt-0.5 text-xs leading-4 ${statusStyle.text}`}>
                  {STATUS_HELPER_TEXT[item.status] || ''}
                </Text>
              </View>

              {item.status === 'Declined' && !!item.declined_remarks && (
                <View className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 dark:bg-rose-950">
                  <Text className="text-xs font-bold text-rose-700 dark:text-rose-300">Reason for decline</Text>
                  <Text className="mt-1 text-xs leading-5 text-rose-700 dark:text-rose-300">
                    {item.declined_remarks}
                  </Text>
                </View>
              )}

              {!!item.description && (
                <View className="mt-5">
                  <Text className="text-[13px] font-bold text-[#16233F] dark:text-slate-100">Description</Text>
                  <Text className="mt-1.5 text-sm leading-5 text-slate-600 dark:text-slate-400">
                    {item.description}
                  </Text>
                </View>
              )}

              {/* Details block: icon rows read like a receipt/ticket, fitting
                  the "claim ticket" nature of a lost & found item. Rendered
                  inline from the detailRows array rather than a separate
                  row component. */}
              <View className="mt-5 divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                {detailRows.map((row) =>
                  row.value ? (
                    <View key={row.label} className="flex-row items-center py-3">
                      <View className="h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                        {row.icon}
                      </View>
                      <View className="ml-3 flex-1">
                        <Text className="text-[11px] font-semibold text-slate-400">
                          {row.label}
                        </Text>
                        <Text className="mt-0.5 text-sm font-semibold text-[#16233F] dark:text-slate-100">
                          {row.value}
                        </Text>
                      </View>
                    </View>
                  ) : null
                )}
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>

      {/* Full-screen image viewer, layered as a second Modal on top of the
          sheet above rather than a separate component. Intentionally full
          screen — unlike the details sheet — since the point here is an
          unobstructed look at the photo. Starts on the tapped thumbnail
          and lets the person swipe to the others, then go back. */}
      {hasImages && (
        <Modal
          visible={viewerOpen}
          animationType="fade"
          transparent
          onRequestClose={closeViewer}
          statusBarTranslucent
        >
          <View className="flex-1 bg-black">
            <ScrollView
              ref={viewerScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={handleViewerScrollEnd}
              contentOffset={{ x: viewerStartIndex * SCREEN_WIDTH, y: 0 }}
            >
              {images.map((uri, index) => (
                <View
                  key={index}
                  style={{ width: SCREEN_WIDTH }}
                  className="items-center justify-center"
                >
                  <Image
                    source={{ uri }}
                    style={{ width: SCREEN_WIDTH, height: '100%' }}
                    resizeMode="contain"
                  />
                </View>
              ))}
            </ScrollView>

            <SafeAreaView edges={['top']} className="absolute left-0 right-0 top-0">
              <View className="flex-row items-center justify-between px-4 pt-3">
                <TouchableOpacity
                  onPress={closeViewer}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  className="h-9 w-9 items-center justify-center rounded-full bg-white/15"
                >
                  <ArrowLeft size={18} color="#FFFFFF" />
                </TouchableOpacity>

                {images.length > 1 && (
                  <View className="rounded-full bg-white/15 px-3 py-1">
                    <Text className="text-xs font-semibold text-white">
                      {viewerActiveIndex + 1} / {images.length}
                    </Text>
                  </View>
                )}
              </View>
            </SafeAreaView>
          </View>
        </Modal>
      )}
    </Modal>
  ) : null;
}