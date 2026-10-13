import React from 'react';
import { ActivityIndicator, Modal, Text, View } from 'react-native';

// Full-screen loading overlay: one dimmed backdrop and one centered card.
// Usage: <LoadingModal visible={loading} title="..." subtitle="..." />
export default function LoadingModal({
  visible,
  title = 'Loading...',
  subtitle,
}) {
  return (
    <Modal
      visible={Boolean(visible)}
      transparent
      animationType="fade"
      statusBarTranslucent
      // Loading can't be dismissed with the Android back button.
      onRequestClose={() => {}}
    >
      {/* The backdrop is the only full-size view, so nothing else can show behind the card. */}
      <View className="flex-1 items-center justify-center bg-[#1b2061]/45 px-6">
        <View className="w-[78%] items-center rounded-2xl bg-white px-6 py-7">
          <ActivityIndicator size="large" color="#1b2061" />
          <Text className="mt-4 text-center text-base font-bold text-[#1b2061]">
            {title}
          </Text>
          {subtitle ? (
            <Text className="mt-1 text-center text-sm text-[#666]">
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}